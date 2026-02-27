/**
 * Playwright browser management for 1C web client.
 *
 * Maintains a single browser instance across MCP tool calls.
 * Handles connection, navigation, waiting, screenshots.
 */
import { chromium } from 'playwright';
import {
  readSectionsScript, readTabsScript, readCommandsScript,
  readFormScript, navigateSectionScript, openCommandScript,
  findClickTargetScript, findFieldButtonScript, readSubmenuScript,
  resolveFieldsScript, getFormStateScript,
  detectFormScript, readTableScript, checkErrorsScript,
  switchTabScript
} from './dom.mjs';

let browser = null;
let page = null;
let sessionPrefix = null; // e.g. "http://localhost:8081/bpdemo/ru_RU"
let seanceId = null;

const LOAD_TIMEOUT = 60000;
const INIT_TIMEOUT = 60000;
const ACTION_WAIT = 2000;   // fallback minimum wait
const MAX_WAIT = 10000;     // max wait for stability
const POLL_INTERVAL = 200;  // polling interval
const STABLE_CYCLES = 3;    // consecutive stable cycles needed

/** Check if browser is connected and page is usable. */
export function isConnected() {
  return browser?.isConnected() && page && !page.isClosed();
}

/**
 * Open browser and navigate to 1C web client URL.
 * Waits for initialization (themesCell_theme_0 selector) and attempts to close startup modals.
 */
export async function connect(url) {
  if (isConnected()) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
  } else {
    browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
    const context = await browser.newContext({ viewport: null });
    page = await context.newPage();

    // Capture seanceId from network requests for graceful logout
    sessionPrefix = null;
    seanceId = null;
    page.on('request', req => {
      if (seanceId) return;
      const m = req.url().match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/e1cib\/.+[?&]seanceId=([^&]+)/);
      if (m) { sessionPrefix = m[1]; seanceId = m[2]; }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
  }

  // Wait for 1C to initialize — detect by section panel appearance
  try {
    await page.waitForSelector('#themesCell_theme_0', { timeout: INIT_TIMEOUT });
  } catch {
    // Fallback: wait fixed time if selector doesn't appear (e.g. login page)
    await page.waitForTimeout(5000);
  }

  // Try to close startup modals (Путеводитель etc.)
  await closeModals();

  return await getPageState();
}

/**
 * Gracefully terminate the 1C session and close the browser.
 * Sends POST /e1cib/logout to release the license before closing.
 */
export async function disconnect() {
  if (browser) {
    // Graceful logout — release the 1C license
    if (page && !page.isClosed() && seanceId && sessionPrefix) {
      try {
        const logoutUrl = `${sessionPrefix}/e1cib/logout?seanceId=${seanceId}`;
        await page.evaluate(async (url) => {
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"root":{}}'
          });
        }, logoutUrl);
        await page.waitForTimeout(1000);
      } catch {}
    }
    await browser.close().catch(() => {});
    browser = null;
    page = null;
    sessionPrefix = null;
    seanceId = null;
  }
}

/**
 * Attach to a running browser server via CDP WebSocket.
 * Sets module state so all functions (getFormState, clickElement, etc.) work.
 */
export async function attach(wsEndpoint, session = {}) {
  if (isConnected()) return;
  browser = await chromium.connect(wsEndpoint);
  const ctx = browser.contexts()[0];
  page = ctx?.pages()[0];
  if (!page) throw new Error('No page found in browser');
  sessionPrefix = session.sessionPrefix || null;
  seanceId = session.seanceId || null;
}

/**
 * Detach from browser without closing it.
 * Returns session state for persistence.
 */
export function detach() {
  const session = { sessionPrefix, seanceId };
  browser = null;
  page = null;
  sessionPrefix = null;
  seanceId = null;
  return session;
}

/** Get current session state (for saving between reconnections). */
export function getSession() {
  return { sessionPrefix, seanceId };
}

/**
 * Close startup modals and guide tabs.
 * Strategy: Escape → click default buttons → close extra tabs → repeat.
 */
async function closeModals() {
  for (let attempt = 0; attempt < 5; attempt++) {
    // 1. Press Escape to dismiss any popup/modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // 2. Try clicking default "Закрыть"/"OK" buttons
    const clicked = await page.evaluate(`(() => {
      const btns = [...document.querySelectorAll('a.press.pressDefault')].filter(el => el.offsetWidth > 0);
      for (const btn of btns) {
        const text = (btn.innerText?.trim() || '').toLowerCase();
        if (['закрыть', 'ok', 'ок', 'нет', 'отмена'].includes(text)) {
          btn.click();
          return text;
        }
      }
      return null;
    })()`);
    if (clicked) { await page.waitForTimeout(1000); continue; }

    // 3. Close extra tabs (Путеводитель etc.) via openedClose button
    const tabClosed = await page.evaluate(`(() => {
      const btn = document.querySelector('.openedClose');
      if (btn && btn.offsetWidth > 0) { btn.click(); return true; }
      return false;
    })()`);
    if (tabClosed) { await page.waitForTimeout(1000); continue; }

    // Nothing to close — done
    break;
  }
}

/**
 * Smart wait: poll until DOM is stable and no loading indicators are visible.
 * Checks: form number change, loading indicators, DOM stability.
 * @param {number|null} previousFormNum — form number before the action (null = don't check)
 */
async function waitForStable(previousFormNum = null) {
  let stableCount = 0;
  let lastSnapshot = '';
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT) {
    await page.waitForTimeout(POLL_INTERVAL);

    // Check for loading indicators
    const status = await page.evaluate(`(() => {
      const loading = document.querySelector('.loadingImage, .waitCurtain, .progressBar');
      const isLoading = loading && loading.offsetWidth > 0;
      const formCount = document.querySelectorAll('input.editInput[id], a.press[id]').length;
      return { isLoading, formCount };
    })()`);

    if (status.isLoading) {
      stableCount = 0;
      continue;
    }

    // Check DOM stability by comparing element count snapshot
    const snapshot = String(status.formCount);
    if (snapshot === lastSnapshot) {
      stableCount++;
    } else {
      stableCount = 0;
      lastSnapshot = snapshot;
    }

    // If form was expected to change, ensure it did
    if (previousFormNum !== null && stableCount === 1) {
      const currentForm = await page.evaluate(detectFormScript());
      if (currentForm !== previousFormNum) {
        // Form changed — still wait for stability
      }
    }

    if (stableCount >= STABLE_CYCLES) return;
  }
  // Fallback: max wait reached
}

/**
 * Poll until a JS expression returns truthy, or timeout (ms) expires.
 * Resolves early — typically within 100-300ms instead of fixed delays.
 */
async function waitForCondition(evalScript, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await page.evaluate(evalScript);
    if (result) return result;
    await page.waitForTimeout(100);
  }
  return null;
}

/**
 * Check for validation errors / diagnostics after an action.
 * Detects: inline balloon tooltip, messages panel, modal error dialog.
 * Returns { balloon, messages[], modal } or null.
 */
async function checkForErrors() {
  return await page.evaluate(checkErrorsScript());
}

/** Get the raw Playwright page object (for advanced scripting in skill mode). */
export function getPage() {
  ensureConnected();
  return page;
}

/**
 * Get current page state: active section, tabs.
 * Combined into a single evaluate call.
 */
export async function getPageState() {
  ensureConnected();
  const { sections, tabs } = await page.evaluate(`({
    sections: ${readSectionsScript()},
    tabs: ${readTabsScript()}
  })`);
  const activeSection = sections.find(s => s.active)?.name || null;
  const activeTab = tabs.find(t => t.active)?.name || null;
  return { activeSection, activeTab, sections, tabs };
}

/** Read section panel + commands in a single evaluate call. */
export async function getSections() {
  ensureConnected();
  const { sections, commands } = await page.evaluate(`({
    sections: ${readSectionsScript()},
    commands: ${readCommandsScript()}
  })`);
  const activeSection = sections.find(s => s.active)?.name || null;
  return { activeSection, sections, commands };
}

/** Navigate to a section by name. Returns new state with commands. */
export async function navigateSection(name) {
  ensureConnected();
  const result = await page.evaluate(navigateSectionScript(name));
  if (result?.error) return result;

  await waitForStable();
  const { sections, commands } = await page.evaluate(`({
    sections: ${readSectionsScript()},
    commands: ${readCommandsScript()}
  })`);
  return { navigated: result, sections, commands };
}

/** Read commands of the current section. */
export async function getCommands() {
  ensureConnected();
  return await page.evaluate(readCommandsScript());
}

/** Open a command from function panel by name. Returns new form state. */
export async function openCommand(name) {
  ensureConnected();
  const formBefore = await page.evaluate(detectFormScript());
  const result = await page.evaluate(openCommandScript(name));
  if (result?.error) return result;

  await waitForStable(formBefore);
  const state = await getFormState();
  const err = await checkForErrors();
  if (err) state.errors = err;
  return state;
}

/** Switch to an open tab by name (fuzzy match). Returns updated form state. */
export async function switchTab(name) {
  ensureConnected();
  const result = await page.evaluate(switchTabScript(name));
  if (result?.error) return result;
  await waitForStable();
  return await getFormState();
}

/** Read current form state. Single evaluate call via combined script. */
export async function getFormState() {
  ensureConnected();
  const state = await page.evaluate(getFormStateScript());
  const err = await checkForErrors();
  if (err) {
    state.errors = err;
    if (err.confirmation) {
      state.confirmation = err.confirmation;
      state.hint = 'Call web_click with a button name (e.g. "Да", "Нет", "Отмена") to respond';
    }
  }
  return state;
}

/** Read structured table data with pagination. Returns columns, rows, total count. */
export async function readTable({ maxRows = 20, offset = 0 } = {}) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };
  return await page.evaluate(readTableScript(formNum, { maxRows, offset }));
}

/**
 * Pick a value from an opened selection form: search + dblclick matching row.
 *
 * Strategy:
 *   1. Find search input in selection form
 *   2. Clipboard paste search text (trusted event, more reliable than page.fill)
 *   3. Press Enter to apply search filter
 *   4. Wait for grid to update, then score rows
 *   5. Dblclick best match; if form persists (hit a folder), try Enter as fallback
 *
 * @returns {{ field, ok, method }} or {{ field, error, message }}
 */
async function pickFromSelectionForm(selFormNum, fieldName, text, origFormNum) {
  // 1. Find search input in the selection form
  const searchInputId = await page.evaluate(`(() => {
    const p = 'form${selFormNum}_';
    const inputs = [...document.querySelectorAll('input.editInput[id^="' + p + '"]')].filter(el => el.offsetWidth > 0);
    // Prefer field with "search"/"поиск" in its ID
    let searchInput = inputs.find(el => /поиск|search|строкапоиска|find/i.test(el.id));
    if (!searchInput && inputs.length > 0) searchInput = inputs[0];
    return searchInput ? searchInput.id : null;
  })()`);

  // 2. Fill search field via clipboard paste (more reliable than page.fill for 1C)
  if (searchInputId && text) {
    await page.click(`[id="${searchInputId}"]`);
    await page.waitForTimeout(300);
    // Select all existing text and replace with paste
    await page.keyboard.press('Control+A');
    await page.evaluate(`navigator.clipboard.writeText(${JSON.stringify(text)})`);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);
    // Apply search
    await page.keyboard.press('Enter');
    // Wait for search results: loading indicator + grid row count stabilization
    await waitForStable();
    // Extra: wait for grid content to settle (loader inside grid, async row fetch)
    let gridStable = 0, lastRowCount = -1;
    for (let i = 0; i < 15 && gridStable < 3; i++) {
      await page.waitForTimeout(POLL_INTERVAL);
      const rc = await page.evaluate(`(() => {
        const p = 'form${selFormNum}_';
        const grid = document.querySelector('[id^="' + p + '"].grid, [id^="' + p + '"] .grid');
        if (!grid) return -1;
        const loading = grid.querySelector('.loadingImage, .waitCurtain, .progressBar');
        if (loading && loading.offsetWidth > 0) return -2;
        const body = grid.querySelector('.gridBody');
        return body ? body.querySelectorAll('.gridLine').length : 0;
      })()`);
      if (rc === -2) { gridStable = 0; continue; } // still loading
      if (rc === lastRowCount) { gridStable++; } else { gridStable = 0; lastRowCount = rc; }
    }
  }

  // 3. Read grid and find best matching row
  const rowTarget = await page.evaluate(`(() => {
    const p = 'form${selFormNum}_';
    const grid = document.querySelector('[id^="' + p + '"].grid, [id^="' + p + '"] .grid');
    if (!grid) return null;
    const body = grid.querySelector('.gridBody');
    if (!body) return null;
    const lines = [...body.querySelectorAll('.gridLine')];
    if (!lines.length) return { rowCount: 0 };
    const target = ${JSON.stringify(text.toLowerCase())};

    // Score each row: exact cell match > row includes > partial cell match
    let bestLine = null, bestScore = 0;
    for (const line of lines) {
      const boxes = [...line.querySelectorAll('.gridBoxText')].map(b => b.innerText?.trim() || '');
      const rowText = boxes.join(' ').toLowerCase();
      let score = 0;
      if (boxes.some(b => b.toLowerCase() === target)) score = 3;           // exact cell match
      else if (rowText === target) score = 3;                                // exact row match
      else if (boxes.some(b => b.toLowerCase().includes(target))) score = 2; // cell includes target
      else if (rowText.includes(target)) score = 2;                          // row includes target
      else if (target.includes(boxes[0]?.toLowerCase())) score = 1;          // target includes first cell
      if (score > bestScore) { bestScore = score; bestLine = line; }
    }

    // If search was applied and only 1 row — pick it even without text match
    if (!bestLine && lines.length === 1) {
      bestLine = lines[0]; bestScore = 1;
    }
    if (!bestLine || bestScore === 0) return { rowCount: lines.length, score: 0 };
    const r = bestLine.getBoundingClientRect();
    return { rowCount: lines.length, score: bestScore,
      x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);

  if (rowTarget?.x && rowTarget.score > 0) {
    // 4. Dblclick the matched row
    await page.mouse.dblclick(rowTarget.x, rowTarget.y);
    await waitForStable(selFormNum);

    // Verify selection form closed
    const stillOpen = await page.evaluate(`(() => {
      const p = 'form${selFormNum}_';
      return [...document.querySelectorAll('[id^="' + p + '"]')].some(el => el.offsetWidth > 0);
    })()`);
    if (stillOpen) {
      // Dblclick may have opened a folder — try Enter to select current row
      await page.keyboard.press('Enter');
      await waitForStable(selFormNum);

      // Still open? Close and report
      const stillOpen2 = await page.evaluate(`(() => {
        const p = 'form${selFormNum}_';
        return [...document.querySelectorAll('[id^="' + p + '"]')].some(el => el.offsetWidth > 0);
      })()`);
      if (stillOpen2) {
        await page.keyboard.press('Escape');
        await waitForStable();
      }
    }

    // Check for 1C error modals after selection
    const err = await page.evaluate(checkErrorsScript());
    if (err?.modal) {
      try {
        const btn = await page.$('a.press.pressDefault');
        if (btn) { await btn.click(); await page.waitForTimeout(500); }
      } catch { /* OK */ }
    }
    return { field: fieldName, ok: true, method: 'form' };
  }

  // 5. No matching row or grid empty — close and report error
  await page.keyboard.press('Escape');
  await waitForStable();
  return { field: fieldName, error: 'not_found',
    message: 'No matches in selection form for "' + text + '"' +
      (rowTarget?.rowCount ? ' (' + rowTarget.rowCount + ' rows checked)' : ' (grid empty)') };
}

/**
 * Fill a reference field via clipboard paste + 1C autocomplete.
 *
 * Strategy:
 *   1. Clear field if it has a value (Shift+F4 — native 1C mechanism, no JS errors)
 *   2. Clipboard paste text (Ctrl+V = trusted event, triggers real 1C autocomplete)
 *   3. Check editDropDown for autocomplete results → click match or Tab to resolve
 *   4. Verify result: resolved → ok, not found → clear + error
 *
 * Clipboard paste was chosen because:
 *   - Ctrl+V produces trusted browser events that 1C respects for autocomplete
 *   - page.fill() + synthetic keydown/keyup only triggers hints, not real search
 *   - keyboard.type() garbles Cyrillic on some fields
 *
 * @returns {{ field, ok?, method?, error?, value?, message?, available? }}
 */
async function fillReferenceField(selector, fieldName, value, formNum) {
  const text = String(value);
  const escapedSel = selector.replace(/'/g, "\\'");

  // Helper: dismiss 1C error modal if present
  async function dismissErrors() {
    const err = await checkForErrors();
    if (err?.modal) {
      try {
        const btn = await page.$('a.press.pressDefault');
        if (btn) { await btn.click(); await page.waitForTimeout(500); }
      } catch { /* OK */ }
      return err;
    }
    return null;
  }

  // Helper: detect new forms opened above the current one
  async function detectNewForm() {
    return page.evaluate(`(() => {
      const forms = {};
      document.querySelectorAll('input.editInput[id], a.press[id]').forEach(el => {
        if (el.offsetWidth === 0) return;
        const m = el.id.match(/^form(\\d+)_/);
        if (m) forms[m[1]] = true;
      });
      const nums = Object.keys(forms).map(Number).filter(n => n > ${formNum});
      return nums.length > 0 ? Math.max(...nums) : null;
    })()`);
  }

  // Helper: clear the field using Shift+F4 (native 1C mechanism)
  async function clearField() {
    try {
      await page.click(selector, { timeout: 3000 });
      await page.keyboard.press('Shift+F4');
      await page.waitForTimeout(300);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
    } catch { /* OK */ }
  }

  // Helper: check for "not in list" cloud popup (1C shows positioned div with "нет в списке")
  async function checkNotInListCloud() {
    return page.evaluate(`(() => {
      const divs = document.querySelectorAll('div');
      for (const el of divs) {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
        const style = getComputedStyle(el);
        if (style.position !== 'absolute' && style.position !== 'fixed') continue;
        const z = parseInt(style.zIndex) || 0;
        if (z < 100) continue;
        if ((el.innerText || '').includes('нет в списке')) return true;
      }
      return false;
    })()`);
  }

  // 0. Dismiss any leftover error modal from a previous operation
  await dismissErrors();

  // 1. Focus (handle surface/modal overlay from previous interaction)
  try {
    await page.click(selector);
  } catch (e) {
    if (e.message.includes('intercepts pointer events')) {
      // Try force click first (no side effects), then Escape as fallback
      try {
        await page.click(selector, { force: true });
      } catch (e2) {
        if (e2.message.includes('intercepts pointer events')) {
          await dismissErrors();
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          await page.click(selector);
        } else throw e2;
      }
    } else throw e;
  }

  // 2. If field already has a value, clear using Shift+F4 (native 1C mechanism).
  const currentVal = await page.evaluate(`document.querySelector('${escapedSel}')?.value || ''`);
  if (currentVal) {
    await page.keyboard.press('Shift+F4');
    await page.waitForTimeout(500);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    // Refocus
    await page.click(selector);
  }

  // 3. Paste text via clipboard (trusted event → triggers real 1C autocomplete)
  await page.evaluate(`navigator.clipboard.writeText(${JSON.stringify(text)})`);
  await page.keyboard.press('Control+V');
  // Smart wait: poll for EDD dropdown or "not in list" cloud (max 2s)
  await waitForCondition(`(() => {
    const edd = document.getElementById('editDropDown');
    if (edd && edd.offsetWidth > 0) return true;
    for (const el of document.querySelectorAll('div')) {
      if (el.offsetWidth === 0) continue;
      const s = getComputedStyle(el);
      if ((s.position === 'absolute' || s.position === 'fixed') &&
          (parseInt(s.zIndex) || 0) >= 100 && (el.innerText || '').includes('нет в списке')) return true;
    }
    return false;
  })()`, ACTION_WAIT);

  // 4. Check editDropDown for autocomplete suggestions
  const eddState = await page.evaluate(`(() => {
    const edd = document.getElementById('editDropDown');
    if (!edd || edd.offsetWidth === 0) return { visible: false };
    const eddTexts = [...edd.querySelectorAll('.eddText')].filter(el => el.offsetWidth > 0);
    return {
      visible: true,
      items: eddTexts.map(el => {
        const r = el.getBoundingClientRect();
        return { name: el.innerText?.trim() || '', x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })
    };
  })()`);

  if (eddState.visible && eddState.items?.length > 0) {
    const target = text.toLowerCase();
    // Separate real matches from "Создать:" items
    const candidates = eddState.items.filter(i => !i.name.startsWith('Создать'));

    if (candidates.length > 0) {
      // Find best match (items have format "Name (Code)" — match against name part)
      let match = candidates.find(i => {
        const name = i.name.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
        return name === target;
      });
      if (!match) match = candidates.find(i => i.name.toLowerCase().includes(target));
      if (!match) match = candidates.find(i => {
        const name = i.name.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
        return name.includes(target) || target.includes(name);
      });

      if (match) {
        await page.mouse.click(match.x, match.y);
        await waitForStable();
        await dismissErrors(); // business logic errors (e.g. СПАРК) may appear async
        return { field: fieldName, ok: true, method: 'dropdown',
          value: match.name.replace(/\s*\([^)]*\)\s*$/, '') };
      }
      // Candidates exist but none match — report them
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await clearField();
      return { field: fieldName, error: 'not_matched',
        available: candidates.map(i => i.name.replace(/\s*\([^)]*\)\s*$/, '')) };
    }

    // Only "Создать:" items — no existing matches
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await clearField();
    return { field: fieldName, error: 'not_found',
      message: 'No existing values match "' + text + '"' };
  }

  // 4b. No edd — check for "not in list" cloud that may have appeared during paste
  if (await checkNotInListCloud()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await clearField();
    return { field: fieldName, error: 'not_found',
      message: 'Value "' + text + '" not found (not in list)' };
  }

  // 5. No edd at all — press Tab to trigger direct resolve
  await page.keyboard.press('Tab');
  await waitForStable();
  await dismissErrors();

  // 5x. Check for "not in list" cloud popup after Tab
  if (await checkNotInListCloud()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await clearField();
    return { field: fieldName, error: 'not_found',
      message: 'Value "' + text + '" not found (not in list)' };
  }

  // 5a. New form opened? (creation form = value not found)
  const newForm = await detectNewForm();
  if (newForm !== null) {
    await page.keyboard.press('Escape');
    await waitForStable();
    await clearField();
    return { field: fieldName, error: 'not_found',
      message: 'Value "' + text + '" not found' };
  }

  // 5b. Dropdown after Tab?
  const popup = await page.evaluate(readSubmenuScript());
  if (Array.isArray(popup) && popup.length > 0) {
    const realItems = popup.filter(i => !i.name.startsWith('Создать'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await clearField();
    if (realItems.length > 0) {
      return { field: fieldName, error: 'ambiguous',
        message: 'Multiple matches for "' + text + '"',
        available: realItems.map(i => i.name.replace(/\s*\([^)]*\)\s*$/, '')) };
    }
    return { field: fieldName, error: 'not_found',
      message: 'Value "' + text + '" not found' };
  }

  // 5c. Check final value
  const finalVal = await page.evaluate(`document.querySelector('${escapedSel}')?.value || ''`);
  if (!finalVal) {
    // 6. Last resort: try F4 to open selection form and pick from there
    try {
      await page.click(selector);
      await page.waitForTimeout(300);
    } catch { /* OK — field may be unfocused */ }
    await page.keyboard.press('F4');
    await page.waitForTimeout(ACTION_WAIT);

    const selFormNum = await detectNewForm();
    if (selFormNum !== null) {
      const pickResult = await pickFromSelectionForm(selFormNum, fieldName, text, formNum);
      if (pickResult.ok) return pickResult;
      // pickFromSelectionForm already closed the form on error
    }

    return { field: fieldName, error: 'not_found',
      message: 'Value "' + text + '" not found (field is empty)' };
  }

  return { field: fieldName, ok: true, method: 'typeahead', value: finalVal };
}


/** Fill fields on the current form via Playwright page.fill(). Returns fill results + updated form. */
export async function fillFields(fields) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };

  // Resolve field names to element IDs
  const resolved = await page.evaluate(resolveFieldsScript(formNum, fields));
  const results = [];

  for (const r of resolved) {
    if (r.error) {
      results.push(r);
      continue;
    }
    try {
      const selector = `[id="${r.inputId}"]`;
      if (r.isCheckbox) {
        // Checkbox: compare desired with current, toggle if mismatch
        const desired = String(fields[r.field]).toLowerCase();
        const wantChecked = ['true', '1', 'да', 'yes', 'on'].includes(desired);
        if (wantChecked !== r.checked) {
          await page.click(selector);
          await waitForStable();
        }
        results.push({ field: r.field, ok: true, value: String(wantChecked), method: 'toggle' });
      } else if (r.isRadio) {
        // Radio button: find option by label (fuzzy match) and click it
        const desired = String(fields[r.field]).toLowerCase();
        const opt = r.options.find(o => o.label.toLowerCase() === desired)
          || r.options.find(o => o.label.toLowerCase().includes(desired));
        if (opt) {
          // Option 0 = base element (no suffix), options 1+ = #N#radio
          const radioId = opt.index === 0 ? r.inputId : `${r.inputId}#${opt.index}#radio`;
          await page.click(`[id="${radioId}"]`);
          await waitForStable();
          results.push({ field: r.field, ok: true, value: opt.label, method: 'radio' });
        } else {
          results.push({ field: r.field, error: 'option_not_found', available: r.options.map(o => o.label) });
        }
      } else if (r.hasSelect) {
        // Reference field: DLB-based selection (dropdown or selection form)
        const refResult = await fillReferenceField(selector, r.field, fields[r.field], formNum);
        results.push(refResult);
      } else {
        // Plain field: clipboard paste + Tab to commit
        // page.fill() sets DOM value but doesn't trigger 1C input events;
        // clipboard paste (Ctrl+V) is a trusted event that 1C processes correctly.
        await page.click(selector);
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+A');
        await page.evaluate(`navigator.clipboard.writeText(${JSON.stringify(String(fields[r.field]))})`);
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(300);
        await page.keyboard.press('Tab');
        await waitForStable();
        results.push({ field: r.field, ok: true, value: String(fields[r.field]), method: 'paste' });
      }
    } catch (e) {
      results.push({ field: r.field, error: e.message });
    }
  }

  const formData = await page.evaluate(readFormScript(formNum));
  return { filled: results, form: formData };
}

/** Click a button/hyperlink/tab on the current form. Use {dblclick: true} to double-click (open items from lists). */
export async function clickElement(text, { dblclick } = {}) {
  ensureConnected();

  // First check if there's a confirmation dialog — click matching button
  const pending = await checkForErrors();
  if (pending?.confirmation) {
    const btnResult = await page.evaluate(`(() => {
      const norm = s => s?.trim().replace(/\\u00a0/g, ' ') || '';
      const target = ${JSON.stringify(text.toLowerCase())};
      const btns = [...document.querySelectorAll('a.press.pressButton')].filter(el => el.offsetWidth > 0);
      let best = btns.find(el => norm(el.innerText).toLowerCase() === target);
      if (!best) best = btns.find(el => norm(el.innerText).toLowerCase().includes(target));
      if (best) {
        const r = best.getBoundingClientRect();
        return { name: norm(best.innerText), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
      }
      return { error: 'not_found', available: btns.map(el => norm(el.innerText)).filter(Boolean) };
    })()`);
    if (btnResult?.error) return btnResult;
    await page.mouse.click(btnResult.x, btnResult.y);
    await waitForStable();
    const state = await getFormState();
    state.clicked = { kind: 'confirmation', name: btnResult.name };
    return state;
  }

  // Check if there's an open popup — if so, try to click inside it
  const popupItems = await page.evaluate(readSubmenuScript());
  if (Array.isArray(popupItems) && popupItems.length > 0) {
    const target = text.toLowerCase();
    let found = popupItems.find(i => i.name.toLowerCase() === target);
    if (!found) found = popupItems.find(i => i.name.toLowerCase().includes(target));
    if (found) {
      // submenuArrow items (group headers like "Создать", "Печать") — hover to expand nested submenu
      if (found.kind === 'submenuArrow') {
        // page.hover(selector) is more reliable than page.mouse.move(x,y) —
        // some submenu groups don't expand with plain mouse.move
        if (found.id) {
          await page.hover(`[id="${found.id}"]`);
        } else {
          await page.mouse.move(found.x, found.y);
        }
        await page.waitForTimeout(ACTION_WAIT);
        const nestedItems = await page.evaluate(readSubmenuScript());
        const state = await getFormState();
        state.clicked = { kind: 'submenuArrow', name: found.name };
        if (Array.isArray(nestedItems)) {
          state.submenu = nestedItems.map(i => i.name);
          state.hint = 'Call web_click again with a submenu item name to select it';
        }
        return state;
      }
      // Regular submenu/dropdown items — trusted events required.
      // Use mouse.click(x,y) when in viewport; use :visible selector for clipped items
      // (same ID can exist hidden in parent cloud AND visible in nested cloud).
      const vpHeight = await page.evaluate('window.innerHeight');
      if (found.x && found.y && found.y > 0 && found.y < vpHeight) {
        await page.mouse.click(found.x, found.y);
      } else if (found.id) {
        await page.click(`[id="${found.id}"]:visible`);
      } else if (found.x && found.y) {
        await page.mouse.click(found.x, found.y);
      }
      await waitForStable();
      const state = await getFormState();
      state.clicked = { kind: 'popupItem', name: found.name };
      const err = await checkForErrors();
      if (err) state.errors = err;
      return state;
    }
    // No match in popup — fall through to form elements
  }

  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };

  // Find the target element ID
  const target = await page.evaluate(findClickTargetScript(formNum, text));
  if (target?.error) return target;

  // Grid row targets — use coordinate click (single or double)
  if (target.kind === 'gridGroup' || target.kind === 'gridParent') {
    // Dblclick to enter group / go up to parent
    await page.mouse.dblclick(target.x, target.y);
    await waitForStable(formNum);
    const state = await getFormState();
    state.clicked = { kind: target.kind, name: target.name };
    return state;
  }
  if (target.kind === 'gridTreeNode') {
    // Tree node: click the tree expand/collapse icon [tree="true"] for toggle
    const treeIconCoords = await page.evaluate(`(() => {
      const p = ${JSON.stringify(`form${formNum}_`)};
      const grid = document.querySelector('[id^="' + p + '"].grid');
      const body = grid?.querySelector('.gridBody');
      if (!body) return null;
      const lines = [...body.querySelectorAll('.gridLine')];
      for (const line of lines) {
        const textBoxes = [...line.querySelectorAll('.gridBoxText')].filter(b => b.offsetWidth > 0);
        const text = textBoxes[0]?.innerText?.trim() || '';
        if (text.toLowerCase() === ${JSON.stringify(target.name.toLowerCase())}) {
          const treeIcon = line.querySelector('.gridBoxImg [tree="true"]');
          if (treeIcon) {
            const r = treeIcon.getBoundingClientRect();
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          }
        }
      }
      return null;
    })()`);
    if (treeIconCoords) {
      await page.mouse.click(treeIconCoords.x, treeIconCoords.y);
    } else {
      // Fallback: select row and use +/- keys
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(300);
      await page.keyboard.press('NumpadAdd');
    }
    await waitForStable(formNum);
    const state = await getFormState();
    state.clicked = { kind: 'gridTreeNode', name: target.name };
    state.hint = 'Tree node toggled. Use web_table to see updated tree.';
    return state;
  }
  if (target.kind === 'gridRow') {
    if (dblclick) {
      await page.mouse.dblclick(target.x, target.y);
      await waitForStable();
      const state = await getFormState();
      state.clicked = { kind: 'gridRow', name: target.name, dblclick: true };
      return state;
    }
    await page.mouse.click(target.x, target.y);
    await waitForStable();
    const state = await getFormState();
    state.clicked = { kind: 'gridRow', name: target.name };
    return state;
  }

  // Build selector: tabs without ID use [data-content], others use [id]
  const selector = (target.kind === 'tab' && !target.id)
    ? `[data-content="${target.name}"]`
    : `[id="${target.id}"]`;

  // Use Playwright click for proper mousedown/mouseup events
  try {
    await page.click(selector, { timeout: 5000 });
  } catch (clickErr) {
    if (clickErr.message.includes('intercepts pointer events')) {
      // Surface overlay intercepts — try force click first (no side effects),
      // then Escape + retry as fallback (Escape can trigger save dialogs on forms)
      try {
        await page.click(selector, { force: true, timeout: 5000 });
      } catch (clickErr2) {
        if (clickErr2.message.includes('intercepts pointer events')) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          await page.click(selector, { timeout: 5000 });
        } else {
          throw clickErr2;
        }
      }
    } else {
      throw clickErr;
    }
  }

  // If submenu button — read popup items and return them as hints
  if (target.kind === 'submenu') {
    await page.waitForTimeout(ACTION_WAIT);
    const submenuItems = await page.evaluate(readSubmenuScript());
    const state = await getFormState();
    state.clicked = { kind: 'submenu', name: target.name };
    if (Array.isArray(submenuItems)) {
      state.submenu = submenuItems.map(i => i.name);
      state.hint = 'Call web_click again with a submenu item name to select it';
    }
    return state;
  }

  await waitForStable(formNum);

  // Check if the click opened a popup/submenu (split buttons like "Создать на основании")
  const openedPopup = await page.evaluate(readSubmenuScript());
  if (Array.isArray(openedPopup) && openedPopup.length > 0) {
    const state = await getFormState();
    state.clicked = { kind: 'submenu', name: target.name };
    state.submenu = openedPopup.map(i => i.name);
    state.hint = 'Call web_click again with a submenu item name to select it';
    return state;
  }

  // Form may have changed — re-detect
  const state = await getFormState();
  state.clicked = { kind: target.kind, name: target.name };
  const err = await checkForErrors();
  if (err) {
    state.errors = err;
    if (err.confirmation) {
      state.confirmation = err.confirmation;
      state.hint = 'Call web_click with a button name (e.g. "Да", "Нет", "Отмена") to respond';
    }
  }
  return state;
}

/** Close the current form/dialog via Escape. Returns new form state. If confirmation dialog appears — returns it in `confirmation` field. */
export async function closeForm() {
  ensureConnected();
  await page.keyboard.press('Escape');
  await waitForStable();
  const state = await getFormState();
  const err = await checkForErrors();
  if (err?.confirmation) {
    state.confirmation = err.confirmation;
    state.hint = 'Confirmation dialog shown. Click "Да" to confirm or "Нет" to cancel';
  }
  return state;
}

/**
 * Select a value from a reference field (compound operation).
 * Handles three patterns:
 *   A) DLB opens an inline dropdown popup — click matching item
 *   B) DLB opens dropdown with history — click "Показать все" or F4 to open selection form
 *   C) DLB opens a separate selection form directly — search + dblclick in grid
 */
export async function selectValue(fieldName, searchText) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };

  // 1. Find DLB button
  const btn = await page.evaluate(findFieldButtonScript(formNum, fieldName, 'DLB'));
  if (btn?.error) return btn;

  // Helper: detect selection form (form number > formNum)
  async function detectSelectionForm() {
    return page.evaluate(`(() => {
      const forms = {};
      document.querySelectorAll('input.editInput[id], a.press[id]').forEach(el => {
        if (el.offsetWidth === 0) return;
        const m = el.id.match(/^form(\\d+)_/);
        if (m) forms[m[1]] = true;
      });
      const nums = Object.keys(forms).map(Number).filter(n => n > ${formNum});
      return nums.length > 0 ? Math.max(...nums) : null;
    })()`);
  }

  // Helper: open selection form and pick value
  async function openFormAndPick() {
    await waitForStable(formNum);
    const selFormNum = await detectSelectionForm();
    if (selFormNum !== null) {
      const pickResult = await pickFromSelectionForm(selFormNum, btn.fieldName, searchText || '', formNum);
      const state = await getFormState();
      state.selected = { field: btn.fieldName, search: searchText || null, method: 'form' };
      if (pickResult.error) state.selected.error = pickResult.error;
      if (pickResult.message) state.selected.message = pickResult.message;
      const err = await checkForErrors();
      if (err) state.errors = err;
      return state;
    }
    return null;
  }

  // Helper: click EDD item via evaluate (bypasses div.surface overlay from DLB)
  // page.mouse.click() doesn't work here — surface intercepts pointer events.
  // Dispatching mousedown directly on the element avoids this.
  async function clickEddItem(itemName) {
    return page.evaluate(`(() => {
      const edd = document.getElementById('editDropDown');
      if (!edd || edd.offsetWidth === 0) return null;
      const target = ${JSON.stringify(itemName.toLowerCase())};
      // Search .eddText items
      for (const el of edd.querySelectorAll('.eddText')) {
        if (el.offsetWidth === 0) continue;
        const t = (el.innerText?.trim() || '').toLowerCase();
        if (t === target || t.includes(target) || target.includes(t.replace(/\\s*\\([^)]*\\)\\s*$/, ''))) {
          const r = el.getBoundingClientRect();
          const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2 };
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.dispatchEvent(new MouseEvent('click', opts));
          return el.innerText.trim();
        }
      }
      return null;
    })()`);
  }

  // Helper: click "Показать все" in EDD footer via evaluate
  async function clickShowAll() {
    return page.evaluate(`(() => {
      const edd = document.getElementById('editDropDown');
      if (!edd || edd.offsetWidth === 0) return false;
      let el = edd.querySelector('.eddBottom .hyperlink');
      if (!el || el.offsetWidth === 0) {
        const candidates = [...edd.querySelectorAll('span, div, a')]
          .filter(e => e.offsetWidth > 0 && e.children.length === 0);
        el = candidates.find(e => {
          const t = (e.innerText?.trim() || '').toLowerCase();
          return t === 'показать все' || t === 'show all';
        });
      }
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2 };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    })()`);
  }

  // 2. Click DLB
  await page.click(`[id="${btn.buttonId}"]`);
  await page.waitForTimeout(ACTION_WAIT);

  // 3A. Check if a dropdown popup appeared (inline quick selection)
  const popupItems = await page.evaluate(readSubmenuScript());
  if (Array.isArray(popupItems) && popupItems.length > 0) {
    const regularItems = popupItems.filter(i => i.kind !== 'showAll');
    const showAllItem = popupItems.find(i => i.kind === 'showAll');

    if (searchText) {
      const target = searchText.toLowerCase();
      // Try to find match among regular dropdown items
      let match = regularItems.find(i => i.name.toLowerCase() === target);
      if (!match) match = regularItems.find(i => i.name.toLowerCase().includes(target));
      if (!match) match = regularItems.find(i => {
        const name = i.name.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
        return name === target || name.includes(target) || target.includes(name);
      });

      if (match) {
        // Click via evaluate to bypass div.surface overlay
        await clickEddItem(match.name);
        await waitForStable();
        const state = await getFormState();
        state.selected = { field: btn.fieldName, search: searchText, method: 'dropdown' };
        const err = await checkForErrors();
        if (err) state.errors = err;
        return state;
      }

      // No match in dropdown — try "Показать все" to open selection form
      if (showAllItem) {
        await clickShowAll();
        const formResult = await openFormAndPick();
        if (formResult) return formResult;
      }

      // No "Показать все" — close dropdown, try F4
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Focus the field input and press F4 to open selection form
      const inputId = await page.evaluate(`(() => {
        const p = 'form${formNum}_';
        const name = ${JSON.stringify(btn.fieldName)};
        const el = document.querySelector('[id="' + p + name + '"], [id="' + p + name + '_i0"]');
        return el ? el.id : null;
      })()`);
      if (inputId) {
        await page.click(`[id="${inputId}"]`);
        await page.waitForTimeout(300);
      }
      await page.keyboard.press('F4');
      await page.waitForTimeout(ACTION_WAIT);

      const formResult = await openFormAndPick();
      if (formResult) return formResult;

      // Still nothing — report available items from original dropdown
      return { error: 'not_found', field: btn.fieldName, search: searchText,
        available: regularItems.map(i => i.name),
        message: 'No match in dropdown, could not open selection form' };
    }

    // No search text — click first regular item
    if (regularItems.length > 0) {
      await clickEddItem(regularItems[0].name);
      await waitForStable();
      const state = await getFormState();
      state.selected = { field: btn.fieldName, search: null, picked: regularItems[0].name, method: 'dropdown' };
      const err = await checkForErrors();
      if (err) state.errors = err;
      return state;
    }
  }

  // 3B. Check if a new selection form opened directly
  const selFormNum = await detectSelectionForm();
  if (selFormNum !== null) {
    const pickResult = await pickFromSelectionForm(selFormNum, btn.fieldName, searchText || '', formNum);
    const state = await getFormState();
    state.selected = { field: btn.fieldName, search: searchText || null, method: 'form' };
    if (pickResult.error) state.selected.error = pickResult.error;
    if (pickResult.message) state.selected.message = pickResult.message;
    const err = await checkForErrors();
    if (err) state.errors = err;
    return state;
  }

  // 3C. Neither popup nor form — try F4 as last resort
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const inputId = await page.evaluate(`(() => {
    const p = 'form${formNum}_';
    const name = ${JSON.stringify(btn.fieldName)};
    const el = document.querySelector('[id="' + p + name + '"], [id="' + p + name + '_i0"]');
    return el ? el.id : null;
  })()`);
  if (inputId) {
    await page.click(`[id="${inputId}"]`);
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('F4');
  await page.waitForTimeout(ACTION_WAIT);

  const formResult = await openFormAndPick();
  if (formResult) return formResult;

  return { error: 'selection_not_detected', field: btn.fieldName,
           message: 'DLB click did not open a popup or selection form' };
}

/**
 * Fill cells in the current table row via Tab navigation.
 * Grid cells are only accessible sequentially (Tab) — no random access.
 *
 * After "Добавить", 1C enters inline edit mode on the first cell.
 * All inputs in the row are created hidden (offsetWidth=0); only the active one is visible.
 * Tab moves through cells in a fixed order determined by the form configuration.
 *
 * @param {Object} fields - { fieldName: value } map (fuzzy match: "Номенклатура" → "ТоварыНоменклатура")
 * @param {Object} [options]
 * @param {string} [options.tab] - Switch to this form tab before operating
 * @param {boolean} [options.add] - Click "Добавить" to create a new row first
 * @returns {{ filled[], notFilled[]?, form }}
 */
export async function fillTableRow(fields, { tab, add, row } = {}) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };

  try {
  // 1. Switch tab if requested
  if (tab) {
    await clickElement(tab);
  }

  // 2. Add new row if requested
  if (add) {
    await clickElement('Добавить');
    // Smart wait: poll until an INPUT inside a grid gets focus
    await waitForCondition(`(() => {
      const f = document.activeElement;
      if (!f || f.tagName !== 'INPUT') return false;
      let n = f; while (n) { if (n.classList?.contains('grid')) return true; n = n.parentElement; }
      return false;
    })()`, ACTION_WAIT);
  }

  // 2b. Enter edit mode on existing row by dblclick
  if (row != null) {
    const fieldKeys = JSON.stringify(Object.keys(fields).map(k => k.toLowerCase()));
    const cellCoords = await page.evaluate(`(() => {
      const grids = [...document.querySelectorAll('.grid')].filter(el => el.offsetWidth > 0);
      const grid = grids[grids.length - 1];
      if (!grid) return { error: 'no_grid' };
      const head = grid.querySelector('.gridHead');
      const body = grid.querySelector('.gridBody');
      if (!head || !body) return { error: 'no_grid_body' };

      // Read column headers to find target column index
      const headLine = head.querySelector('.gridLine') || head;
      const cols = [];
      [...headLine.children].forEach((box, i) => {
        if (box.offsetWidth === 0) return;
        const t = box.querySelector('.gridBoxText');
        cols.push({ idx: i, text: ((t || box).innerText?.trim() || '').toLowerCase() });
      });

      const keys = ${fieldKeys};
      let targetIdx = -1;
      for (const key of keys) {
        const exact = cols.find(c => c.text === key);
        if (exact) { targetIdx = exact.idx; break; }
        const inc = cols.find(c => c.text.includes(key) || key.includes(c.text));
        if (inc) { targetIdx = inc.idx; break; }
      }

      const rows = [...body.querySelectorAll('.gridLine')];
      if (${row} >= rows.length) return { error: 'row_out_of_range', total: rows.length };
      const line = rows[${row}];
      const boxes = [...line.children].filter(b => b.offsetWidth > 0 && !b.classList.contains('gridBoxComp'));

      // Use matched column, or fall back to second visible box (skip N column)
      const box = targetIdx >= 0 ? boxes[targetIdx] : (boxes.length > 1 ? boxes[1] : boxes[0]);
      if (!box) return { error: 'no_cell' };
      const cell = box.querySelector('.gridBoxText') || box;
      const r = cell.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);

    if (cellCoords.error) return cellCoords;

    await page.mouse.dblclick(cellCoords.x, cellCoords.y);
    await page.waitForTimeout(500);

    const inEdit = await page.evaluate(`(() => {
      const f = document.activeElement;
      return f && f.tagName === 'INPUT';
    })()`);
    if (!inEdit) return { error: 'edit_mode_failed',
      message: 'Double-click on row ' + row + ' did not enter edit mode' };
  }

  // 3. Verify we're in grid edit mode (active INPUT inside a .grid)
  const editCheck = await page.evaluate(`(() => {
    const f = document.activeElement;
    if (!f || f.tagName !== 'INPUT') return { inEdit: false, tag: f?.tagName };
    let node = f;
    while (node) {
      if (node.classList?.contains('grid')) return { inEdit: true };
      node = node.parentElement;
    }
    return { inEdit: false, hint: 'input not inside grid' };
  })()`);

  if (!editCheck.inEdit) {
    return { error: 'not_in_edit_mode',
      message: 'Not in grid edit mode. Use add:true or click a cell first.' };
  }

  // 4. Prepare pending fields for fuzzy matching
  const pending = new Map();
  for (const [key, val] of Object.entries(fields)) {
    pending.set(key, { value: String(val), filled: false });
  }

  const results = [];
  const MAX_ITER = 40;
  let prevCellId = null;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Read focused element
    const cell = await page.evaluate(`(() => {
      const f = document.activeElement;
      if (!f || f.tagName !== 'INPUT') return { tag: f?.tagName || 'none' };
      return {
        tag: 'INPUT', id: f.id,
        fullName: f.id.replace(/^form\\d+_/, '').replace(/_i\\d+$/, '')
      };
    })()`);

    if (cell.tag !== 'INPUT') break; // exited edit mode

    // Stuck detection: same cell twice in a row → force Tab
    if (cell.id === prevCellId) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      prevCellId = null;
      continue;
    }
    prevCellId = cell.id;

    // Fuzzy match cell name to user field: exact → suffix → includes
    const cellLower = cell.fullName.toLowerCase();
    let matchedKey = null;
    for (const [key, info] of pending) {
      if (info.filled) continue;
      const kl = key.toLowerCase();
      if (cellLower === kl || cellLower.endsWith(kl) || cellLower.includes(kl)) {
        matchedKey = key;
        break;
      }
    }

    if (!matchedKey) {
      // Skip this cell — Tab + wait for focus to move
      const skipId = cell.id;
      await page.keyboard.press('Tab');
      await waitForCondition(`document.activeElement?.id !== '${skipId}'`, 500);
      continue;
    }

    const info = pending.get(matchedKey);
    const text = info.value;

    // === Fill this cell: clipboard paste (trusted event) ===
    await page.keyboard.press('Control+A');
    await page.evaluate(`navigator.clipboard.writeText(${JSON.stringify(text)})`);
    await page.keyboard.press('Control+V');
    // Smart wait: poll for EDD dropdown (reference) or stable input value
    await waitForCondition(`(() => {
      const edd = document.getElementById('editDropDown');
      if (edd && edd.offsetWidth > 0) return true;
      const f = document.activeElement;
      return f && f.tagName === 'INPUT' && f.value && f.value.length > 0;
    })()`, 1500);

    // Check for EDD autocomplete (indicates reference field)
    const eddItems = await page.evaluate(`(() => {
      const edd = document.getElementById('editDropDown');
      if (!edd || edd.offsetWidth === 0) return null;
      return [...edd.querySelectorAll('.eddText')]
        .filter(el => el.offsetWidth > 0)
        .map(el => el.innerText?.trim() || '');
    })()`);

    if (eddItems && eddItems.length > 0) {
      // Reference field with autocomplete — click best match
      const realItems = eddItems.filter(i => !i.startsWith('Создать'));

      if (realItems.length > 0) {
        const tgt = text.toLowerCase();
        let pick = realItems.find(i =>
          i.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase() === tgt);
        if (!pick) pick = realItems.find(i => i.toLowerCase().includes(tgt));
        if (!pick) pick = realItems[0];

        // Click EDD item via dispatchEvent (bypasses div.surface overlay)
        const pickLower = pick.toLowerCase();
        await page.evaluate(`(() => {
          const edd = document.getElementById('editDropDown');
          if (!edd) return;
          for (const el of edd.querySelectorAll('.eddText')) {
            if (el.offsetWidth === 0) continue;
            if (el.innerText.trim().toLowerCase().includes(${JSON.stringify(pickLower)})) {
              const r = el.getBoundingClientRect();
              const opts = { bubbles:true, cancelable:true,
                clientX: r.x + r.width/2, clientY: r.y + r.height/2 };
              el.dispatchEvent(new MouseEvent('mousedown', opts));
              el.dispatchEvent(new MouseEvent('mouseup', opts));
              el.dispatchEvent(new MouseEvent('click', opts));
              return;
            }
          }
        })()`);
        await waitForStable();
        info.filled = true;
        results.push({ field: matchedKey, cell: cell.fullName, ok: true,
          method: 'dropdown', value: pick.replace(/\s*\([^)]*\)\s*$/, '') });
      } else {
        // Only "Создать:" items — value not found in autocomplete
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        info.filled = true;
        results.push({ field: matchedKey, cell: cell.fullName,
          error: 'not_found', message: `No match for "${text}"` });
      }

      // Done? If so, don't Tab (avoids creating a new row after last cell)
      if ([...pending.values()].every(p => p.filled)) break;
      // Tab to move to next cell — wait for focus to change
      const afterEddId = cell.id;
      await page.keyboard.press('Tab');
      await waitForCondition(`document.activeElement?.id !== '${afterEddId}'`, 500);
      continue;
    }

    // No EDD — press Tab to commit the value, wait for focus change
    const commitId = cell.id;
    await page.keyboard.press('Tab');
    await waitForCondition(`document.activeElement?.id !== '${commitId}'`, 1000);

    // Check for "нет в списке" cloud popup (reference field, value not found)
    const notInList = await page.evaluate(`(() => {
      for (const el of document.querySelectorAll('div')) {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
        const s = getComputedStyle(el);
        if (s.position !== 'absolute' && s.position !== 'fixed') continue;
        if ((parseInt(s.zIndex) || 0) < 100) continue;
        if ((el.innerText || '').includes('нет в списке')) return true;
      }
      return false;
    })()`);

    if (notInList) {
      // Cloud has "Показать все" link — try to open selection form via it
      const clickedShowAll = await page.evaluate(`(() => {
        for (const el of document.querySelectorAll('div')) {
          if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
          const s = getComputedStyle(el);
          if (s.position !== 'absolute' && s.position !== 'fixed') continue;
          if ((parseInt(s.zIndex) || 0) < 100) continue;
          if (!(el.innerText || '').includes('нет в списке')) continue;
          // Found the cloud — look for "Показать все" hyperlink inside
          const links = [...el.querySelectorAll('a, span, div')]
            .filter(e => e.offsetWidth > 0 && e.children.length === 0);
          const showAll = links.find(e => {
            const t = (e.innerText?.trim() || '').toLowerCase();
            return t === 'показать все' || t === 'show all';
          });
          if (showAll) {
            const r = showAll.getBoundingClientRect();
            const opts = { bubbles:true, cancelable:true,
              clientX: r.x + r.width/2, clientY: r.y + r.height/2 };
            showAll.dispatchEvent(new MouseEvent('mousedown', opts));
            showAll.dispatchEvent(new MouseEvent('mouseup', opts));
            showAll.dispatchEvent(new MouseEvent('click', opts));
            return true;
          }
          return false;
        }
        return false;
      })()`);

      if (clickedShowAll) {
        await waitForStable(formNum);
        // Check if selection form opened
        const selForm = await page.evaluate(`(() => {
          const forms = {};
          document.querySelectorAll('input.editInput[id], a.press[id]').forEach(el => {
            if (el.offsetWidth === 0) return;
            const m = el.id.match(/^form(\\d+)_/);
            if (m) forms[m[1]] = true;
          });
          const nums = Object.keys(forms).map(Number).filter(n => n > ${formNum});
          return nums.length > 0 ? Math.max(...nums) : null;
        })()`);

        if (selForm !== null) {
          const pickResult = await pickFromSelectionForm(selForm, matchedKey, text, formNum);
          info.filled = true;
          if (pickResult.ok) {
            results.push({ field: matchedKey, cell: cell.fullName, ok: true, method: 'form' });
            continue;
          }
          // Not found in selection form — fall through to clear + skip
          results.push({ field: matchedKey, cell: cell.fullName,
            error: pickResult.error, message: pickResult.message });
        } else {
          info.filled = true;
          results.push({ field: matchedKey, cell: cell.fullName,
            error: 'not_found', message: `Value "${text}" not in list` });
        }
      } else {
        info.filled = true;
        results.push({ field: matchedKey, cell: cell.fullName,
          error: 'not_found', message: `Value "${text}" not in list` });
      }

      // 1C won't let us Tab away from an invalid ref value.
      // Must clear the field first, then Tab to move on.
      // Escape dismisses the cloud; Ctrl+A + Delete clears the text.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      continue;
    }

    // Check for a new selection form (reference field opened selection)
    const newForm = await page.evaluate(`(() => {
      const forms = {};
      document.querySelectorAll('input.editInput[id], a.press[id]').forEach(el => {
        if (el.offsetWidth === 0) return;
        const m = el.id.match(/^form(\\d+)_/);
        if (m) forms[m[1]] = true;
      });
      const nums = Object.keys(forms).map(Number).filter(n => n > ${formNum});
      return nums.length > 0 ? Math.max(...nums) : null;
    })()`);

    if (newForm !== null) {
      // Selection form opened — search and pick
      const pickResult = await pickFromSelectionForm(newForm, matchedKey, text, formNum);
      info.filled = true;
      results.push(pickResult.ok
        ? { field: matchedKey, cell: cell.fullName, ok: true, method: 'form' }
        : { field: matchedKey, cell: cell.fullName,
            error: pickResult.error, message: pickResult.message });
      continue;
    }

    // Plain field — value committed via Tab
    info.filled = true;
    results.push({ field: matchedKey, cell: cell.fullName, ok: true, method: 'direct' });

    // All done?
    if ([...pending.values()].every(p => p.filled)) break;
    // Tab already pressed — we're on next cell
  }

  // Dismiss any leftover error modals
  const err = await checkForErrors();
  if (err?.modal) {
    try {
      const btn = await page.$('a.press.pressDefault');
      if (btn) { await btn.click(); await page.waitForTimeout(500); }
    } catch { /* OK */ }
  }

  const notFilled = [...pending].filter(([_, info]) => !info.filled).map(([key]) => key);
  const formData = await getFormState();
  const result = { filled: results };
  if (notFilled.length > 0) result.notFilled = notFilled;
  result.form = formData;
  return result;

  } catch (e) {
    const form = await getFormState().catch(() => null);
    return { error: 'fillTableRow_failed', message: e.message, form };
  }
}

/**
 * Delete a row from the current table part.
 * Single click to select the row, then Delete key to remove it.
 *
 * @param {number} row - 0-based row index to delete
 * @param {Object} [options]
 * @param {string} [options.tab] - Switch to this form tab before operating
 * @returns {{ deleted, rowsBefore, rowsAfter, form }}
 */
export async function deleteTableRow(row, { tab } = {}) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };

  // 1. Switch tab if requested
  if (tab) {
    await clickElement(tab);
    await page.waitForTimeout(500);
  }

  // 2. Find the target row and click to select it
  const cellCoords = await page.evaluate(`(() => {
    const grids = [...document.querySelectorAll('.grid')].filter(el => el.offsetWidth > 0);
    const grid = grids[grids.length - 1];
    if (!grid) return { error: 'no_grid' };
    const body = grid.querySelector('.gridBody');
    if (!body) return { error: 'no_grid_body' };
    const rows = [...body.querySelectorAll('.gridLine')];
    if (${row} >= rows.length) return { error: 'row_out_of_range', total: rows.length };
    const line = rows[${row}];
    const cells = [...line.querySelectorAll('.gridBoxText')];
    const cell = cells.length > 1 ? cells[1] : cells[0];
    if (!cell) return { error: 'no_cell' };
    const r = cell.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), total: rows.length };
  })()`);

  if (cellCoords.error) return cellCoords;

  const rowsBefore = cellCoords.total;

  // Single click to select the row
  await page.mouse.click(cellCoords.x, cellCoords.y);
  await page.waitForTimeout(300);

  // 3. Press Delete to remove the row
  await page.keyboard.press('Delete');
  await waitForStable();

  // 4. Count rows after deletion
  const rowsAfter = await page.evaluate(`(() => {
    const grids = [...document.querySelectorAll('.grid')].filter(el => el.offsetWidth > 0);
    const grid = grids[grids.length - 1];
    if (!grid) return 0;
    const body = grid.querySelector('.gridBody');
    return body ? body.querySelectorAll('.gridLine').length : 0;
  })()`);

  const formData = await getFormState();
  return { deleted: row, rowsBefore, rowsAfter, form: formData };
}

/**
 * Filter the current list by field value, or search via search bar.
 *
 * Without field: simple search via the search bar (filters by all columns, no badge).
 * With field: advanced search — clicks target column cell to auto-populate FieldSelector,
 * opens dialog (Alt+F), fills Pattern, clicks Найти. Creates a real filter badge.
 * Handles text, reference (with Tab autocomplete), and date fields automatically.
 * Multiple filters can be chained by calling filterList multiple times.
 *
 * @param {string} text - Search text or date (e.g. "Мишка", "КП00", "10.03.2016")
 * @param {object} [opts]
 * @param {string} [opts.field] - Column name for advanced search (e.g. "Наименование", "Получатель", "Дата")
 * @param {boolean} [opts.exact] - Exact match (text fields only; dates/numbers/refs always exact)
 */
export async function filterList(text, { field, exact } = {}) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };

  if (!field) {
    // --- Simple search: fill search input + Enter ---
    const searchId = await page.evaluate(`(() => {
      const p = 'form${formNum}_';
      const el = [...document.querySelectorAll('input.editInput[id^="' + p + '"]')]
        .find(el => el.offsetWidth > 0 && /Строк[аи]Поиска|SearchString/i.test(el.id));
      return el ? el.id : null;
    })()`);
    if (!searchId) return { error: 'no_search_field', message: 'No search input found on this form' };

    await page.click(`[id="${searchId}"]`);
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+A');
    await page.evaluate(`navigator.clipboard.writeText(${JSON.stringify(String(text))})`);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await waitForStable(formNum);

    const state = await getFormState();
    state.filtered = { type: 'search', text };
    return state;
  }

  // --- Advanced search: click target column cell → Alt+F → fill Pattern → Найти ---
  // Clicking a cell in the target column makes it active, so when Alt+F opens the
  // advanced search dialog, FieldSelector is auto-populated with the correct field name.
  // This avoids changing FieldSelector programmatically (which can cause errors).
  const isDateValue = /^\d{2}\.\d{2}\.\d{4}$/.test(text.trim());

  // 1. Click a cell in the target column to activate it (auto-populates FieldSelector).
  //    If the column isn't visible in the grid, click any cell and use DLB fallback later.
  let needDlb = false;
  const gridEl = await page.evaluate(`(() => {
    const p = 'form${formNum}_';
    const grid = [...document.querySelectorAll('[id^="' + p + '"].grid, [id^="' + p + '"] .grid')]
      .find(g => g.offsetWidth > 0);
    if (!grid) return { error: 'no_grid' };
    const targetField = ${JSON.stringify(field)};
    const headers = [...grid.querySelectorAll('.gridHead .gridBox')];
    let colIndex = -1;
    let startsWithIdx = -1;
    let includesIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      const t = headers[i].innerText?.trim().replace(/\\u00a0/g, ' ');
      if (!t) continue;
      const tl = t.toLowerCase(), fl = targetField.toLowerCase();
      if (tl === fl) { colIndex = i; break; }
      if (startsWithIdx < 0 && tl.startsWith(fl)) { startsWithIdx = i; }
      else if (includesIdx < 0 && tl.includes(fl)) { includesIdx = i; }
    }
    if (colIndex < 0) colIndex = startsWithIdx >= 0 ? startsWithIdx : includesIdx;
    const rows = [...grid.querySelectorAll('.gridBody .gridLine')];
    if (!rows.length) return { error: 'no_rows' };
    if (colIndex < 0) {
      // Column not in grid — click first cell of first row, will use DLB to change field
      const cells = [...rows[0].querySelectorAll('.gridBox')];
      if (!cells.length) return { error: 'no_cells' };
      const r = cells[0].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), needDlb: true };
    }
    const cells = [...rows[0].querySelectorAll('.gridBox')];
    if (colIndex >= cells.length) return { error: 'cell_not_found' };
    const r = cells[colIndex].getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (gridEl.error) return gridEl;
  needDlb = !!gridEl.needDlb;
  await page.mouse.click(gridEl.x, gridEl.y);
  await page.waitForTimeout(500);

  // 2. Open advanced search dialog via Alt+F (with fallback to Еще menu)
  await page.keyboard.press('Alt+f');
  await page.waitForTimeout(2000);

  let dialogForm = await page.evaluate(detectFormScript());
  if (dialogForm === formNum) {
    // Alt+F didn't open dialog — fallback to Еще → Расширенный поиск
    await clickElement('Еще');
    await page.waitForTimeout(500);
    const menu = await page.evaluate(readSubmenuScript());
    const searchItem = Array.isArray(menu) && menu.find(i =>
      i.name.replace(/\u00a0/g, ' ').toLowerCase().includes('расширенный поиск'));
    if (!searchItem) {
      await page.keyboard.press('Escape');
      return { error: 'no_advanced_search', message: 'Advanced search dialog could not be opened' };
    }
    await page.mouse.click(searchItem.x, searchItem.y);
    await page.waitForTimeout(2000);
    dialogForm = await page.evaluate(detectFormScript());
    if (dialogForm === formNum) {
      return { error: 'dialog_not_opened', message: 'Advanced search dialog did not open' };
    }
  }

  // 2b. If column wasn't in the grid, change FieldSelector via DLB dropdown
  if (needDlb) {
    const fsInfo = await page.evaluate(`(() => {
      const p = 'form' + ${JSON.stringify(String(dialogForm))} + '_';
      const fsInput = [...document.querySelectorAll('input.editInput[id^="' + p + '"]')]
        .find(el => el.offsetWidth > 0 && /FieldSelector/i.test(el.id));
      const dlb = document.getElementById(p + 'FieldSelector_DLB');
      return {
        current: fsInput?.value?.trim() || '',
        dlbX: dlb && dlb.offsetWidth > 0 ? Math.round(dlb.getBoundingClientRect().x + dlb.getBoundingClientRect().width / 2) : 0,
        dlbY: dlb && dlb.offsetWidth > 0 ? Math.round(dlb.getBoundingClientRect().y + dlb.getBoundingClientRect().height / 2) : 0
      };
    })()`);

    if (fsInfo.current.toLowerCase() !== field.toLowerCase()) {
      await page.mouse.click(fsInfo.dlbX, fsInfo.dlbY);
      await page.waitForTimeout(1500);

      const ddResult = await page.evaluate(`(() => {
        const edd = document.getElementById('editDropDown');
        if (!edd || edd.offsetWidth === 0) return { error: 'no_dropdown' };
        const target = ${JSON.stringify(field.toLowerCase())};
        const items = [...edd.querySelectorAll('div')].filter(el =>
          el.offsetWidth > 0 && el.innerText?.trim() && !el.innerText.includes('\\n'));
        const match = items.find(el => el.innerText.trim().toLowerCase() === target)
          || items.find(el => el.innerText.trim().toLowerCase().includes(target));
        if (!match) return { error: 'field_not_found', available: items.map(el => el.innerText.trim()) };
        const r = match.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), name: match.innerText.trim() };
      })()`);

      if (ddResult.error) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        return ddResult;
      }
      await page.mouse.click(ddResult.x, ddResult.y);
      await page.waitForTimeout(3000);
    }
  }

  // 3. Read dialog state and fill Pattern
  //    Detect field type by Pattern's sibling buttons:
  //    - iCalendB → date field (Home+Shift+End+Ctrl+V to replace date value)
  //    - iDLB on Pattern → reference field (paste + Tab for autocomplete)
  //    - neither → plain text field (just paste)
  const dialogInfo = await page.evaluate(`(() => {
    const p = 'form' + ${JSON.stringify(String(dialogForm))} + '_';
    const fsInput = [...document.querySelectorAll('input.editInput[id^="' + p + '"]')]
      .find(el => el.offsetWidth > 0 && /FieldSelector/i.test(el.id));
    const ptInput = [...document.querySelectorAll('input.editInput[id^="' + p + '"]')]
      .find(el => el.offsetWidth > 0 && /Pattern/i.test(el.id));
    const ptLabel = ptInput?.closest('label');
    const btns = ptLabel ? [...ptLabel.querySelectorAll('span.btn')].map(b => b.className) : [];
    const isDate = btns.some(c => c.includes('iCalendB'));
    const isRef = !isDate && btns.some(c => c.includes('iDLB'));
    return {
      fieldSelector: fsInput?.value?.trim() || '',
      patternValue: ptInput?.value?.trim() || '',
      patternId: ptInput?.id || '',
      isDate,
      isRef
    };
  })()`);

  if (dialogInfo.isDate) {
    // Date field: fill via Home → Shift+End (select all) → Ctrl+V (paste)
    if (isDateValue && dialogInfo.patternValue !== text.trim()) {
      await page.click(`[id="${dialogInfo.patternId}"]`);
      await page.waitForTimeout(200);
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);
      await page.keyboard.press('Shift+End');
      await page.waitForTimeout(100);
      await page.evaluate(`navigator.clipboard.writeText(${JSON.stringify(String(text))})`);
      await page.keyboard.press('Control+V');
      await page.waitForTimeout(500);
    }
  } else {
    // Text or reference field: fill Pattern via clipboard paste
    await page.click(`[id="${dialogInfo.patternId}"]`);
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+A');
    await page.evaluate(`navigator.clipboard.writeText(${JSON.stringify(String(text))})`);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(300);

    if (dialogInfo.isRef) {
      // Reference field: Tab triggers autocomplete to resolve text → reference value
      await page.keyboard.press('Tab');
      await page.waitForTimeout(2000);
    }
  }

  // 3b. Switch CompareType if exact match requested (text fields only).
  //    Date/number: always exact, CompareType disabled. Reference: default exact (selects ref).
  if (exact && !dialogInfo.isDate && !dialogInfo.isRef) {
    const exactRadio = await page.evaluate(`(() => {
      const p = 'form' + ${JSON.stringify(String(dialogForm))} + '_';
      // Check if CompareType group is disabled (dates, numbers)
      const group = document.getElementById(p + 'CompareType');
      if (group && group.classList.contains('disabled')) return { already: true };
      const el = document.getElementById(p + 'CompareType#2#radio');
      if (!el || el.offsetWidth === 0) return null;
      if (el.classList.contains('select')) return { already: true };
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (exactRadio && !exactRadio.already) {
      await page.mouse.click(exactRadio.x, exactRadio.y);
      await page.waitForTimeout(300);
    }
  }

  // 4. Click "Найти" via mouse.click (dialog is modal — page.click may be blocked)
  const findBtnCoords = await page.evaluate(`(() => {
    const btns = [...document.querySelectorAll('a.press')].filter(el => el.offsetWidth > 0);
    const btn = btns.find(el => el.innerText?.trim() === 'Найти');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (findBtnCoords) {
    await page.mouse.click(findBtnCoords.x, findBtnCoords.y);
  } else {
    await clickElement('Найти');
  }
  await page.waitForTimeout(2000);

  // 5. Close dialog if it stayed open (some forms keep it open after Найти)
  //    Check for modalSurface directly — more reliable than detectFormScript.
  for (let attempt = 0; attempt < 3; attempt++) {
    const hasModal = await page.evaluate(`(() => {
      const m = document.getElementById('modalSurface');
      return m && m.offsetWidth > 0;
    })()`);
    if (!hasModal) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await waitForStable(formNum);

  const state = await getFormState();
  state.filtered = { type: 'advanced', field, text, exact: !!exact };
  return state;
}

/**
 * Remove active filters/search from the current list.
 *
 * Without field: clears ALL filters (Ctrl+Q for advanced search + clear search field).
 * With field: clicks the × button on the specific filter badge (selective removal).
 *
 * @param {object} [opts]
 * @param {string} [opts.field] - Remove only the filter for this field (clicks badge ×)
 */
export async function unfilterList({ field } = {}) {
  ensureConnected();
  const formNum = await page.evaluate(detectFormScript());
  if (formNum === null) return { error: 'no_form' };

  if (field) {
    // --- Selective: click × on specific filter badge ---
    const closeBtn = await page.evaluate(`(() => {
      const p = 'form${formNum}_';
      const norm = s => s?.trim().replace(/\\u00a0/g, ' ').replace(/:$/, '').replace(/\\n/g, ' ') || '';
      const target = ${JSON.stringify(field.toLowerCase())};
      const items = [...document.querySelectorAll('[id^="' + p + '"].trainItem')].filter(el => el.offsetWidth > 0);
      for (const item of items) {
        const titleEl = item.querySelector('.trainName');
        const title = norm(titleEl?.innerText).toLowerCase();
        if (title === target || title.includes(target)) {
          const close = item.querySelector('.trainClose');
          if (close) {
            const r = close.getBoundingClientRect();
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), field: norm(titleEl?.innerText) };
          }
        }
      }
      const available = items.map(item => norm(item.querySelector('.trainName')?.innerText));
      return { error: 'not_found', available };
    })()`);

    if (closeBtn?.error) return closeBtn;
    await page.mouse.click(closeBtn.x, closeBtn.y);
    await waitForStable(formNum);

    const state = await getFormState();
    state.unfiltered = { field: closeBtn.field };
    return state;
  }

  // --- Clear ALL filters ---

  // 1. Remove all advanced filter badges (.trainItem × buttons)
  for (let attempt = 0; attempt < 20; attempt++) {
    const badge = await page.evaluate(`(() => {
      const p = 'form${formNum}_';
      const item = [...document.querySelectorAll('[id^="' + p + '"].trainItem')]
        .find(el => el.offsetWidth > 0);
      if (!item) return null;
      const close = item.querySelector('.trainClose');
      if (!close) return null;
      const r = close.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (!badge) break;
    await page.mouse.click(badge.x, badge.y);
    await waitForStable(formNum);
  }

  // 2. Cancel active search via Ctrl+Q
  await page.keyboard.press('Control+q');
  await waitForStable(formNum);

  // 3. Clear simple search field if it has a value
  const searchInfo = await page.evaluate(`(() => {
    const p = 'form${formNum}_';
    const el = [...document.querySelectorAll('input.editInput[id^="' + p + '"]')]
      .find(el => el.offsetWidth > 0 && /Строк[аи]Поиска|SearchString/i.test(el.id));
    return el ? { id: el.id, value: el.value || '' } : null;
  })()`);

  if (searchInfo?.value) {
    await page.click(`[id="${searchInfo.id}"]`);
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await waitForStable(formNum);
  }

  const state = await getFormState();
  state.unfiltered = true;
  return state;
}

/** Take a screenshot. Returns PNG buffer. */
export async function screenshot() {
  ensureConnected();
  return await page.screenshot({ type: 'png' });
}

/** Wait for a specified number of seconds. */
export async function wait(seconds) {
  ensureConnected();
  await page.waitForTimeout(seconds * 1000);
  return await getFormState();
}

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('Browser not connected. Call web_connect first.');
  }
}

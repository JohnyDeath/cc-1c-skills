---
name: web-test
description: Тестирование 1С через веб-клиент — автоматизация действий в браузере. Используй когда пользователь просит проверить, протестировать, автоматизировать действия в 1С через браузер
argument-hint: "сценарий на естественном языке"
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# /web-test — Browser automation for 1C web client

Writes and runs automation scripts for 1C web client via Playwright.

## Usage

```
/web-test Открой Платежное поручение, заполни сумму 5000, скриншот
/web-test Создай "Поступление товаров", организация "Конфетпром"
/web-test Проверь список контрагентов — прочитай таблицу
```

## Setup (first time)

```bash
cd .claude/skills/web-test/scripts && npm install
```

Requires Node.js 18+. `npm install` downloads Playwright and Chromium browser.

## Workflow

Runner: `.claude/skills/web-test/scripts/run.mjs`

Use `RUN` shorthand in all commands:
```bash
RUN=".claude/skills/web-test/scripts/run.mjs"
```

### Autonomous mode (preferred for complete scenarios)

Single command — opens browser, runs script, closes browser, exits:

```bash
node $RUN run <url> test-scenario.js
# or pipe from stdin:
cat <<'SCRIPT' | node $RUN run <url> -
await navigateSection('Продажи');
await openCommand('Заказы клиентов');
await clickElement('Создать');
await fillFields({ 'Клиент': 'Альфа' });
await clickElement('Провести и закрыть');
SCRIPT
```

Process exits when done. No session files, no HTTP server. Ideal for subagents and CI.

### Interactive mode (step-by-step development)

```bash
# 1. Start browser session (run_in_background=true, prints JSON when ready)
node $RUN start <url>

# 2. Execute scripts against running session
cat <<'SCRIPT' | node $RUN exec -
const form = await getFormState();
console.log(JSON.stringify(form.fields, null, 2));
SCRIPT

# 3. Screenshot anytime
node $RUN shot result.png

# 4. Stop when done (logout + close browser)
node $RUN stop
```

`start` outputs "Browser ready" JSON and keeps running (HTTP server). Use `exec`/`shot`/`stop` from other commands.

## URL

Read `.v8-project.json` from project root. Each database has `id` and optional `webUrl`.
Construct URL as `http://localhost:8081/<id>` or use `webUrl` if set.
Use `/web-publish` skill first if the database is not published yet.

## Writing exec scripts

In `exec` sandbox, all browser.mjs functions are available as globals — no `import` needed.
`console.log()` output is captured and returned in the JSON response.
`writeFileSync` and `readFileSync` are also available.

## API reference

### Navigation

| Function | Description |
|----------|-------------|
| `navigateSection(name)` | Go to section (fuzzy match). Returns `{ sections, commands }` |
| `openCommand(name)` | Open command from function panel (fuzzy). Returns form state |
| `navigateLink(url)` | Open 1C navigation link via Shift+F11 dialog. Returns form state |
| `switchTab(name)` | Switch to open tab/window (fuzzy). Returns form state |

### Reading

| Function | Description |
|----------|-------------|
| `getFormState()` | Current form: fields (with `required` flag for unfilled mandatory fields), buttons, tabs, table meta (columns + rowCount), filters |
| `readTable({maxRows, offset})` | Table row data: `{ columns, rows: [{col: val}], total }`. Use this to read grid contents |
| `readSpreadsheet()` | Read report output (SpreadsheetDocument): `{ rows: string[][], total }`. Use after clicking "Сформировать" |
| `getSections()` | Sections + commands of active section |
| `getPageState()` | Sections + open tabs |
| `getCommands()` | Commands of current section |

### Actions

| Function | Description |
|----------|-------------|
| `clickElement(text, {dblclick?})` | Click button/link/tab (fuzzy). `{dblclick:true}` to open items from lists. If returns `submenu[]` — click again with item name |
| `fillFields({name: value})` | Fill form fields (fuzzy by name or label). Auto-detects checkboxes, radio, reference fields |
| `selectValue(field, search)` | Select from reference field via dropdown/selection form |
| `fillTableRow(fields, opts)` | Fill table row cells via Tab navigation. See below |
| `deleteTableRow(row, {tab?})` | Delete row by 0-based index |
| `closeForm({save})` | Close form via Escape. `save: false` auto-clicks "Нет", `save: true` auto-clicks "Да", omit — returns confirmation for caller |
| `filterList(text, opts)` | Filter list. Simple (text only) or advanced (text + field). See below |
| `unfilterList({field?})` | Clear filters. All or specific badge |

### Utility

| Function | Description |
|----------|-------------|
| `screenshot()` | Returns PNG Buffer |
| `wait(seconds)` | Wait N seconds, returns form state |
| `getPage()` | Raw Playwright Page for advanced scripting |

## Key patterns

### Fill fields

```js
await fillFields({
  'Организация': 'Конфетпром',      // reference — auto type-ahead
  'Сумма': '5000',                    // plain text — clipboard paste
  'Оплачено': 'true',                // checkbox — "true"/"false"/"да"/"нет"
  'Вид операции': 'Оплата поставщику' // radio — fuzzy label match
});
// Returns: { filled: [{ field, ok, value, method }], form: {...} }
```

### Fill table row

```js
await fillTableRow(
  { 'Номенклатура': 'Бумага', 'Количество': '10', 'Цена': '100' },
  { tab: 'Товары', add: true }  // add:true = new row
);
// Edit existing: { row: 0 } instead of { add: true }
```

- Tab-based sequential navigation — field order set by 1C form config
- Fuzzy cell match: "Количество" matches "ТоварыКоличество"
- Reference cells auto-detected by autocomplete popup

### Filter

```js
await filterList('КП00-000018');                         // simple — all columns
await filterList('Мишка', { field: 'Наименование' });    // advanced — specific column
await filterList('Мишка', { field: 'Наименование', exact: true }); // exact match
await unfilterList();                                     // clear all
await unfilterList({ field: 'Наименование' });           // clear specific badge
```

### Open item from list

```js
// Double-click to open a document/catalog item from a list
await clickElement('0000-000227', { dblclick: true });
// Returns the opened form state (fields, table, buttons)
```

Single `clickElement(text)` only selects the row. To open — always use `{dblclick: true}`.

### Hierarchical lists (catalogs)

Both simple and advanced search work on hierarchical catalogs (Контрагенты, Номенклатура, etc.):

```js
await filterList('Конфетпром');  // simple search — flattens hierarchical view
await filterList('Конфетпром', { field: 'Наименование' });  // advanced — specific column
await clickElement('Конфетпром ООО', { dblclick: true });  // open found item
await closeForm();               // close item
await unfilterList();             // restore hierarchical view
```

Hint: if `readTable()` returns `hierarchical: true`, the list has groups.

### Closing forms

| Action | Method |
|--------|--------|
| Post & close document | `clickElement('Провести и закрыть')` |
| Save & close catalog | `clickElement('Записать и закрыть')` |
| Close without saving | `closeForm({ save: false })` — auto-dismisses "save changes?" |
| Close and save | `closeForm({ save: true })` — auto-confirms save |
| Close (manual confirm) | `closeForm()` — returns `confirmation` field if dialog appears |

`closeForm()` is preferred over `clickElement('×')` — close buttons on tabs are ambiguous.

### Keyboard shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `F8` | Reference field focused | Open creation form for the field's catalog |
| `Shift+F4` | Reference field focused | Clear field value |
| `F4` | Reference field focused | Open selection form |
| `Alt+F` | List/table form | Open advanced search dialog |

### Navigation links

```js
await navigateLink('Документ.ЗаказКлиента');
await navigateLink('РегистрНакопления.ЗаказыКлиентов');
await navigateLink('Справочник.Контрагенты');
```

Bypasses section/command navigation. Useful for registers, journals, and any form with a known path.

### Submenu navigation

```js
const r = await clickElement('Ещё');
// r.submenu = ['Расширенный поиск', 'Настройки', ...]
await clickElement('Расширенный поиск'); // click submenu item
```

## Response format (exec)

Success:
```json
{ "ok": true, "output": "...console.log...", "elapsed": 3.2 }
```

Error (with auto-screenshot):
```json
{ "ok": false, "error": "Element not found", "output": "...", "screenshot": "error-shot.png", "elapsed": 1.5 }
```

## Script template

```js
// Navigate to section and open list
await navigateSection('Банк и касса');
await openCommand('Платежные поручения');

// Create new document
await clickElement('Создать');

// Fill and save
await fillFields({ 'Организация': 'Конфетпром', 'Сумма': '5000' });
await clickElement('Провести и закрыть');

console.log('done');
```

Run: `node $RUN run http://localhost:8081/bpdemo script.js`

## Important

- **Headed mode** — 1C requires visible browser, no headless
- **1C loads 30-60s** on initial connect (wait is built into `start`)
- **Fuzzy match** — all name lookups use fuzzy search (exact > startsWith > includes)
- **errorModal** — if response contains `errorModal`, 1C showed an error dialog
- **Clipboard paste** — all fields filled via Ctrl+V (triggers 1C events properly)
- **Stdin pipe for Cyrillic** — use `cat <<'SCRIPT' | node $RUN exec -` to avoid bash escaping

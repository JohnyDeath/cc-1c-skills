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

## Workflow

Runner path: `C:\WS\tasks\1c-web-client-mcp\src\run.mjs`

### Interactive mode (step-by-step)

```bash
# 1. Start browser session (stays alive in background)
node src/run.mjs start <url> &

# 2. Execute scripts — each returns JSON with results
cat <<'SCRIPT' | node src/run.mjs exec -
await navigateSection('Покупки');
const form = await openCommand('Авансовые отчеты');
console.log(JSON.stringify(form.fields, null, 2));
SCRIPT

# 3. React to output, run more scripts...

# 4. Screenshot anytime
node src/run.mjs shot result.png

# 5. Stop when done (logout + close browser)
node src/run.mjs stop
```

### Batch mode (full scenario in a file)

Write `.mjs` script, run via exec:

```bash
node src/run.mjs start <url> &
# wait for "Browser ready" in output
node src/run.mjs exec test-scenario.mjs
node src/run.mjs stop
```

## URL

Read `.v8-project.json` from project root. If `webUrl` is set — use it.
Default: `http://localhost:8081/bpdemo`

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
| `switchTab(name)` | Switch to open tab/window (fuzzy). Returns form state |

### Reading

| Function | Description |
|----------|-------------|
| `getFormState()` | Current form: fields, buttons, tabs, table preview, filters |
| `readTable({maxRows, offset})` | Full table data with pagination. Default: 20 rows |
| `getSections()` | Sections + commands of active section |
| `getPageState()` | Sections + open tabs |
| `getCommands()` | Commands of current section |

### Actions

| Function | Description |
|----------|-------------|
| `clickElement(text)` | Click button/link/tab (fuzzy). If returns `submenu[]` — click again with item name |
| `fillFields({name: value})` | Fill form fields (fuzzy by name or label). Auto-detects checkboxes, radio, reference fields |
| `selectValue(field, search)` | Select from reference field via dropdown/selection form |
| `fillTableRow(fields, opts)` | Fill table row cells via Tab navigation. See below |
| `deleteTableRow(row, {tab?})` | Delete row by 0-based index |
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
const list = await openCommand('Платежные поручения');
console.log('Buttons:', list.buttons?.map(b => b.name));

// Create new document
const doc = await clickElement('Создать');
console.log('Fields:', doc.fields?.map(f => `${f.label||f.name}: "${f.value}"`));

// Fill and save
await fillFields({ 'Организация': 'Конфетпром', 'Сумма': '5000' });
await clickElement('Провести и закрыть');

// Screenshot
const png = await screenshot();
writeFileSync('result.png', png);
```

## Important

- **Headed mode** — 1C requires visible browser, no headless
- **1C loads 30-60s** on initial connect (wait is built into `start`)
- **Fuzzy match** — all name lookups use fuzzy search (exact > includes)
- **errorModal** — if response contains `errorModal`, 1C showed an error dialog
- **Clipboard paste** — all fields filled via Ctrl+V (triggers 1C events properly)
- **Stdin pipe for Cyrillic** — use `cat <<'SCRIPT' | node src/run.mjs exec -` to avoid bash escaping

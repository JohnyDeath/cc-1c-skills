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

# /web-test — Тестирование 1С через веб-клиент

Пишет и запускает скрипт автоматизации для 1С веб-клиента через Playwright.

## Аргумент

Сценарий на естественном языке, например:
```
/web-test Открой Платежное поручение, заполни сумму 5000, сделай скриншот
/web-test Создай документ "Поступление товаров", выбери организацию "Конфетпром"
/web-test Проверь список контрагентов — прочитай таблицу
```

## Как работать

1. Напиши `.mjs` скрипт в корне проекта 1c-web-client-mcp (`C:\WS\tasks\1c-web-client-mcp`)
2. Запусти через `node <script>.mjs [url]`
3. Прочитай stdout + посмотри скриншоты
4. В `finally` ВСЕГДА вызывай `disconnect()` — иначе лицензия зависнет

## URL по умолчанию

Прочитай `.v8-project.json` из корня проекта (`C:\WS\tasks\skills\.v8-project.json`).
Если задан `webUrl` — используй его. Иначе: `http://localhost:8081/bpdemo`

## API browser.mjs

Путь для импорта: `./src/browser.mjs` (из корня `C:\WS\tasks\1c-web-client-mcp`)

### Функции

| Функция | Описание | Возвращает |
|---------|----------|------------|
| `connect(url)` | Открыть браузер, перейти по URL, закрыть стартовые модалки | `{ activeSection, sections, tabs }` |
| `disconnect()` | Graceful logout + закрыть браузер | `void` |
| `isConnected()` | Проверить соединение | `boolean` |
| `getPageState()` | Разделы + вкладки | `{ activeSection, activeTab, sections, tabs }` |
| `getSections()` | Разделы + команды текущего раздела | `{ activeSection, sections, commands }` |
| `navigateSection(name)` | Перейти в раздел (fuzzy) | `{ navigated, sections, commands }` |
| `getCommands()` | Команды текущего раздела | `[[cmd1, cmd2], [cmd3]]` |
| `openCommand(name)` | Открыть команду (fuzzy) | `{ form, fields, buttons, tabs, ... }` |
| `getFormState()` | Прочитать текущую форму | `{ form, activeTab, fields, buttons, tabs, texts, hyperlinks, table }` |
| `readTable({maxRows, offset})` | Прочитать таблицу | `{ name, columns, rows, total, offset, shown }` |
| `fillFields({field: value})` | Заполнить поля (fuzzy по имени/метке). Все значения вводятся через clipboard paste (trusted events). Ссылочные поля — автоподбор, обычные — paste + Tab. Поддерживает input, textarea, checkbox | `{ filled, form }` |
| `clickElement(text)` | Кликнуть кнопку/ссылку/вкладку (fuzzy). Обрабатывает submenu | `{ form, clicked, submenu?, hint? }` |
| `selectValue(field, search?)` | Выбрать из справочника (составная операция) | `{ form, selected, fields, ... }` |
| `screenshot()` | Скриншот | `Buffer (PNG)` |
| `wait(seconds)` | Подождать N секунд | `{ form, ... }` |
| `getPage()` | Сырой Playwright page для продвинутых сценариев | `Page` |

### Поля формы (fields[])

```js
{
  name: "СуммаДокумента",    // Внутреннее имя (из DOM ID)
  label: "Сумма платежа",    // Видимая метка (опционально)
  value: "1000",             // Текущее значение
  type: "text|textarea|checkbox|date", // Тип (если не text)
  readonly: true,            // Только чтение (опционально)
  disabled: true,            // Заблокировано (опционально)
  actions: ["select","open","clear","pick"] // Кнопки поля (опционально)
}
```

### Таблица (table)

В `getFormState()` таблица — превью: `{ present, columns, rowCount, preview }`.
Для полных данных используй `readTable({maxRows: 50, offset: 0})`.

### Submenu

Если `clickElement()` вернул `submenu[]` — вызови `clickElement()` ещё раз с именем пункта.

### Выбор из справочника

`selectValue("Организация", "Конфетпром")` — составная операция с тремя сценариями:

**A) Dropdown-совпадение** — DLB → dropdown (EDD) → совпадение найдено → dispatchEvent click → готово
**B) "Показать все"** — DLB → dropdown → совпадения нет, но есть "Показать все" → клик → форма выбора → поиск → выбор
**C) F4 fallback** — DLB → dropdown → ни совпадения, ни "Показать все" → Escape → F4 → форма выбора → поиск → выбор

В форме выбора: clipboard paste в поле поиска → Enter → ожидание грида → двойной клик по лучшему совпадению.

Если не сработало — fallback через ручные шаги: `clickElement` → `getFormState` → `readTable`.

## Шаблон скрипта

```js
import * as browser from './src/browser.mjs';
import { writeFileSync } from 'fs';

const url = process.argv[2] || 'http://localhost:8081/bpdemo';

try {
  // 1. Подключение
  const state = await browser.connect(url);
  console.log('Sections:', state.sections?.map(s => s.name).join(', '));

  // 2. Навигация
  await browser.navigateSection('Банк и касса');

  // 3. Открыть команду
  const list = await browser.openCommand('Платежные поручения');
  console.log('Form:', list.form, '| Buttons:', list.buttons?.map(b => b.name));

  // 4. Действия...
  const doc = await browser.clickElement('Создать');
  console.log('Fields:', doc.fields?.map(f => `${f.label||f.name}: "${f.value}"`));

  // 5. Скриншот
  const png = await browser.screenshot();
  writeFileSync('result.png', png);
  console.log('Screenshot saved: result.png');

} catch (e) {
  console.error('ERROR:', e.message);
  // Скриншот при ошибке
  try {
    const png = await browser.screenshot();
    writeFileSync('error.png', png);
    console.error('Error screenshot: error.png');
  } catch {}
} finally {
  await browser.disconnect();
}
```

## Важные заметки

- **Headed mode обязателен** — 1С не работает в headless Chromium
- **disconnect() в finally** — ВСЕГДА! Иначе лицензия зависнет на 20 минут
- **Fuzzy match** — все функции поиска по имени используют нечёткий поиск (exact → includes)
- **Время загрузки** — 1С грузится 30–60 секунд при `connect()`
- **Clipboard paste** — все поля (обычные и ссылочные) заполняются через clipboard paste (Ctrl+V) — `page.fill()` не вызывает 1С OnChange и зависимые поля не пересчитываются
- **Ссылочные поля** — `fillFields` определяет ссылочные поля (по кнопке DLB) и использует type-ahead (paste → Tab → авторезолв/popup). Для явного выбора через DLB-кнопку используй `selectValue`
- **Чекбоксы** — заполнять через `fillFields({field: "true"})` или `fillFields({field: "да"})`
- **Ошибки 1С** — если в ответе есть `errorModal`, значит 1С показала ошибку

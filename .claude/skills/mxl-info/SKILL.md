---
name: mxl-info
description: Analyze SpreadsheetDocument (MXL) template structure — areas, parameters, column sets
argument-hint: <TemplatePath> or <ProcessorName> <TemplateName>
allowed-tools:
  - Bash
  - Read
  - Glob
---

# /mxl-info — Template Structure Analyzer

Reads a SpreadsheetDocument Template.xml and outputs a compact summary: named areas, parameters, column sets. Replaces the need to read thousands of XML lines.

## Usage

```
/mxl-info <TemplatePath>
/mxl-info <ProcessorName> <TemplateName>
```

## Parameters

| Parameter     | Required | Default | Description                              |
|---------------|:--------:|---------|------------------------------------------|
| TemplatePath  | no       | —       | Direct path to Template.xml              |
| ProcessorName | no       | —       | Processor name (alternative to path)     |
| TemplateName  | no       | —       | Template name (alternative to path)      |
| SrcDir        | no       | `src`   | Source directory                         |
| Format        | no       | `text`  | Output format: `text` or `json`         |
| WithText      | no       | false   | Include static text and template content |
| MaxParams     | no       | 10      | Max parameters listed per area          |
| Limit         | no       | 150     | Max output lines (truncation protection) |
| Offset        | no       | 0       | Skip N lines (for pagination)           |

Specify either `-TemplatePath` or both `-ProcessorName` and `-TemplateName`.

## Command

```powershell
powershell.exe -NoProfile -File .claude/skills/mxl-info/scripts/mxl-info.ps1 -TemplatePath "<path>"
```

Or with processor/template names:
```powershell
powershell.exe -NoProfile -File .claude/skills/mxl-info/scripts/mxl-info.ps1 -ProcessorName "<Name>" -TemplateName "<Template>" [-SrcDir "<dir>"]
```

Additional flags:
```powershell
... -WithText              # include cell text content
... -Format json           # JSON output for programmatic use
... -MaxParams 20          # show more parameters per area
... -Offset 150            # pagination: skip first 150 lines
```

## Reading the Output

### Areas — sorted top-to-bottom

Areas are listed in document order (by row position), not alphabetically. This matches the order you'll use in fill code — output areas from top to bottom.

```
--- Named areas ---
  Заголовок          Rows     rows 1-4     (1 params)
  Поставщик          Rows     rows 5-6     (1 params)
  Строка             Rows     rows 14-14   (8 params)
  Итого              Rows     rows 16-17   (1 params)
```

Area types:
- **Rows** — horizontal area (row range). Use: `Макет.ПолучитьОбласть("Имя")`
- **Columns** — vertical area (column range). Use: `Макет.ПолучитьОбласть("Имя")`
- **Rectangle** — fixed area (rows + cols). Typically uses a separate column set.
- **Drawing** — named picture/barcode.

### Column sets

When template has multiple column sets, sizes are shown in header and per-area:

```
  Column sets: 7 (default=19 cols + 6 additional)
    f01e015f...: 17 cols
    0adf41ed...: 4 cols
  ...
  Подвал             Rows     rows 30-34  (5 params) [colset 14cols]
  НумерацияЛистов    Rows     rows 59-59  (0 params) [colset 4cols]
```

### Intersections

When both Rows and Columns areas exist (labels, price tags), the script lists intersection pairs:

```
--- Intersections (use with GetArea) ---
  ВысотаЭтикетки|ШиринаЭтикетки
```

Use in BSL: `Макет.ПолучитьОбласть("ВысотаЭтикетки|ШиринаЭтикетки")`

### Parameters and detailParameter

Parameters are listed per area. If a parameter has a `detailParameter` (drill-down link), it's shown below:

```
--- Parameters by area ---
  Поставщик: ПредставлениеПоставщика
    detail: ПредставлениеПоставщика->Поставщик
  Строка: НомерСтроки, Товар, Количество, Цена, Сумма, ... (+3)
    detail: Товар->Номенклатура
```

This means: parameter `Товар` shows the value, and clicking it opens `Номенклатура` (the detail object).

In BSL:
```bsl
Область.Параметры.Товар = СтрокаТЧ.Номенклатура;
Область.Параметры.РасшифровкаТовар = СтрокаТЧ.Номенклатура; // detailParameter
```

### Template parameters (`[tpl]` suffix)

Some parameters are embedded in template text: `"Инв № [ИнвентарныйНомер]"`. These are filled via fillType=Template, not fillType=Parameter. The script always extracts them and marks with `[tpl]`:

```
  НумерацияЛистов: Номер [tpl], Дата [tpl], НомерЛиста [tpl]
```

In BSL, template parameters are filled the same way as regular ones:
```bsl
Область.Параметры.Номер = НомерДокумента;
Область.Параметры.Дата = ДатаДокумента;
```

Numeric-only placeholders like `[5]`, `[6]` (footnote references in legal forms) are ignored.

### Text content (`-WithText`)

Shows static text (labels, headers) and template strings with `[Param]` placeholders:

```
--- Text content ---
  ШапкаТаблицы:
    Text: "№", "Товар", "Ед. изм.", "Кол-во", "Цена", "Сумма"
  Строка:
    Templates: "Инв № [ИнвентарныйНомер]"
```

- **Text** — static labels (fillType=Text). Useful to understand column meaning.
- **Templates** — text with `[ParamName]` substitutions (fillType=Template). The param inside `[]` is filled programmatically.

## When to Use

- **Before writing fill code**: run `/mxl-info` to understand area names and parameter lists, then write BSL output code following the top-to-bottom area order
- **With `-WithText`**: when you need context — column headers, labels next to parameters, template patterns
- **With `-Format json`**: when you need structured data for programmatic processing
- **For existing templates**: analyze uploaded or configuration templates without reading raw XML

## Truncation Protection

Output is limited to 150 lines by default. If exceeded:
```
[TRUNCATED] Shown 150 of 220 lines. Use -Offset 150 to continue.
```

Use `-Offset N` and `-Limit N` to paginate through large outputs.

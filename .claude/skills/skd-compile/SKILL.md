---
name: skd-compile
description: Компиляция схемы компоновки данных 1С (СКД) — Template.xml из компактного JSON-определения
argument-hint: <JsonPath> <OutputPath>
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
---

# /skd-compile — генерация СКД из JSON DSL

Принимает JSON-определение схемы компоновки данных → генерирует Template.xml (DataCompositionSchema).

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `JsonPath` | Путь к JSON-определению СКД |
| `OutputPath` | Путь к выходному Template.xml |

```powershell
powershell.exe -NoProfile -File .claude\skills\skd-compile\scripts\skd-compile.ps1 -JsonPath "<json>" -OutputPath "<Template.xml>"
```

## JSON DSL — краткий справочник

Полная спецификация: `docs/skd-dsl-spec.md`.

### Корневая структура

```json
{
  "dataSets": [...],
  "calculatedFields": [...],
  "totalFields": [...],
  "parameters": [...],
  "dataSetLinks": [...],
  "settingsVariants": [...]
}
```

Умолчания: `dataSources` → авто `ИсточникДанных1/Local`; `settingsVariants` → авто "Основной" с деталями.

### Наборы данных

Тип по ключу: `query` → DataSetQuery, `objectName` → DataSetObject, `items` → DataSetUnion.

```json
{ "name": "Продажи", "query": "ВЫБРАТЬ ...", "fields": [...] }
```

### Поля — shorthand

```
"Наименование"                              — просто имя
"Количество: decimal(15,2)"                  — имя + тип
"Организация: CatalogRef.Организации @dimension"  — + роль
"Служебное: string #noFilter #noOrder"       — + ограничения
```

Типы: `string`, `string(N)`, `decimal(D,F)`, `boolean`, `date`, `dateTime`, `CatalogRef.X`, `DocumentRef.X`, `EnumRef.X`, `StandardPeriod`.

Роли: `@dimension`, `@account`, `@balance`, `@period`.

Ограничения: `#noField`, `#noFilter`, `#noGroup`, `#noOrder`.

### Итоги (shorthand)

```json
"totalFields": ["Количество: Сумма", "Стоимость: Сумма(Кол * Цена)"]
```

### Параметры (shorthand)

```json
"parameters": ["Период: StandardPeriod = LastMonth", "Организация: CatalogRef.Организации"]
```

### Варианты настроек

```json
"settingsVariants": [{
  "name": "Основной",
  "presentation": "Основной",
  "settings": {
    "selection": ["Наименование", "Количество", "Auto"],
    "filter": [{ "field": "Организация", "op": "=", "use": false, "userSettingID": "auto" }],
    "order": ["Количество desc", "Auto"],
    "outputParameters": { "Заголовок": "Мой отчёт" },
    "structure": [{ "type": "group", "groupBy": ["Организация"], "selection": ["Auto"], "order": ["Auto"],
      "children": [{ "type": "group", "selection": ["Auto"], "order": ["Auto"] }]
    }]
  }
}]
```

## Примеры

### Минимальный

```json
{
  "dataSets": [{
    "query": "ВЫБРАТЬ Номенклатура.Наименование КАК Наименование ИЗ Справочник.Номенклатура КАК Номенклатура",
    "fields": ["Наименование"]
  }]
}
```

### С ресурсами и параметрами

```json
{
  "dataSets": [{
    "query": "ВЫБРАТЬ Продажи.Номенклатура, Продажи.Количество, Продажи.Сумма ИЗ РегистрНакопления.Продажи КАК Продажи",
    "fields": ["Номенклатура: CatalogRef.Номенклатура @dimension", "Количество: decimal(15,3)", "Сумма: decimal(15,2)"]
  }],
  "totalFields": ["Количество: Сумма", "Сумма: Сумма"],
  "parameters": ["Период: StandardPeriod = LastMonth"]
}
```

## Верификация

```
/skd-validate <OutputPath>                  — валидация структуры XML
/skd-info <OutputPath>                      — визуальная сводка
/skd-info <OutputPath> -Mode variant -Name 1 — проверка варианта настроек
```

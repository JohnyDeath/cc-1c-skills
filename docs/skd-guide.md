# Схема компоновки данных (СКД)

Навыки группы `/skd-*` позволяют анализировать, создавать и проверять схемы компоновки данных 1С — XML-файлы DataCompositionSchema (Template.xml).

## Навыки

| Навык | Параметры | Описание |
|-------|-----------|----------|
| `/skd-info` | `<TemplatePath> [-Mode] [-Name]` | Анализ структуры СКД: наборы, поля, параметры, ресурсы, варианты (10 режимов) |
| `/skd-compile` | `<JsonPath> <OutputPath>` | Генерация Template.xml из JSON DSL: наборы, поля, итоги, параметры, варианты |
| `/skd-validate` | `<TemplatePath> [-MaxErrors 20]` | Валидация структурной корректности: ~30 проверок |

## Рабочий цикл

```
Описание отчёта (текст) → JSON DSL → /skd-compile → Template.xml → /skd-validate
                                                                   → /skd-info
```

1. Claude формирует JSON-определение СКД (shorthand-поля, параметры, итоги, варианты)
2. `/skd-compile` генерирует Template.xml с корректными namespace, типами, группировками
3. `/skd-validate` проверяет корректность сгенерированного XML
4. `/skd-info` выводит компактную сводку для визуальной проверки

## JSON DSL — компактный формат

СКД описываются в JSON с двумя уровнями детализации для каждой секции:

### Минимальный пример

```json
{
  "dataSets": [{
    "query": "ВЫБРАТЬ Номенклатура.Наименование ИЗ Справочник.Номенклатура КАК Номенклатура",
    "fields": ["Наименование"]
  }]
}
```

Умолчания: dataSource создаётся автоматически (`ИсточникДанных1/Local`), набор получает имя `НаборДанных1`, вариант настроек "Основной" с деталями.

### Поля — shorthand

```json
"fields": [
  "Наименование",
  "Количество: decimal(15,2)",
  "Организация: CatalogRef.Организации @dimension",
  "Служебное: string #noFilter #noOrder"
]
```

Формат: `Имя[: Тип] [@роль...] [#ограничение...]`. Роли: `@dimension`, `@account`, `@balance`, `@period`. Ограничения: `#noField`, `#noFilter`, `#noGroup`, `#noOrder`.

### Итоги — shorthand

```json
"totalFields": ["Количество: Сумма", "Стоимость: Сумма(Кол * Цена)"]
```

Формат: `Поле: Функция` или `Поле: Функция(выражение)`.

### Параметры — shorthand

```json
"parameters": [
  "Период: StandardPeriod = LastMonth",
  "Организация: CatalogRef.Организации"
]
```

### Вычисляемые поля — shorthand

```json
"calculatedFields": ["Итого = Количество * Цена"]
```

### Объектная форма

Все секции поддерживают полную объектную форму для сложных случаев (title, appearance, role с выражениями, userSettingID и т.д.). Подробности — в [спецификации SKD DSL](skd-dsl-spec.md).

## Сценарии использования

### Анализ существующей СКД

```
> Проанализируй схему компоновки отчёта Reports/АнализНДФЛ/Templates/ОсновнаяСхемаКомпоновкиДанных
```

Claude вызовет `/skd-info` (overview → trace → query → variant) и опишет:
- наборы данных и их поля
- параметры и значения по умолчанию
- ресурсы и формулы агрегации
- структуру группировок в вариантах настроек

### Создание СКД по описанию

```
> Создай СКД для отчёта по продажам: группировка по организациям,
> поля Номенклатура, Количество, Сумма. Период — параметр.
```

Claude сформирует JSON:
```json
{
  "dataSets": [{
    "name": "Продажи",
    "query": "ВЫБРАТЬ ...",
    "fields": [
      "Организация: CatalogRef.Организации @dimension",
      "Номенклатура: CatalogRef.Номенклатура @dimension",
      "Количество: decimal(15,3)",
      "Сумма: decimal(15,2)"
    ]
  }],
  "totalFields": ["Количество: Сумма", "Сумма: Сумма"],
  "parameters": ["Период: StandardPeriod = LastMonth"],
  "settingsVariants": [{
    "name": "Основной",
    "settings": {
      "selection": ["Номенклатура", "Количество", "Сумма", "Auto"],
      "structure": [{
        "type": "group", "groupBy": ["Организация"],
        "selection": ["Auto"], "order": ["Auto"],
        "children": [{ "type": "group", "selection": ["Auto"], "order": ["Auto"] }]
      }]
    }
  }]
}
```

И вызовет `/skd-compile` → `/skd-validate` → `/skd-info`.

### Проверка существующей СКД

```
> Проверь корректность СКД Reports/МойОтчёт/Templates/ОсновнаяСхемаКомпоновкиДанных/Ext/Template.xml
```

Claude вызовет `/skd-validate` и покажет результат: ошибки (битые ссылки, дубликаты, невалидные типы) и предупреждения.

## Структура файлов СКД

```
<Объект>/Templates/
├── ИмяМакета.xml              # Метаданные (UUID, TemplateType=DataCompositionSchema)
└── ИмяМакета/
    └── Ext/
        └── Template.xml        # Тело схемы (DataCompositionSchema)
```

## Спецификации

- [1c-dcs-spec.md](1c-dcs-spec.md) — XML-формат DataCompositionSchema, namespace, элементы, типы
- [skd-dsl-spec.md](skd-dsl-spec.md) — JSON DSL для описания СКД (формат входных данных `/skd-compile`)

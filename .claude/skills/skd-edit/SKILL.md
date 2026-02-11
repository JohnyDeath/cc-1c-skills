---
name: skd-edit
description: Точечное редактирование схемы компоновки данных 1С (СКД) — добавление/удаление полей, итогов, фильтров, параметров, вычисляемых полей
argument-hint: <TemplatePath> -Operation <op> -Value <value>
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
---

# /skd-edit — точечное редактирование СКД (Template.xml)

Атомарные операции модификации существующей схемы компоновки данных: добавление, удаление и модификация полей, итогов, фильтров, параметров, настроек варианта, управление структурой, замена запроса.

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `TemplatePath` | Путь к Template.xml (или к папке — автодополнение Ext/Template.xml) |
| `Operation` | Операция (см. список ниже) |
| `Value` | Значение операции (shorthand-строка или текст запроса) |
| `DataSet` | (опц.) Имя набора данных (умолч. первый) |
| `Variant` | (опц.) Имя варианта настроек (умолч. первый) |
| `NoSelection` | (опц.) Не добавлять поле в selection варианта |

```powershell
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 -TemplatePath "<path>" -Operation <op> -Value "<value>"
```

## Пакетный режим (batch)

Несколько значений в одном вызове через разделитель `;;`:

```powershell
-Operation add-field -Value "Цена: decimal(15,2) ;; Количество: decimal(15,3) ;; Сумма: decimal(15,2)"
```

Работает для всех операций кроме `set-query` и `set-structure`. Каждое значение обрабатывается последовательно.

## Операции

### add-field — добавить поле в набор данных

Shorthand-формат: `"Имя [Заголовок]: тип @роль #ограничение"`.

```powershell
-Operation add-field -Value "Цена: decimal(15,2)"
-Operation add-field -Value "Организация [Орг-ция]: CatalogRef.Организации @dimension"
-Operation add-field -Value "Служебное: string #noFilter #noOrder"
```

Поддержка заголовка (title) в квадратных скобках: `"Цена [Цена, руб.]: decimal(15,2)"`.

Поле добавляется перед `<dataSource>` в наборе, а также в `<dcsset:selection>` первого варианта (если нет `-NoSelection`). При дубликате dataPath — предупреждение, поле не добавляется.

### add-total — добавить итог

```powershell
-Operation add-total -Value "Цена: Среднее"
-Operation add-total -Value "Стоимость: Сумма(Кол * Цена)"
```

При дубликате dataPath — предупреждение.

### add-calculated-field — добавить вычисляемое поле

Формат: `"Имя [Заголовок]: тип = Выражение"` или `"Имя = Выражение"`.

```powershell
-Operation add-calculated-field -Value "Маржа = Продажа - Закупка"
-Operation add-calculated-field -Value "Наценка [Наценка, %]: decimal(10,2) = Маржа / Закупка * 100"
```

Также добавляется в selection варианта (если нет `-NoSelection`). При дубликате dataPath — предупреждение.

### add-parameter — добавить параметр

```powershell
-Operation add-parameter -Value "Период: StandardPeriod = LastMonth @autoDates"
-Operation add-parameter -Value "Организация: CatalogRef.Организации"
```

`@autoDates` генерирует дополнительные параметры `ДатаНачала` и `ДатаОкончания`. При дубликате name — предупреждение.

### add-filter — добавить фильтр в вариант настроек

```powershell
-Operation add-filter -Value "Номенклатура = _ @off @user"
-Operation add-filter -Value "Дата >= 2024-01-01T00:00:00"
-Operation add-filter -Value "Статус filled"
```

Формат: `"Поле оператор значение @флаги"`. Флаги: `@off`, `@user`, `@quickAccess`, `@normal`, `@inaccessible`.

### add-dataParameter — добавить параметр данных в вариант

```powershell
-Operation add-dataParameter -Value "Период = LastMonth @user"
-Operation add-dataParameter -Value "Организация @off @user"
```

Формат: `"Имя [= значение] @флаги"`. Для StandardPeriod варианты (LastMonth, ThisYear и т.д.) распознаются автоматически.

### add-order — добавить элемент сортировки в вариант

```powershell
-Operation add-order -Value "Количество desc"
-Operation add-order -Value "Наименование"
-Operation add-order -Value "Auto"
```

Формат: `"Поле [desc]"`. По умолчанию — asc. `Auto` добавляет авто-элемент.

### add-selection — добавить элемент выборки в вариант

```powershell
-Operation add-selection -Value "Номенклатура"
-Operation add-selection -Value "Auto"
```

### add-dataSetLink — добавить связь наборов данных

```powershell
-Operation add-dataSetLink -Value "Набор1 > Набор2 on Поле1 = Поле2"
-Operation add-dataSetLink -Value "Набор1 > Набор2 on Поле1 = Поле2 [param Связь]"
```

Формат: `"Источник > Приёмник on ВыражениеИсточника = ВыражениеПриёмника [param ИмяПараметра]"`. Параметр связи опционален.

### set-query — заменить текст запроса

```powershell
-Operation set-query -Value "ВЫБРАТЬ 1 КАК Тест"
```

Не поддерживает пакетный режим.

### set-outputParameter — установить параметр вывода

```powershell
-Operation set-outputParameter -Value "Заголовок = Мой отчёт"
-Operation set-outputParameter -Value "ВыводитьЗаголовок = true"
```

Если параметр уже существует — заменяет значение. Поддерживаемые параметры: Заголовок/Title, ВыводитьЗаголовок/OutputTitle, ВертикальноеРасположениеОбщихИтогов/VerticalOverallPlacement, ГоризонтальноеРасположениеОбщихИтогов/HorizontalOverallPlacement, РасположениеРеквизитов/AttributePlacement, РасположениеГруппировки/GroupPlacement, РасположениеПолейГруппировки/GroupFieldsPlacement, РасположениеИтогов/OverallPlacement, РасположениеОтбора/FilterOutput, ВыводитьОтбор/OutputFilter.

### set-structure — установить структуру варианта

```powershell
-Operation set-structure -Value "Организация > Номенклатура > details"
-Operation set-structure -Value "details"
```

Формат: `"ПолеГруппировки1 > ПолеГруппировки2 > details"`. `details`/`детали` — группа детальных записей (пустой groupBy). Заменяет всю существующую структуру варианта. Не поддерживает пакетный режим.

### modify-field — изменить существующее поле в наборе данных

```powershell
-Operation modify-field -Value "Цена [Цена USD]: decimal(10,4) @dimension"
-Operation modify-field -Value "Цена: decimal(10,2)"
```

Использует тот же shorthand что и `add-field`. Находит поле по dataPath, объединяет с переданными свойствами (непустые переопределяют), сохраняет позицию. Если тип/заголовок/роли/ограничения не указаны в shorthand — берутся из существующего поля.

### modify-filter — изменить существующий фильтр в варианте

```powershell
-Operation modify-filter -Value "Организация >= bar @off"
-Operation modify-filter -Value "Дата = 2025-01-01T00:00:00 @user @quickAccess"
```

Находит фильтр по полю (left), обновляет оператор, значение и флаги. Используется тот же shorthand что и `add-filter`.

### modify-dataParameter — изменить существующий параметр данных

```powershell
-Operation modify-dataParameter -Value "Период = ThisYear"
-Operation modify-dataParameter -Value "Организация @off @user"
```

Находит dataParameter по имени, обновляет значение и флаги. Используется тот же shorthand что и `add-dataParameter`.

### clear-selection — очистить выборку варианта

```powershell
-Operation clear-selection -Value "*"
```

Удаляет все элементы из `<dcsset:selection>`. Value игнорируется.

### clear-order — очистить сортировку варианта

```powershell
-Operation clear-order -Value "*"
```

Удаляет все элементы из `<dcsset:order>`. Value игнорируется.

### clear-filter — очистить фильтры варианта

```powershell
-Operation clear-filter -Value "*"
```

Удаляет все элементы из `<dcsset:filter>`. Value игнорируется.

### remove-field — удалить поле из набора данных

```powershell
-Operation remove-field -Value "Цена"
```

Удаляет поле с указанным dataPath. Также удаляет соответствующий элемент из selection варианта.

### remove-total — удалить итог

```powershell
-Operation remove-total -Value "Цена"
```

### remove-calculated-field — удалить вычисляемое поле

```powershell
-Operation remove-calculated-field -Value "Маржа"
```

Также удаляет из selection варианта.

### remove-parameter — удалить параметр

```powershell
-Operation remove-parameter -Value "Организация"
```

### remove-filter — удалить фильтр из варианта

```powershell
-Operation remove-filter -Value "Номенклатура"
```

Удаляет первый фильтр с указанным полем.

## Примеры

```powershell
# Добавить числовое поле с заголовком
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation add-field -Value "Цена [Цена, руб.]: decimal(15,2)"

# Пакетное добавление полей
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation add-field `
  -Value "Количество: decimal(15,3) ;; Сумма: decimal(15,2) ;; Валюта: string"

# Добавить итог
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation add-total -Value "Цена: Среднее"

# Добавить параметр данных
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation add-dataParameter -Value "Период = LastMonth @user"

# Установить заголовок
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation set-outputParameter -Value "Заголовок = Мой отчёт"

# Удалить поле
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation remove-field -Value "Цена"

# Добавить фильтр
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation add-filter -Value "Организация = _ @off @user"

# Заменить запрос
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation set-query -Value "ВЫБРАТЬ 1 КАК Тест"

# Установить структуру группировок
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation set-structure -Value "Организация > Номенклатура > details"

# Модифицировать поле
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation modify-field -Value "Цена [Цена USD]: decimal(10,4) @dimension"

# Модифицировать фильтр
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation modify-filter -Value "Организация >= bar @off"

# Очистить выборку и установить заново
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation clear-selection -Value "*"
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation add-selection -Value "Auto"

# Добавить связь наборов данных
powershell.exe -NoProfile -File .claude\skills\skd-edit\scripts\skd-edit.ps1 `
  -TemplatePath test-tmp\edit-test.xml -Operation add-dataSetLink -Value "Набор1 > Набор2 on Поле1 = Поле2"
```

## Верификация

```
/skd-validate <TemplatePath>    — валидация структуры после редактирования
/skd-info <TemplatePath>        — визуальная сводка
```

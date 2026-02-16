---
name: meta-remove
description: Удалить объект метаданных из конфигурации 1С. Используй когда пользователь просит удалить, убрать объект из конфигурации
argument-hint: <ConfigDir> -Object <Type.Name>
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# /meta-remove — удаление объекта метаданных

Удаляет объект из XML-выгрузки конфигурации: файлы, регистрацию в Configuration.xml, ссылки в подсистемах.

## Использование

```
/meta-remove <ConfigDir> -Object <Type.Name>
```

## Параметры

| Параметр   | Обязательный | Описание                                        |
|------------|:------------:|-------------------------------------------------|
| ConfigDir  | да           | Корневая директория выгрузки (где Configuration.xml) |
| Object     | да           | Тип и имя объекта: `Catalog.Товары`, `Document.Заказ` и т.д. |
| DryRun     | нет          | Только показать что будет удалено, без изменений |
| KeepFiles  | нет          | Не удалять файлы, только дерегистрировать       |

## Команда

```powershell
powershell.exe -NoProfile -File .claude\skills\meta-remove\scripts\meta-remove.ps1 -ConfigDir "<путь>" -Object "Catalog.Товары"
```

## Что делает

1. **Находит файлы объекта**: `{TypePlural}/{Name}.xml` и `{TypePlural}/{Name}/` (каталог с модулями, формами, макетами)
2. **Удаляет из Configuration.xml**: убирает `<Type>Name</Type>` из `<ChildObjects>`
3. **Очищает подсистемы**: рекурсивно обходит все `Subsystems/` и удаляет `<v8:Value>Type.Name</v8:Value>` из `<Content>`
4. **Удаляет файлы**: XML-файл и каталог объекта

## Поддерживаемые типы

Catalog, Document, Enum, Constant, InformationRegister, AccumulationRegister, AccountingRegister, CalculationRegister, ChartOfAccounts, ChartOfCharacteristicTypes, ChartOfCalculationTypes, BusinessProcess, Task, ExchangePlan, DocumentJournal, Report, DataProcessor, CommonModule, ScheduledJob, EventSubscription, HTTPService, WebService, DefinedType, Role, Subsystem, CommonForm, CommonTemplate, CommonPicture, CommonAttribute, SessionParameter, FunctionalOption, FunctionalOptionsParameter, Sequence, FilterCriterion, SettingsStorage, XDTOPackage, WSReference, StyleItem, Language

## Вывод

```
=== meta-remove: Catalog.Устаревший ===

[FOUND] Catalogs/Устаревший.xml
[FOUND] Catalogs/Устаревший/ (8 files)

--- Configuration.xml ---
[OK]    Removed <Catalog>Устаревший</Catalog> from ChildObjects
[OK]    Configuration.xml saved

--- Subsystems ---
[OK]    Removed from subsystem 'Справочники'
[OK]    Removed from subsystem 'НСИ'

--- Files ---
[OK]    Deleted directory: Catalogs/Устаревший/
[OK]    Deleted file: Catalogs/Устаревший.xml

=== Done: 4 actions performed (2 subsystem references removed) ===
```

Код возврата: 0 = успешно, 1 = ошибки.

## Безопасность

- **Рекомендуется**: сначала запустить с `-DryRun` для проверки
- **ВАЖНО**: перед удалением убедитесь что на объект нет ссылок в коде (типы реквизитов, запросы, вызовы модулей)
- Скрипт НЕ проверяет ссылки из кода — только структурные (Configuration.xml, подсистемы)
- Для проверки ссылок из кода используйте поиск по конфигурации: `grep -r "Type.Name" <ConfigDir>`

## Примеры

```powershell
# Dry run — посмотреть что будет удалено
... -ConfigDir C:\WS\tasks\cfsrc\acc_8.3.24 -Object "Catalog.Устаревший" -DryRun

# Удалить объект полностью
... -ConfigDir C:\WS\tasks\cfsrc\acc_8.3.24 -Object "Catalog.Устаревший"

# Только дерегистрировать (файлы оставить)
... -ConfigDir C:\WS\tasks\cfsrc\acc_8.3.24 -Object "Report.Старый" -KeepFiles

# Удалить общий модуль
... -ConfigDir src -Object "CommonModule.МойМодуль"
```

## Когда использовать

- **Рефакторинг**: удаление неиспользуемых объектов
- **Очистка**: удаление временных/тестовых объектов
- **Перенос**: удаление объекта перед пересозданием с другой структурой

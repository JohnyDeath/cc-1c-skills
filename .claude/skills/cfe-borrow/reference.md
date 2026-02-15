# /cfe-borrow — Заимствование объектов из конфигурации в расширение

Заимствует объекты из основной конфигурации в расширение. Создаёт минимальные XML-файлы с `ObjectBelonging=Adopted` и `ExtendedConfigurationObject`, добавляет запись в ChildObjects расширения.

## Параметры

| Параметр | Описание |
|----------|----------|
| `ExtensionPath` | Путь к каталогу расширения (обязат.) |
| `ConfigPath` | Путь к конфигурации-источнику (обязат.) |
| `Object` | Что заимствовать, batch через `;;` (обязат.) |

## Формат -Object

- `Catalog.Контрагенты` — справочник
- `CommonModule.РаботаСФайлами` — общий модуль
- `Enum.ВидыОплат` — перечисление
- `Document.РеализацияТоваров` — документ
- `Catalog.X ;; CommonModule.Y ;; Enum.Z` — batch

## Алгоритм

1. Загружает Configuration.xml расширения, определяет NamePrefix
2. Загружает XML объекта из конфигурации-источника
3. Создаёт XML заимствованного объекта:
   - `ObjectBelonging: Adopted`
   - `ExtendedConfigurationObject: <uuid из конфигурации>`
   - `Name: <имя из конфигурации>`
   - `InternalInfo` с `GeneratedType` (копируется из конфигурации)
4. Добавляет в `ChildObjects` расширения в каноническую позицию
5. Создаёт каталог и XML-файл

## Примеры

```powershell
# Заимствовать справочник
... -ExtensionPath src -ConfigPath C:\cfsrc\erp -Object "Catalog.Контрагенты"

# Несколько объектов
... -ExtensionPath src -ConfigPath C:\cfsrc\erp -Object "Catalog.Контрагенты ;; CommonModule.ОбщийМодульСервер ;; Enum.ВидыОплат"
```

## Верификация

```
/cfe-borrow -ExtensionPath src -ConfigPath C:\cfsrc\erp -Object "Catalog.Контрагенты"
/cfe-validate src      — проверить результат
```

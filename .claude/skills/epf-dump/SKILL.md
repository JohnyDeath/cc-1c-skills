---
name: epf-dump
description: Разобрать EPF-файл обработки 1С (EPF/ERF) в XML-исходники
argument-hint: <EpfFile>
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# /epf-dump — Разборка обработки

Разбирает EPF-файл во XML-исходники с помощью платформы 1С (иерархический формат). Та же команда CLI работает и для внешних отчётов (ERF) — см. `/erf-dump`.

## Usage

```
/epf-dump <EpfFile> [OutDir]
```

| Параметр | Обязательный | По умолчанию | Описание                            |
|----------|:------------:|--------------|-------------------------------------|
| EpfFile  | да           | —            | Путь к EPF-файлу                    |
| OutDir   | нет          | `src`        | Каталог для выгрузки исходников     |

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Возьми `v8path` (путь к платформе) и разреши базу:
1. Если пользователь указал базу — ищи по id / alias / name
2. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
3. Если ветка не совпала — используй `default`
4. Если `.v8-project.json` нет или баз нет — создай пустую ИБ в `./base`
Если `v8path` не задан — автоопределение: `Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort -Desc | Select -First 1`

## Команды

### 1. Создать ИБ (если нет зарегистрированной базы)

```cmd
"<v8path>\1cv8.exe" CREATEINFOBASE File="./base"
```

### 2. Разборка EPF в XML

Файловая база:
```cmd
"<v8path>\1cv8.exe" DESIGNER /F "<база>" /DisableStartupDialogs /DumpExternalDataProcessorOrReportToFiles "<OutDir>" "<EpfFile>" -Format Hierarchical /Out "<OutDir>\dump.log"
```
Серверная база — вместо `/F` используй `/S`, добавь `/N"<user>" /P"<pwd>"` при наличии учётных данных.

## Коды возврата

| Код | Описание                    |
|-----|-----------------------------|
| 0   | Успешная разборка           |
| 1   | Ошибка (см. лог)           |

## Формат `-Format Hierarchical`

Ключ `-Format Hierarchical` создаёт структуру каталогов:

```
<OutDir>/
├── <Name>.xml                    # Корневой файл
└── <Name>/
    ├── Ext/
    │   └── ObjectModule.bsl      # Модуль объекта (если есть)
    ├── Forms/
    │   ├── <FormName>.xml
    │   └── <FormName>/
    │       └── Ext/
    │           ├── Form.xml
    │           └── Form/
    │               └── Module.bsl
    └── Templates/
        ├── <TemplateName>.xml
        └── <TemplateName>/
            └── Ext/
                └── Template.<ext>
```

## Пример полного цикла

```powershell
# Параметры из .v8-project.json:
$v8path = "C:\Program Files\1cv8\8.3.25.1257\bin"  # v8path
$base   = "C:\Bases\MyDB"                           # databases[].path

# Разобрать
& "$v8path\1cv8.exe" DESIGNER /F $base /DisableStartupDialogs /DumpExternalDataProcessorOrReportToFiles "src" "build\МояОбработка.epf" -Format Hierarchical /Out "build\dump.log"
```
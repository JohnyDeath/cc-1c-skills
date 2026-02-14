---
name: erf-dump
description: Разобрать ERF-файл отчёта 1С в XML-исходники
argument-hint: <ErfFile>
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# /erf-dump — Разборка отчёта

Разбирает ERF-файл во XML-исходники с помощью платформы 1С (иерархический формат). Использует ту же команду CLI, что и `/epf-dump`.

## Usage

```
/erf-dump <ErfFile> [OutDir]
```

| Параметр | Обязательный | По умолчанию | Описание                            |
|----------|:------------:|--------------|-------------------------------------|
| ErfFile  | да           | —            | Путь к ERF-файлу                    |
| OutDir   | нет          | `src`        | Каталог для выгрузки исходников     |

## Переменные окружения

| Переменная | Описание                              | Пример                                        |
|------------|---------------------------------------|-----------------------------------------------|
| V8_PATH    | Каталог bin платформы 1С              | `C:\Program Files\1cv8\8.3.25.1257\bin`       |
| V8_BASE    | Путь к пустой файловой ИБ            | `.\base`                                      |

## Команды

### 1. Создать пустую ИБ (если нет)

```cmd
"%V8_PATH%\1cv8.exe" CREATEINFOBASE File="%V8_BASE%"
```

### 2. Разборка ERF в XML

```cmd
"%V8_PATH%\1cv8.exe" DESIGNER /F "%V8_BASE%" /DisableStartupDialogs /DumpExternalDataProcessorOrReportToFiles "<OutDir>" "<ErfFile>" -Format Hierarchical /Out "<OutDir>\dump.log"
```

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
$env:V8_PATH = "C:\Program Files\1cv8\8.3.25.1257\bin"
$env:V8_BASE = ".\base"

# Создать ИБ
& "$env:V8_PATH\1cv8.exe" CREATEINFOBASE "File=$env:V8_BASE"

# Разобрать
& "$env:V8_PATH\1cv8.exe" DESIGNER /F $env:V8_BASE /DisableStartupDialogs /DumpExternalDataProcessorOrReportToFiles "src" "build\МойОтчёт.erf" -Format Hierarchical /Out "build\dump.log"
```

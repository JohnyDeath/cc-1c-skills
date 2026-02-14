---
name: erf-build
description: Собрать внешний отчёт 1С (ERF) из XML-исходников
argument-hint: <ReportName>
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# /erf-build — Сборка отчёта

Собирает ERF-файл из XML-исходников с помощью платформы 1С. Использует ту же команду CLI, что и `/epf-build`.

## Usage

```
/erf-build <ReportName> [SrcDir] [OutDir]
```

| Параметр   | Обязательный | По умолчанию | Описание                             |
|------------|:------------:|--------------|--------------------------------------|
| ReportName | да           | —            | Имя отчёта (имя корневого XML)       |
| SrcDir     | нет          | `src`        | Каталог исходников                   |
| OutDir     | нет          | `build`      | Каталог для результата               |

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

### 2. Сборка ERF из XML

```cmd
"%V8_PATH%\1cv8.exe" DESIGNER /F "%V8_BASE%" /DisableStartupDialogs /LoadExternalDataProcessorOrReportFromFiles "<SrcDir>\<ReportName>.xml" "<OutDir>\<ReportName>.erf" /Out "<OutDir>\build.log"
```

## Коды возврата

| Код | Описание                    |
|-----|-----------------------------|
| 0   | Успешная сборка             |
| 1   | Ошибка (см. лог)           |

## Автоопределение платформы (Windows)

Если `V8_PATH` не задан, можно найти автоматически:

```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1
```

## Ссылочные типы и выбор базы

Пустая ИБ (`V8_BASE`) подходит для сборки, если формы используют только базовые типы (`xs:string`, `xs:boolean` и т.д.) или тип самого отчёта (`ExternalReportObject.Имя`).

Если отчёт использует ссылочные типы конфигурации (`CatalogRef.XXX`, `DocumentRef.XXX` и т.д.) — в реквизитах объекта, табличных частях или реквизитах форм — **сборка в пустой базе упадёт** с ошибкой XDTO. Платформа не может резолвить типы, отсутствующие в конфигурации базы.

**Решение**: собирать в базе с целевой конфигурацией. Если конфигурация неизвестна — спросить пользователя путь к базе.

## Пример полного цикла

```powershell
$env:V8_PATH = "C:\Program Files\1cv8\8.3.25.1257\bin"
$env:V8_BASE = ".\base"

# Создать ИБ
& "$env:V8_PATH\1cv8.exe" CREATEINFOBASE "File=$env:V8_BASE"

# Собрать
& "$env:V8_PATH\1cv8.exe" DESIGNER /F $env:V8_BASE /DisableStartupDialogs /LoadExternalDataProcessorOrReportFromFiles "src\МойОтчёт.xml" "build\МойОтчёт.erf" /Out "build\build.log"
```

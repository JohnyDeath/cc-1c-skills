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

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Возьми `v8path` (путь к платформе) и разреши базу для сборки:
1. Если пользователь указал параметры подключения (путь, сервер) — используй напрямую
2. Если указал базу по имени — ищи по id / alias / name в `.v8-project.json`
3. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
4. Если ветка не совпала — используй `default`
5. Если `.v8-project.json` нет или баз нет — создай пустую ИБ в `./base`
Если `v8path` не задан — автоопределение: `Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort -Desc | Select -First 1`
Если использованная база не зарегистрирована — после выполнения предложи добавить через `/db-list add`.

## Команды

### 1. Создать ИБ для сборки (если нет зарегистрированной базы)

```cmd
"<v8path>\1cv8.exe" CREATEINFOBASE File="./base"
```

### 2. Сборка ERF из XML

Файловая база:
```cmd
"<v8path>\1cv8.exe" DESIGNER /F "<база>" /DisableStartupDialogs /LoadExternalDataProcessorOrReportFromFiles "<SrcDir>\<ReportName>.xml" "<OutDir>\<ReportName>.erf" /Out "<OutDir>\build.log"
```
Серверная база — вместо `/F` используй `/S`, добавь `/N"<user>" /P"<pwd>"` при наличии учётных данных.

## Коды возврата

| Код | Описание                    |
|-----|-----------------------------|
| 0   | Успешная сборка             |
| 1   | Ошибка (см. лог)           |

## Ссылочные типы

Если отчёт использует ссылочные типы конфигурации (`CatalogRef.XXX`, `DocumentRef.XXX`) — сборка в пустой базе упадёт с ошибкой XDTO. Зарегистрируй базу с целевой конфигурацией через `/db-list add`.

## Пример полного цикла

```powershell
# Параметры из .v8-project.json:
$v8path = "C:\Program Files\1cv8\8.3.25.1257\bin"  # v8path
$base   = "C:\Bases\MyDB"                           # databases[].path

# Собрать (база с конфигурацией — ссылочные типы резолвятся)
& "$v8path\1cv8.exe" DESIGNER /F $base /DisableStartupDialogs /LoadExternalDataProcessorOrReportFromFiles "src\МойОтчёт.xml" "build\МойОтчёт.erf" /Out "build\build.log"
```

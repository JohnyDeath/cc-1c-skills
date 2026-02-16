---
name: epf-build
description: Собрать внешнюю обработку 1С (EPF/ERF) из XML-исходников
argument-hint: <ProcessorName>
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# /epf-build — Сборка обработки

Собирает EPF-файл из XML-исходников с помощью платформы 1С. Та же команда CLI работает и для внешних отчётов (ERF) — см. `/erf-build`.

## Usage

```
/epf-build <ProcessorName> [SrcDir] [OutDir]
```

| Параметр      | Обязательный | По умолчанию | Описание                             |
|---------------|:------------:|--------------|--------------------------------------|
| ProcessorName | да           | —            | Имя обработки (имя корневого XML)    |
| SrcDir        | нет          | `src`        | Каталог исходников                   |
| OutDir        | нет          | `build`      | Каталог для результата               |

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Возьми `v8path` (путь к платформе) и разреши базу для сборки:
1. Если пользователь указал базу — ищи по id / alias / name
2. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
3. Если ветка не совпала — используй `default`
4. Если `.v8-project.json` нет или баз нет — создай пустую ИБ в `./base`
Если `v8path` не задан — автоопределение: `Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort -Desc | Select -First 1`

## Команды

### 1. Создать ИБ для сборки (если нет зарегистрированной базы)

```cmd
"<v8path>\1cv8.exe" CREATEINFOBASE File="./base"
```

### 2. Сборка EPF из XML

Файловая база:
```cmd
"<v8path>\1cv8.exe" DESIGNER /F "<база>" /DisableStartupDialogs /LoadExternalDataProcessorOrReportFromFiles "<SrcDir>\<ProcessorName>.xml" "<OutDir>\<ProcessorName>.epf" /Out "<OutDir>\build.log"
```
Серверная база — вместо `/F` используй `/S`, добавь `/N"<user>" /P"<pwd>"` при наличии учётных данных.

## Коды возврата

| Код | Описание                    |
|-----|-----------------------------|
| 0   | Успешная сборка             |
| 1   | Ошибка (см. лог)           |

## Ссылочные типы

Если обработка использует ссылочные типы конфигурации (`CatalogRef.XXX`, `DocumentRef.XXX`) — сборка в пустой базе упадёт с ошибкой XDTO. Зарегистрируй базу с целевой конфигурацией через `/db-list add`.

## Пример полного цикла

```powershell
# Параметры из .v8-project.json:
$v8path = "C:\Program Files\1cv8\8.3.25.1257\bin"  # v8path
$base   = "C:\Bases\MyDB"                           # databases[].path

# Собрать (база с конфигурацией — ссылочные типы резолвятся)
& "$v8path\1cv8.exe" DESIGNER /F $base /DisableStartupDialogs /LoadExternalDataProcessorOrReportFromFiles "src\МояОбработка.xml" "build\МояОбработка.epf" /Out "build\build.log"
```
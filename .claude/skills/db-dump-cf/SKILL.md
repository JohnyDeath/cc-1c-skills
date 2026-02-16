---
name: db-dump-cf
description: Выгрузка конфигурации 1С в CF-файл. Используй когда пользователь просит выгрузить конфигурацию в CF, сохранить конфигурацию, сделать бэкап CF
argument-hint: "[database] [output.cf]"
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# /db-dump-cf — Выгрузка конфигурации в CF-файл

Выгружает конфигурацию информационной базы в бинарный CF-файл.

## Usage

```
/db-dump-cf [database] [output.cf]
/db-dump-cf dev config.cf
/db-dump-cf                          — база по умолчанию, файл config.cf
```

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Возьми `v8path` (путь к платформе) и разреши базу:
1. Если пользователь указал — ищи по id / alias / name
2. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
3. Если ветка не совпала — используй `default`
Если `v8path` не задан — автоопределение: `Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort -Desc | Select -First 1`
Если файла нет — предложи `/db-list add`.

## Команда

```cmd
"<v8path>\1cv8.exe" DESIGNER /F "<база>" /N"<user>" /P"<pwd>" /DumpCfg "<файл.cf>" /DisableStartupDialogs /Out "<лог>"
```

Для серверной базы вместо `/F` используй `/S`:
```cmd
"<v8path>\1cv8.exe" DESIGNER /S "<server>/<ref>" /N"<user>" /P"<pwd>" /DumpCfg "<файл.cf>" /DisableStartupDialogs /Out "<лог>"
```

### Параметры

| Параметр | Описание |
|----------|----------|
| `/DumpCfg <файл>` | Путь к выходному CF-файлу |
| `-Extension <имя>` | Выгрузить расширение (вместо основной конфигурации) |
| `-AllExtensions` | Выгрузить все расширения (архив расширений) |

## Коды возврата

| Код | Описание |
|-----|----------|
| 0 | Успешно |
| 1 | Ошибка (см. лог) |

## После выполнения

Прочитай лог-файл и покажи результат. Если есть ошибки — покажи содержимое лога.

## Пример

```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1

& $v8.FullName DESIGNER /F "C:\Bases\MyDB" /N"Admin" /P"" /DumpCfg "C:\backup\config.cf" /DisableStartupDialogs /Out "dump.log"
```

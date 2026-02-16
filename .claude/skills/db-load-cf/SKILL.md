---
name: db-load-cf
description: Загрузка конфигурации 1С из CF-файла. Используй когда пользователь просит загрузить конфигурацию из CF, восстановить из бэкапа CF
argument-hint: <input.cf> [database]
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# /db-load-cf — Загрузка конфигурации из CF-файла

Загружает конфигурацию из бинарного CF-файла в информационную базу.

## Usage

```
/db-load-cf <input.cf> [database]
/db-load-cf config.cf dev
```

> **Внимание**: загрузка CF **полностью заменяет** конфигурацию в базе. Перед выполнением запроси подтверждение у пользователя.

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Возьми `v8path` (путь к платформе) и разреши базу:
1. Если пользователь указал — ищи по id / alias / name
2. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
3. Если ветка не совпала — используй `default`
Если `v8path` не задан — автоопределение: `Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort -Desc | Select -First 1`
Если файла нет — предложи `/db-list add`.

## Команда

```cmd
"<v8path>\1cv8.exe" DESIGNER /F "<база>" /N"<user>" /P"<pwd>" /LoadCfg "<файл.cf>" /DisableStartupDialogs /Out "<лог>"
```

Для серверной базы вместо `/F` используй `/S`:
```cmd
"<v8path>\1cv8.exe" DESIGNER /S "<server>/<ref>" /N"<user>" /P"<pwd>" /LoadCfg "<файл.cf>" /DisableStartupDialogs /Out "<лог>"
```

### Параметры

| Параметр | Описание |
|----------|----------|
| `/LoadCfg <файл>` | Путь к CF-файлу |
| `-Extension <имя>` | Загрузить как расширение |
| `-AllExtensions` | Загрузить все расширения из архива |

## Коды возврата

| Код | Описание |
|-----|----------|
| 0 | Успешно |
| 1 | Ошибка (см. лог) |

## После выполнения

1. Прочитай лог-файл и покажи результат
2. **Предложи выполнить `/db-update`** — загрузка CF обновляет только «основную» конфигурацию конфигуратора, для применения к БД нужен `/UpdateDBCfg`

## Примеры

```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1

# Файловая база
& $v8.FullName DESIGNER /F "C:\Bases\MyDB" /N"Admin" /LoadCfg "C:\backup\config.cf" /DisableStartupDialogs /Out "load.log"

# Серверная база
& $v8.FullName DESIGNER /S "srv01/MyApp_Test" /N"Admin" /P"secret" /LoadCfg "config.cf" /DisableStartupDialogs /Out "load.log"

# Не забудь обновить БД после загрузки!
& $v8.FullName DESIGNER /F "C:\Bases\MyDB" /N"Admin" /UpdateDBCfg /DisableStartupDialogs /Out "update.log"
```

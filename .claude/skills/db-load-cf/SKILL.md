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

## Разрешение базы данных

1. Прочитай `.v8-project.json` (в корне проекта или ближайшем родительском каталоге)
2. Если пользователь указал базу — найди по id/alias/branch/имени
3. Если не указал — используй `default`
4. Если не найдено или неоднозначно — спроси пользователя
5. Если файл не найден — спроси пользователя параметры подключения и предложи создать `.v8-project.json`

Автоопределение платформы (если `v8path` не задан):
```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1
```

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

## Пример

```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1

& $v8.FullName DESIGNER /F "C:\Bases\MyDB" /N"Admin" /P"" /LoadCfg "C:\backup\config.cf" /DisableStartupDialogs /Out "load.log"

# Не забудь обновить БД после загрузки!
& $v8.FullName DESIGNER /F "C:\Bases\MyDB" /N"Admin" /P"" /UpdateDBCfg /DisableStartupDialogs /Out "update.log"
```

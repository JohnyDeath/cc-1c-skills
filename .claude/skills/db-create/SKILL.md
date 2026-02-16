---
name: db-create
description: Создание информационной базы 1С. Используй когда пользователь просит создать базу, новую ИБ, пустую базу
argument-hint: <path|name>
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - AskUserQuestion
---

# /db-create — Создание информационной базы

Создаёт новую информационную базу 1С (файловую или серверную) и предлагает зарегистрировать в `.v8-project.json`.

## Usage

```
/db-create <path>                   — файловая база по указанному пути
/db-create <server>/<name>          — серверная база
/db-create                          — интерактивно
```

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта для `v8path` (путь к платформе).
Если `v8path` не задан — автоопределение: `Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort -Desc | Select -First 1`
После создания базы предложи зарегистрировать через `/db-list add`.

## Команды

### Файловая база

```cmd
"<v8path>\1cv8.exe" CREATEINFOBASE File="<путь>" /DisableStartupDialogs /Out "<лог>"
```

### Серверная база

```cmd
"<v8path>\1cv8.exe" CREATEINFOBASE Srvr="<сервер>";Ref="<имя>" /DisableStartupDialogs /Out "<лог>"
```

### Параметры

| Параметр | Описание |
|----------|----------|
| `File="<путь>"` | Строка соединения для файловой базы |
| `Srvr="<сервер>";Ref="<имя>"` | Строка соединения для серверной базы |
| `/AddToList [<имя>]` | Добавить в список баз 1С (необязательно) |
| `/UseTemplate <файл>` | Создать из шаблона (.cf или .dt) |
| `/DisableStartupDialogs` | Подавить диалоги |
| `/Out <файл>` | Лог-файл |

## Коды возврата

| Код | Описание |
|-----|----------|
| 0 | Успешно |
| 1 | Ошибка (см. лог) |

## После создания

1. Прочитай лог-файл и покажи результат
2. Предложи зарегистрировать базу в `.v8-project.json` (через `/db-list add`)
3. Если указан шаблон `/UseTemplate` — предупреди что конфигурация будет загружена из шаблона

## Примеры

```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1

# Создать файловую базу
& $v8.FullName CREATEINFOBASE File="C:\Bases\NewDB" /DisableStartupDialogs /Out "create.log"

# Создать серверную базу
& $v8.FullName CREATEINFOBASE Srvr="srv01";Ref="MyApp_Test" /DisableStartupDialogs /Out "create.log"

# Создать из шаблона CF
& $v8.FullName CREATEINFOBASE File="C:\Bases\NewDB" /UseTemplate "C:\Templates\config.cf" /DisableStartupDialogs /Out "create.log"
```

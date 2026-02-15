---
name: db-dump-cf
description: Выгрузка конфигурации 1С в CF-файл. Используй когда пользователь просит выгрузить конфигурацию в CF, сохранить конфигурацию, сделать бэкап CF
argument-hint: [database] [output.cf]
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

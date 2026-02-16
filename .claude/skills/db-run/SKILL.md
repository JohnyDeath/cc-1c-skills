---
name: db-run
description: Запуск 1С:Предприятие. Используй когда пользователь просит запустить 1С, открыть базу, запустить предприятие
argument-hint: "[database]"
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# /db-run — Запуск 1С:Предприятие

Запускает информационную базу в режиме 1С:Предприятие (пользовательский режим).

## Usage

```
/db-run [database]
/db-run dev
/db-run dev /Execute process.epf
/db-run dev /C "параметр запуска"
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
"<v8path>\1cv8.exe" ENTERPRISE /F "<база>" /N"<user>" /P"<pwd>" /DisableStartupDialogs
```

Для серверной базы вместо `/F` используй `/S`:
```cmd
"<v8path>\1cv8.exe" ENTERPRISE /S "<server>/<ref>" /N"<user>" /P"<pwd>" /DisableStartupDialogs
```

### Параметры

| Параметр | Описание |
|----------|----------|
| `/Execute <файл.epf>` | Запуск внешней обработки сразу после старта |
| `/C <строка>` | Передача параметра в прикладное решение |
| `/URL <ссылка>` | Навигационная ссылка (формат `e1cib/...`) |

> При указании `/Execute` параметр `/URL` игнорируется.

## Важно

**Запуск в фоне** — не жди завершения процесса 1С. Используй `Start-Process` без `-Wait`:

```powershell
Start-Process -FilePath "<v8path>\1cv8.exe" -ArgumentList 'ENTERPRISE /F "<база>" /N"<user>" /P"<pwd>" /DisableStartupDialogs'
```

Или через Bash:
```bash
"<v8path>/1cv8.exe" ENTERPRISE /F "<база>" /N"<user>" /P"<pwd>" /DisableStartupDialogs &
```

## Примеры

```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1

# Простой запуск
Start-Process -FilePath $v8.FullName -ArgumentList 'ENTERPRISE /F "C:\Bases\MyDB" /N"Admin" /P"" /DisableStartupDialogs'

# Запуск с обработкой
Start-Process -FilePath $v8.FullName -ArgumentList 'ENTERPRISE /F "C:\Bases\MyDB" /N"Admin" /P"" /Execute "C:\epf\МояОбработка.epf" /DisableStartupDialogs'

# Открыть по навигационной ссылке
Start-Process -FilePath $v8.FullName -ArgumentList 'ENTERPRISE /F "C:\Bases\MyDB" /N"Admin" /P"" /URL "e1cib/data/Справочник.Номенклатура" /DisableStartupDialogs'
```

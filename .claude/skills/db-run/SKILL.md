---
name: db-run
description: Запуск 1С:Предприятие. Используй когда пользователь просит запустить 1С, открыть базу, запустить предприятие
argument-hint: [database]
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

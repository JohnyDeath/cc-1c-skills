---
name: web-unpublish
description: Удаление веб-публикации 1С. Используй когда пользователь просит убрать публикацию, удалить веб-доступ к базе
argument-hint: "<appname>"
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# /web-unpublish — Удаление публикации 1С

Удаляет публикацию из httpd.conf и каталог `publish/{appname}`. Если других публикаций не осталось — удаляет глобальный блок 1C и останавливает Apache.

## Usage

```
/web-unpublish <appname>
/web-unpublish bpdemo
```

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Если задан `webPath` — используй как `-ApachePath`.
По умолчанию `tools/apache24` от корня проекта.

Если пользователь не указал `appname`, выполни `/web-info` чтобы показать список публикаций и спроси какую удалить.

## Команда

```powershell
powershell.exe -NoProfile -File .claude/skills/web-unpublish/scripts/web-unpublish.ps1 <параметры>
```

### Параметры скрипта

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-AppName <имя>` | да | Имя публикации |
| `-ApachePath <путь>` | нет | Корень Apache (по умолчанию `tools/apache24`) |

## Примеры

```powershell
# Удалить публикацию
powershell.exe -NoProfile -File .claude/skills/web-unpublish/scripts/web-unpublish.ps1 -AppName "bpdemo"

# С указанием пути
powershell.exe -NoProfile -File .claude/skills/web-unpublish/scripts/web-unpublish.ps1 -AppName "mydb" -ApachePath "C:\tools\apache24"
```

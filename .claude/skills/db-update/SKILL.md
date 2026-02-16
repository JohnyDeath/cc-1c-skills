---
name: db-update
description: Обновление конфигурации базы данных 1С. Используй когда пользователь просит обновить БД, применить конфигурацию, UpdateDBCfg
argument-hint: "[database]"
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# /db-update — Обновление конфигурации БД

Применяет изменения основной конфигурации к конфигурации базы данных (`/UpdateDBCfg`). Обязательный шаг после `/db-load-cf`, `/db-load-xml`, `/db-load-git`.

## Usage

```
/db-update [database]
/db-update dev
/db-update dev -Dynamic+
```

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Возьми `v8path` (путь к платформе) и разреши базу:
1. Если пользователь указал параметры подключения (путь, сервер) — используй напрямую
2. Если указал базу по имени — ищи по id / alias / name в `.v8-project.json`
3. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
4. Если ветка не совпала — используй `default`
Если `v8path` не задан — автоопределение: `Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort -Desc | Select -First 1`
Если файла нет — предложи `/db-list add`.
Если использованная база не зарегистрирована — после выполнения предложи добавить через `/db-list add`.

## Команда

```cmd
"<v8path>\1cv8.exe" DESIGNER /F "<база>" /N"<user>" /P"<pwd>" /UpdateDBCfg /DisableStartupDialogs /Out "<лог>"
```

Для серверной базы вместо `/F` используй `/S`:
```cmd
"<v8path>\1cv8.exe" DESIGNER /S "<server>/<ref>" /N"<user>" /P"<pwd>" /UpdateDBCfg /DisableStartupDialogs /Out "<лог>"
```

### Параметры

| Параметр | Описание |
|----------|----------|
| `/UpdateDBCfg` | Обновить конфигурацию БД |
| `-Dynamic+` | Динамическое обновление (без монопольного доступа) |
| `-Dynamic-` | Отключить динамическое обновление |
| `-Server` | Обновление на стороне сервера |
| `-WarningsAsErrors` | Предупреждения считать ошибками |
| `-Extension <имя>` | Обновить расширение |
| `-AllExtensions` | Обновить все расширения |

### Фоновое обновление (серверная база)

| Параметр | Описание |
|----------|----------|
| `-BackgroundStart` | Начать фоновое обновление |
| `-BackgroundFinish` | Дождаться окончания |
| `-BackgroundCancel` | Отменить |
| `-BackgroundSuspend` | Приостановить |
| `-BackgroundResume` | Возобновить |

## Коды возврата

| Код | Описание |
|-----|----------|
| 0 | Успешно |
| 1 | Ошибка (см. лог) |

## Предупреждения

- Если обновление **не динамическое** — потребуется **монопольный доступ** к базе (все пользователи должны выйти)
- Для серверных баз рекомендуется `-Dynamic+` для обновления без остановки
- Если структура данных существенно изменилась (удаление реквизитов, изменение типов) — динамическое обновление может быть невозможно

## Пример

```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1

# Обычное обновление
& $v8.FullName DESIGNER /F "C:\Bases\MyDB" /N"Admin" /P"" /UpdateDBCfg /DisableStartupDialogs /Out "update.log"

# Динамическое обновление
& $v8.FullName DESIGNER /S "srv01/MyDB" /N"Admin" /P"secret" /UpdateDBCfg -Dynamic+ /DisableStartupDialogs /Out "update.log"
```

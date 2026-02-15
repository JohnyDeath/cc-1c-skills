---
name: db-dump-xml
description: Выгрузка конфигурации 1С в XML-файлы. Используй когда пользователь просит выгрузить конфигурацию в файлы, XML, исходники, DumpConfigToFiles
argument-hint: [database] [outputDir]
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# /db-dump-xml — Выгрузка конфигурации в XML

Выгружает конфигурацию информационной базы в XML-файлы (исходники). Поддерживает полную, инкрементальную, частичную выгрузку и обновление ConfigDumpInfo.

## Usage

```
/db-dump-xml [database] [outputDir]
/db-dump-xml dev src/config
/db-dump-xml dev src/config -Mode Full
/db-dump-xml dev src/config -Mode Partial -Objects "Справочник.Номенклатура,Документ.Заказ"
```

## Разрешение базы данных

1. Прочитай `.v8-project.json` (в корне проекта или ближайшем родительском каталоге)
2. Если пользователь указал базу — найди по id/alias/branch/имени
3. Если не указал — используй `default`
4. Если не найдено или неоднозначно — спроси пользователя
5. Если файл не найден — спроси пользователя параметры подключения и предложи создать `.v8-project.json`

Если в записи базы указан `configSrc` — используй его как каталог выгрузки по умолчанию.

Автоопределение платформы (если `v8path` не задан):
```powershell
$v8 = Get-ChildItem "C:\Program Files\1cv8\*\bin\1cv8.exe" | Sort-Object -Descending | Select-Object -First 1
```

## Команда

```powershell
powershell.exe -NoProfile -File .claude\skills\db-dump-xml\scripts\db-dump-xml.ps1 <параметры>
```

### Параметры скрипта

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-V8Path <путь>` | нет | Каталог bin платформы (или полный путь к 1cv8.exe) |
| `-InfoBasePath <путь>` | * | Файловая база |
| `-InfoBaseServer <сервер>` | * | Сервер 1С (для серверной базы) |
| `-InfoBaseRef <имя>` | * | Имя базы на сервере |
| `-UserName <имя>` | нет | Имя пользователя |
| `-Password <пароль>` | нет | Пароль |
| `-ConfigDir <путь>` | да | Каталог для выгрузки |
| `-Mode <режим>` | нет | `Full` / `Changes` (по умолч.) / `Partial` / `UpdateInfo` |
| `-Objects <список>` | для Partial | Имена объектов через запятую |
| `-Extension <имя>` | нет | Выгрузить расширение |
| `-AllExtensions` | нет | Выгрузить все расширения |
| `-Format <формат>` | нет | `Hierarchical` (по умолч.) / `Plain` |

> `*` — нужен либо `-InfoBasePath`, либо пара `-InfoBaseServer` + `-InfoBaseRef`

### Режимы выгрузки

| Режим | Описание |
|-------|----------|
| `Full` | Полная выгрузка — все объекты конфигурации |
| `Changes` | Инкрементальная — только изменённые с последней выгрузки (использует ConfigDumpInfo.xml) |
| `Partial` | Частичная — выбранные объекты из параметра `-Objects` |
| `UpdateInfo` | Обновить только ConfigDumpInfo.xml без выгрузки файлов |

## Коды возврата

| Код | Описание |
|-----|----------|
| 0 | Успешно |
| 1 | Ошибка (см. лог) |

## Примеры

```powershell
# Полная выгрузка
powershell.exe -NoProfile -File .claude\skills\db-dump-xml\scripts\db-dump-xml.ps1 -V8Path "C:\Program Files\1cv8\8.3.25.1257\bin" -InfoBasePath "C:\Bases\MyDB" -UserName "Admin" -Password "" -ConfigDir "C:\WS\cfsrc" -Mode Full

# Инкрементальная выгрузка
powershell.exe -NoProfile -File .claude\skills\db-dump-xml\scripts\db-dump-xml.ps1 -V8Path "C:\Program Files\1cv8\8.3.25.1257\bin" -InfoBasePath "C:\Bases\MyDB" -UserName "Admin" -ConfigDir "C:\WS\cfsrc" -Mode Changes

# Частичная выгрузка
powershell.exe -NoProfile -File .claude\skills\db-dump-xml\scripts\db-dump-xml.ps1 -InfoBasePath "C:\Bases\MyDB" -UserName "Admin" -ConfigDir "C:\WS\cfsrc" -Mode Partial -Objects "Справочник.Номенклатура,Документ.Заказ"

# Выгрузка расширения
powershell.exe -NoProfile -File .claude\skills\db-dump-xml\scripts\db-dump-xml.ps1 -InfoBasePath "C:\Bases\MyDB" -UserName "Admin" -ConfigDir "C:\WS\ext_src" -Mode Full -Extension "МоёРасширение"
```

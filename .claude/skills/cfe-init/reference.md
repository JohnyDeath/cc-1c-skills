# /cfe-init — Создание расширения конфигурации 1С (CFE)

Создаёт scaffold исходников расширения конфигурации 1С: `Configuration.xml`, `Languages/Русский.xml`, опционально `Roles/`.

## Рекомендуемый пайплайн

Перед вызовом cfe-init рекомендуется запустить `cf-info -ConfigPath <путь к конфигурации> -Mode brief`, чтобы получить:
- `CompatibilityMode` → передать в `-CompatibilityMode`
- Версию конфигурации → по умолчанию `-Version` = `<ВерсияКонфигурации>.1`

## Параметры

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `Name` | Имя расширения (обязат.) | — |
| `Synonym` | Синоним | = Name |
| `NamePrefix` | Префикс собственных объектов | = Name + "_" |
| `OutputDir` | Каталог для создания | `src` |
| `Purpose` | Назначение: `Patch` / `Customization` / `AddOn` | `Customization` |
| `Version` | Версия расширения | — |
| `Vendor` | Поставщик | — |
| `CompatibilityMode` | Режим совместимости | `Version8_3_24` |
| `NoRole` | Без основной роли | false |

## Что создаётся

```
<OutputDir>/
├── Configuration.xml         # Свойства расширения
├── Languages/
│   └── Русский.xml           # Язык (заимствованный формат)
└── Roles/                    # Если не -NoRole
    └── <Prefix>ОсновнаяРоль.xml
```

## Примеры

```powershell
# Расширение-исправление для ERP
... -Name Расш1 -Purpose Patch -CompatibilityMode Version8_3_17 -OutputDir test-tmp/cfe

# Расширение-адаптация с версией
... -Name МоёРасширение -Purpose Customization -Version "1.0.0.1" -Vendor "Компания" -OutputDir test-tmp/cfe2

# Без роли
... -Name Расш2 -Purpose AddOn -NoRole -OutputDir test-tmp/cfe3

# С явным префиксом
... -Name ИсправлениеБага -NamePrefix "ИБ_" -Purpose Patch -OutputDir test-tmp/cfe4
```

## Верификация

```
/cfe-init МоёРасширение -OutputDir test-tmp/cfe
/cfe-validate test-tmp/cfe      — валидировать
```

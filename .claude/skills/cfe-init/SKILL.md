---
name: cfe-init
description: Создать расширение конфигурации 1С (CFE) — scaffold XML-исходников расширения
argument-hint: <Name> [-Purpose Patch|Customization|AddOn] [-CompatibilityMode Version8_3_24]
allowed-tools:
  - Bash
  - Read
  - Glob
---

Создаёт scaffold расширения конфигурации 1С: `Configuration.xml`, `Languages/Русский.xml`, опционально `Roles/`.

```powershell
powershell.exe -NoProfile -File .claude\skills\cfe-init\scripts\cfe-init.ps1 -Name "МоёРасширение"
```

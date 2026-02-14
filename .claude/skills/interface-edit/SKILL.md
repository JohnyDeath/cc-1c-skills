---
name: interface-edit
description: Настройка командного интерфейса подсистемы 1С — скрытие/показ команд, размещение в группах, порядок
argument-hint: <CIPath> <Operation> <Value>
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
---

# /interface-edit — редактирование CommandInterface.xml

Операции: hide, show, place, order, subsystem-order, group-order. Подробнее: `.claude/skills/interface-edit/reference.md`

```powershell
powershell.exe -NoProfile -File '.claude\skills\interface-edit\scripts\interface-edit.ps1' -CIPath '<path>' -Operation hide -Value '<cmd>'
```

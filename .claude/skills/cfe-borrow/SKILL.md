---
name: cfe-borrow
description: Заимствование объектов из конфигурации 1С в расширение (CFE) — справочники, документы, общие модули, перечисления
argument-hint: -ExtensionPath <path> -ConfigPath <path> -Object "Catalog.Контрагенты"
allowed-tools:
  - Bash
  - Read
  - Glob
---

Заимствует объекты из конфигурации в расширение. Создаёт XML-файлы с ObjectBelonging=Adopted.

```powershell
powershell.exe -NoProfile -File .claude\skills\cfe-borrow\scripts\cfe-borrow.ps1 -ExtensionPath src -ConfigPath C:\cfsrc\erp -Object "Catalog.Контрагенты"
```

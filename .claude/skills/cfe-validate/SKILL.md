---
name: cfe-validate
description: Валидация структурной корректности расширения конфигурации 1С (CFE) — корневая структура, свойства, состав, заимствованные объекты
argument-hint: <ExtensionPath> [-MaxErrors 30]
allowed-tools:
  - Bash
  - Read
  - Glob
---

Валидирует расширение конфигурации 1С: XML-структура, свойства, ChildObjects, заимствованные объекты.

```powershell
powershell.exe -NoProfile -File .claude\skills\cfe-validate\scripts\cfe-validate.ps1 -ExtensionPath src
```

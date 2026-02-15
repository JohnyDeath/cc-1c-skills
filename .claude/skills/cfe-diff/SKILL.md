---
name: cfe-diff
description: Анализ и сравнение расширения конфигурации 1С (CFE) — обзор изменений, проверка переноса
argument-hint: -ExtensionPath <path> -ConfigPath <path> [-Mode A|B]
allowed-tools:
  - Bash
  - Read
  - Glob
---

Анализирует расширение: Mode A — обзор изменений, Mode B — проверка переноса в конфигурацию.

```powershell
powershell.exe -NoProfile -File .claude\skills\cfe-diff\scripts\cfe-diff.ps1 -ExtensionPath src -ConfigPath C:\cfsrc\erp -Mode A
```

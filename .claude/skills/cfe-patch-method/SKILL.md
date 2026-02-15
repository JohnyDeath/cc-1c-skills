---
name: cfe-patch-method
description: Генерация перехватчика метода в расширении 1С (CFE) — &Перед, &После, &ИзменениеИКонтроль
argument-hint: -ExtensionPath <path> -ModulePath "Catalog.X.ObjectModule" -MethodName "ПриЗаписи" -InterceptorType Before
allowed-tools:
  - Bash
  - Read
  - Glob
---

Генерирует .bsl файл с декоратором перехвата для заимствованного объекта расширения.

```powershell
powershell.exe -NoProfile -File .claude\skills\cfe-patch-method\scripts\cfe-patch-method.ps1 -ExtensionPath src -ModulePath "Catalog.Контрагенты.ObjectModule" -MethodName "ПриЗаписи" -InterceptorType Before
```

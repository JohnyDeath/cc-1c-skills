# web-unpublish v1.0 — Remove 1C web publication
# Source: https://github.com/Nikolay-Shirokov/cc-1c-skills
<#
.SYNOPSIS
    Удаление публикации 1С из Apache

.DESCRIPTION
    Удаляет маркерный блок из httpd.conf и каталог публикации.
    Если Apache запущен — перезапускает для применения.

.PARAMETER AppName
    Имя публикации (обязательный)

.PARAMETER ApachePath
    Корень Apache (по умолчанию tools\apache24)

.EXAMPLE
    .\web-unpublish.ps1 -AppName "mydb"

.EXAMPLE
    .\web-unpublish.ps1 -AppName "bpdemo" -ApachePath "C:\tools\apache24"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$AppName,

    [Parameter(Mandatory=$false)]
    [string]$ApachePath
)

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- Resolve ApachePath ---
if (-not $ApachePath) {
    $projectRoot = (Get-Item $PSScriptRoot).Parent.Parent.Parent.Parent.FullName
    $ApachePath = Join-Path $projectRoot "tools\apache24"
}

# --- Remove marker block from httpd.conf ---
$confFile = Join-Path (Join-Path $ApachePath "conf") "httpd.conf"
if (-not (Test-Path $confFile)) {
    Write-Host "Error: httpd.conf не найден: $confFile" -ForegroundColor Red
    exit 1
}

$confContent = [System.IO.File]::ReadAllText($confFile)
$pubMarkerStart = "# --- 1C Publication: $AppName ---"
$pubMarkerEnd = "# --- End: $AppName ---"

if ($confContent -match [regex]::Escape($pubMarkerStart)) {
    $pattern = '\r?\n?' + [regex]::Escape($pubMarkerStart) + '[\s\S]*?' + [regex]::Escape($pubMarkerEnd) + '\r?\n?'
    $confContent = [regex]::Replace($confContent, $pattern, "`n")
    [System.IO.File]::WriteAllText($confFile, $confContent)
    Write-Host "httpd.conf: блок публикации '$AppName' удалён" -ForegroundColor Green
} else {
    Write-Host "Публикация '$AppName' не найдена в httpd.conf" -ForegroundColor Yellow
}

# --- Check if any publications remain; if not, remove global block ---
$remainingPubs = [regex]::Matches($confContent, '# --- 1C Publication: .+? ---')
if ($remainingPubs.Count -eq 0) {
    $globalMarkerStart = "# --- 1C: global ---"
    $globalMarkerEnd = "# --- End: global ---"
    if ($confContent -match [regex]::Escape($globalMarkerStart)) {
        $globalPattern = '\r?\n?' + [regex]::Escape($globalMarkerStart) + '[\s\S]*?' + [regex]::Escape($globalMarkerEnd) + '\r?\n?'
        $confContent = [regex]::Replace($confContent, $globalPattern, "`n")
        [System.IO.File]::WriteAllText($confFile, $confContent)
        Write-Host "httpd.conf: глобальный блок 1C удалён (нет публикаций)" -ForegroundColor Green
    }
}

# --- Remove publish directory ---
$publishDir = Join-Path (Join-Path $ApachePath "publish") $AppName
if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
    Write-Host "Каталог удалён: $publishDir" -ForegroundColor Green
} else {
    Write-Host "Каталог не найден: $publishDir" -ForegroundColor Yellow
}

# --- Restart Apache if running ---
$httpdProc = Get-Process httpd -ErrorAction SilentlyContinue
if ($httpdProc) {
    Write-Host "Перезапуск Apache..."
    $httpdExe = Join-Path (Join-Path $ApachePath "bin") "httpd.exe"
    $httpdProc | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    # Only restart if there are remaining publications
    if ($remainingPubs.Count -gt 0) {
        Start-Process -FilePath $httpdExe -WorkingDirectory $ApachePath -WindowStyle Hidden
        Start-Sleep -Seconds 2
        $check = Get-Process httpd -ErrorAction SilentlyContinue
        if ($check) {
            Write-Host "Apache перезапущен" -ForegroundColor Green
        } else {
            Write-Host "Error: Apache не удалось перезапустить" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Публикаций не осталось — Apache остановлен" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Публикация '$AppName' удалена" -ForegroundColor Green

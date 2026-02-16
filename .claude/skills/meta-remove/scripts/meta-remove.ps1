# meta-remove v1.0 — Remove metadata object from 1C configuration dump
# Source: https://github.com/Nikolay-Shirokov/cc-1c-skills
param(
	[Parameter(Mandatory)]
	[string]$ConfigDir,

	[Parameter(Mandatory)]
	[string]$Object,

	[switch]$DryRun,

	[switch]$KeepFiles
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- Type → plural directory mapping ---

$typePluralMap = @{
	"Catalog"                    = "Catalogs"
	"Document"                   = "Documents"
	"Enum"                       = "Enums"
	"Constant"                   = "Constants"
	"InformationRegister"        = "InformationRegisters"
	"AccumulationRegister"       = "AccumulationRegisters"
	"AccountingRegister"         = "AccountingRegisters"
	"CalculationRegister"        = "CalculationRegisters"
	"ChartOfAccounts"            = "ChartsOfAccounts"
	"ChartOfCharacteristicTypes" = "ChartsOfCharacteristicTypes"
	"ChartOfCalculationTypes"    = "ChartsOfCalculationTypes"
	"BusinessProcess"            = "BusinessProcesses"
	"Task"                       = "Tasks"
	"ExchangePlan"               = "ExchangePlans"
	"DocumentJournal"            = "DocumentJournals"
	"Report"                     = "Reports"
	"DataProcessor"              = "DataProcessors"
	"CommonModule"               = "CommonModules"
	"ScheduledJob"               = "ScheduledJobs"
	"EventSubscription"          = "EventSubscriptions"
	"HTTPService"                = "HTTPServices"
	"WebService"                 = "WebServices"
	"DefinedType"                = "DefinedTypes"
	"Role"                       = "Roles"
	"Subsystem"                  = "Subsystems"
	"CommonForm"                 = "CommonForms"
	"CommonTemplate"             = "CommonTemplates"
	"CommonPicture"              = "CommonPictures"
	"CommonAttribute"            = "CommonAttributes"
	"SessionParameter"           = "SessionParameters"
	"FunctionalOption"           = "FunctionalOptions"
	"FunctionalOptionsParameter" = "FunctionalOptionsParameters"
	"Sequence"                   = "Sequences"
	"FilterCriterion"            = "FilterCriteria"
	"SettingsStorage"            = "SettingsStorages"
	"XDTOPackage"                = "XDTOPackages"
	"WSReference"                = "WSReferences"
	"StyleItem"                  = "StyleItems"
	"Language"                   = "Languages"
}

# --- Resolve paths ---

if (-not [System.IO.Path]::IsPathRooted($ConfigDir)) {
	$ConfigDir = Join-Path (Get-Location).Path $ConfigDir
}

if (-not (Test-Path $ConfigDir -PathType Container)) {
	Write-Host "[ERROR] Config directory not found: $ConfigDir"
	exit 1
}

$configXml = Join-Path $ConfigDir "Configuration.xml"
if (-not (Test-Path $configXml)) {
	Write-Host "[ERROR] Configuration.xml not found in: $ConfigDir"
	exit 1
}

# --- Parse object spec ---

$parts = $Object -split "\.", 2
if ($parts.Count -ne 2 -or -not $parts[0] -or -not $parts[1]) {
	Write-Host "[ERROR] Invalid object format '$Object'. Expected: Type.Name (e.g. Catalog.Товары)"
	exit 1
}

$objType = $parts[0]
$objName = $parts[1]

if (-not $typePluralMap.ContainsKey($objType)) {
	Write-Host "[ERROR] Unknown type '$objType'. Supported: $($typePluralMap.Keys -join ', ')"
	exit 1
}

$typePlural = $typePluralMap[$objType]

Write-Host "=== meta-remove: $objType.$objName ==="
Write-Host ""

if ($DryRun) {
	Write-Host "[DRY-RUN] No changes will be made"
	Write-Host ""
}

$actions = 0
$errors = 0

# --- 1. Find object files ---

$typeDir = Join-Path $ConfigDir $typePlural
$objXml = Join-Path $typeDir "$objName.xml"
$objDir = Join-Path $typeDir $objName

$hasXml = Test-Path $objXml
$hasDir = Test-Path $objDir -PathType Container

if (-not $hasXml -and -not $hasDir) {
	Write-Host "[WARN]  Object files not found: $typePlural/$objName.xml"
	Write-Host "        Proceeding with deregistration only..."
} else {
	if ($hasXml) { Write-Host "[FOUND] $typePlural/$objName.xml" }
	if ($hasDir) {
		$fileCount = @(Get-ChildItem $objDir -Recurse -File).Count
		Write-Host "[FOUND] $typePlural/$objName/ ($fileCount files)"
	}
}

# --- 2. Remove from Configuration.xml ChildObjects ---

Write-Host ""
Write-Host "--- Configuration.xml ---"

$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.PreserveWhitespace = $true
$xmlDoc.Load($configXml)

$ns = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$ns.AddNamespace("md", "http://v8.1c.ru/8.3/MDClasses")
$ns.AddNamespace("v8", "http://v8.1c.ru/8.1/data/core")

$cfgNode = $xmlDoc.DocumentElement.SelectSingleNode("md:Configuration", $ns)
if (-not $cfgNode) {
	Write-Host "[ERROR] Configuration element not found in Configuration.xml"
	$errors++
} else {
	$childObjects = $cfgNode.SelectSingleNode("md:ChildObjects", $ns)
	if ($childObjects) {
		$found = $false
		foreach ($child in @($childObjects.ChildNodes)) {
			if ($child.NodeType -ne 'Element') { continue }
			if ($child.LocalName -eq $objType -and $child.InnerText.Trim() -eq $objName) {
				$found = $true
				if (-not $DryRun) {
					# Remove preceding whitespace if present
					$prev = $child.PreviousSibling
					if ($prev -and $prev.NodeType -eq 'Whitespace') {
						$childObjects.RemoveChild($prev) | Out-Null
					}
					$childObjects.RemoveChild($child) | Out-Null
				}
				Write-Host "[OK]    Removed <$objType>$objName</$objType> from ChildObjects"
				$actions++
				break
			}
		}
		if (-not $found) {
			Write-Host "[WARN]  <$objType>$objName</$objType> not found in ChildObjects"
		}
	}

	# Save Configuration.xml
	if ($actions -gt 0 -and -not $DryRun) {
		$enc = New-Object System.Text.UTF8Encoding $true
		$sw = New-Object System.IO.StreamWriter($configXml, $false, $enc)
		$xmlDoc.Save($sw)
		$sw.Close()
		Write-Host "[OK]    Configuration.xml saved"
	}
}

# --- 3. Remove from subsystem Content ---

Write-Host ""
Write-Host "--- Subsystems ---"

$subsystemsDir = Join-Path $ConfigDir "Subsystems"
$subsystemsFound = 0
$subsystemsCleaned = 0

function Remove-FromSubsystems {
	param([string]$dir)

	$xmlFiles = @(Get-ChildItem $dir -Filter "*.xml" -File -ErrorAction SilentlyContinue)
	foreach ($xmlFile in $xmlFiles) {
		$ssDoc = New-Object System.Xml.XmlDocument
		$ssDoc.PreserveWhitespace = $true
		try { $ssDoc.Load($xmlFile.FullName) } catch { continue }

		$ssNs = New-Object System.Xml.XmlNamespaceManager($ssDoc.NameTable)
		$ssNs.AddNamespace("md", "http://v8.1c.ru/8.3/MDClasses")
		$ssNs.AddNamespace("v8", "http://v8.1c.ru/8.1/data/core")

		$ssNode = $ssDoc.DocumentElement.SelectSingleNode("md:Subsystem", $ssNs)
		if (-not $ssNode) { continue }

		$propsNode = $ssNode.SelectSingleNode("md:Properties", $ssNs)
		if (-not $propsNode) { continue }

		$contentNode = $propsNode.SelectSingleNode("md:Content", $ssNs)
		if (-not $contentNode) { continue }

		$ssNameNode = $propsNode.SelectSingleNode("md:Name", $ssNs)
		$ssName = if ($ssNameNode) { $ssNameNode.InnerText } else { $xmlFile.BaseName }

		# Content items are <v8:Value>Type.Name</v8:Value>
		$targetRef = "$objType.$objName"
		$modified = $false

		foreach ($item in @($contentNode.ChildNodes)) {
			if ($item.NodeType -ne 'Element') { continue }
			$val = $item.InnerText.Trim()
			# Content format: "Subsystem.X" or "Catalog.X" etc.
			if ($val -eq $targetRef) {
				$script:subsystemsFound++
				if (-not $DryRun) {
					$prev = $item.PreviousSibling
					if ($prev -and $prev.NodeType -eq 'Whitespace') {
						$contentNode.RemoveChild($prev) | Out-Null
					}
					$contentNode.RemoveChild($item) | Out-Null
					$modified = $true
				}
				Write-Host "[OK]    Removed from subsystem '$ssName'"
				$script:subsystemsCleaned++
			}
		}

		if ($modified -and -not $DryRun) {
			$enc = New-Object System.Text.UTF8Encoding $true
			$sw = New-Object System.IO.StreamWriter($xmlFile.FullName, $false, $enc)
			$ssDoc.Save($sw)
			$sw.Close()
		}

		# Recurse into child subsystems
		$childDir = Join-Path $dir ($xmlFile.BaseName)
		$childSubsystems = Join-Path $childDir "Subsystems"
		if (Test-Path $childSubsystems -PathType Container) {
			Remove-FromSubsystems -dir $childSubsystems
		}
	}
}

if (Test-Path $subsystemsDir -PathType Container) {
	Remove-FromSubsystems -dir $subsystemsDir
	if ($subsystemsCleaned -eq 0) {
		Write-Host "[OK]    Not referenced in any subsystem"
	}
} else {
	Write-Host "[OK]    No Subsystems directory"
}

# --- 4. Delete object files ---

Write-Host ""
Write-Host "--- Files ---"

if (-not $KeepFiles) {
	if ($hasDir -and -not $DryRun) {
		Remove-Item $objDir -Recurse -Force
		Write-Host "[OK]    Deleted directory: $typePlural/$objName/"
		$actions++
	} elseif ($hasDir) {
		Write-Host "[DRY]   Would delete directory: $typePlural/$objName/"
		$actions++
	}

	if ($hasXml -and -not $DryRun) {
		Remove-Item $objXml -Force
		Write-Host "[OK]    Deleted file: $typePlural/$objName.xml"
		$actions++
	} elseif ($hasXml) {
		Write-Host "[DRY]   Would delete file: $typePlural/$objName.xml"
		$actions++
	}

	if (-not $hasXml -and -not $hasDir) {
		Write-Host "[OK]    No files to delete"
	}
} else {
	Write-Host "[SKIP]  File deletion skipped (-KeepFiles)"
}

# --- Summary ---

Write-Host ""
$totalActions = $actions + $subsystemsCleaned
if ($DryRun) {
	Write-Host "=== Dry run complete: $totalActions actions would be performed ==="
} else {
	Write-Host "=== Done: $totalActions actions performed ($subsystemsCleaned subsystem references removed) ==="
}

if ($errors -gt 0) {
	exit 1
}
exit 0

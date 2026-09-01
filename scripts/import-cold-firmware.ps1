param(
  [Parameter(Mandatory = $true)]
  [string]$Source,

  [string]$Target = "firmware/sts-cold/sts-cold.ino"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
  throw "Firmware source not found."
}

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$targetPath = [IO.Path]::GetFullPath((Join-Path (Get-Location) $Target))
$targetDirectory = Split-Path -Parent $targetPath

New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
$content = [IO.File]::ReadAllText($sourcePath)

function Replace-ExactlyOne {
  param(
    [string]$Pattern,
    [string]$Replacement,
    [string]$Label
  )

  $matches = [regex]::Matches($script:content, $Pattern)
  if ($matches.Count -ne 1) {
    throw "Expected one $Label declaration, found $($matches.Count)."
  }

  $script:content = [regex]::Replace($script:content, $Pattern, $Replacement)
}

Replace-ExactlyOne '(?m)^#define DEVICE_ID\s+"[^"]*"\s*$' @'
#define STS_ENVIRONMENT_STAGING 1
#define STS_ENVIRONMENT STS_ENVIRONMENT_STAGING
#include "sts_secrets.h"

#define DEVICE_ID STS_DEVICE_ID
'@ 'device id'
Replace-ExactlyOne '(?m)^#define FIRMWARE_VERSION\s+"[^"]*"\s*$' '#define FIRMWARE_VERSION "STS_COLD_FW_2.9.0-STAGING"' 'firmware version'
Replace-ExactlyOne '(?m)^const char\* OTA_PASSWORD\s*=\s*"[^"]*";\s*$' 'const char* OTA_PASSWORD = STS_OTA_PASSWORD;' 'OTA password'
Replace-ExactlyOne '(?m)^const char\* WIFI_AP_PASSWORD\s*=\s*"[^"]*";\s*$' 'const char* WIFI_AP_PASSWORD = STS_WIFI_AP_PASSWORD;' 'Wi-Fi setup password'
Replace-ExactlyOne '(?m)^const char\* backendBaseUrl\s*=\s*"[^"]*";\s*$' 'const char* backendBaseUrl = STS_BACKEND_BASE_URL;' 'backend URL'
Replace-ExactlyOne '(?m)^const char\* dashboardUrl\s*=\s*"[^"]*";\s*$' 'const char* dashboardUrl = STS_DASHBOARD_URL;' 'dashboard URL'
Replace-ExactlyOne '(?m)^const char\* dashboardQrText\s*=\s*"[^"]*";\s*$' 'const char* dashboardQrText = STS_DASHBOARD_QR_TEXT;' 'dashboard QR text'
Replace-ExactlyOne '(?m)^const char\* temperatureUrl\s*=\s*"[^"]*";\s*$' 'const char* temperatureUrl = STS_BACKEND_BASE_URL "/api/temperature";' 'temperature URL'
Replace-ExactlyOne '(?m)^const char\* heartbeatUrl\s*=\s*"[^"]*";\s*$' 'const char* heartbeatUrl = STS_BACKEND_BASE_URL "/api/device/heartbeat";' 'heartbeat URL'
Replace-ExactlyOne '(?m)^const char\* DEVICE_API_TOKEN\s*=\s*"[^"]*";\s*$' 'const char* DEVICE_API_TOKEN = STS_DEVICE_API_TOKEN;' 'device API token'

$sensitiveLiteralPattern = '(?im)^\s*(const char\*\s+)?(OTA_PASSWORD|WIFI_AP_PASSWORD|DEVICE_API_TOKEN)\s*=\s*"[^"\r\n]+"'
if ([regex]::IsMatch($content, $sensitiveLiteralPattern)) {
  throw "Sanitization failed: a sensitive literal remains."
}

[IO.File]::WriteAllText($targetPath, $content, [Text.UTF8Encoding]::new($false))
Write-Output "Sanitized firmware created at $Target"

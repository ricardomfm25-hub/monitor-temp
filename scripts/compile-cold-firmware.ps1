param(
  [Parameter(Mandatory = $true)]
  [string]$ArduinoCli,

  [string]$Sketch = "firmware/sts-cold",
  [string]$OutputDirectory = "firmware/sts-cold/build"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ArduinoCli -PathType Leaf)) {
  throw "Arduino CLI executable not found."
}
if (-not (Test-Path -LiteralPath "$Sketch/sts_secrets.h" -PathType Leaf)) {
  throw "Create $Sketch/sts_secrets.h from sts_secrets.example.h before compiling."
}

& $ArduinoCli compile `
  --fqbn esp32:esp32:esp32 `
  --board-options PartitionScheme=huge_app `
  --warnings all `
  --output-dir $OutputDirectory `
  $Sketch

if ($LASTEXITCODE -ne 0) {
  throw "Firmware compilation failed."
}

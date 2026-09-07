param([string]$Repo = "$env:USERPROFILE\Downloads\XotiicDuck-Music-Portable")
$ErrorActionPreference = "Stop"
Write-Host "XotiicDuck Music Update 22 - protected installer"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js 22.12 or newer first." }
$installer = Join-Path $PSScriptRoot "installer.cjs"
if (-not (Test-Path -LiteralPath $installer)) { throw "Extract the whole ZIP first, then run this script from the extracted folder." }
& node $installer $Repo
if ($LASTEXITCODE -ne 0) { throw "Update 22 stopped. Read the error above before retrying." }

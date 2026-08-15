[CmdletBinding()]
param(
  [string]$ManifestUrl = "https://x-s-m-x.github.io/Xotiic-Songs/manifest.webmanifest",
  [switch]$InitializeOnly,
  [switch]$SkipPwaValidation
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$bubblewrapPackage = "@bubblewrap/cli@1.22.7"
$scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$generatedFolder = Join-Path $scriptFolder "generated"
$outputFolder = Join-Path $scriptFolder "output"
$manifestFile = Join-Path $generatedFolder "twa-manifest.json"
$privateKeySuggestion = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "XotiicDuck-Private-Keys\xotiicduck-release.keystore"

function Invoke-Bubblewrap {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  & npx.cmd --yes $bubblewrapPackage @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Bubblewrap stopped with exit code $LASTEXITCODE. Read the error above before retrying."
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install the current Node.js LTS release, reopen PowerShell, then run this script again."
}
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
  throw "npx is missing. Reinstall the current Node.js LTS release, reopen PowerShell, then run this script again."
}

Write-Host "XotiicDuck Music Android builder" -ForegroundColor Green
Write-Host "Web manifest: $ManifestUrl"
Write-Host "Generated project: $generatedFolder"

if (-not (Test-Path -LiteralPath $manifestFile)) {
  New-Item -ItemType Directory -Path $generatedFolder -Force | Out-Null
  New-Item -ItemType Directory -Path (Split-Path -Parent $privateKeySuggestion) -Force | Out-Null
  Write-Host ""
  Write-Host "ONE-TIME INITIALIZATION" -ForegroundColor Yellow
  Write-Host "Use these values when Bubblewrap asks:"
  Write-Host "  Application ID: music.xotiicduck.player"
  Write-Host "  App name: XotiicDuck Music"
  Write-Host "  Launcher name: XotiicDuck"
  Write-Host "  Start URL: /Xotiic-Songs/"
  Write-Host "  Version name: 1.0.0"
  Write-Host "  Version code: 1"
  Write-Host "  Signing key path: $privateKeySuggestion" -ForegroundColor Cyan
  Write-Host "Use new strong passwords and store them in your password manager. Do not paste them into chat or commit them to GitHub." -ForegroundColor Yellow
  Write-Host ""
  Invoke-Bubblewrap @("init", "--manifest=$ManifestUrl", "--directory=$generatedFolder")
}

if (-not (Test-Path -LiteralPath $manifestFile)) {
  throw "Bubblewrap did not create $manifestFile. Initialization is incomplete."
}

$twaManifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($twaManifest.packageId -ne "music.xotiicduck.player") {
  throw "The generated package ID is '$($twaManifest.packageId)'. It must be music.xotiicduck.player before the first public APK is released."
}
if ($twaManifest.startUrl -ne "/Xotiic-Songs/") {
  throw "The generated start URL is '$($twaManifest.startUrl)'. It must be /Xotiic-Songs/."
}

if ($InitializeOnly) {
  Write-Host "Initialization is complete. Run this script again without -InitializeOnly when you are ready to build." -ForegroundColor Green
  exit 0
}

Push-Location $generatedFolder
try {
  Invoke-Bubblewrap @("doctor")
  if (-not $SkipPwaValidation) {
    Invoke-Bubblewrap @("validate", "--url=https://x-s-m-x.github.io/Xotiic-Songs/")
  }
  if ($SkipPwaValidation) {
    Invoke-Bubblewrap @("build", "--skipPwaValidation")
  } else {
    Invoke-Bubblewrap @("build")
  }
} finally {
  Pop-Location
}

$signedApk = Join-Path $generatedFolder "app-release-signed.apk"
$signedBundle = Join-Path $generatedFolder "app-release-bundle.aab"
if (-not (Test-Path -LiteralPath $signedApk)) {
  throw "The signed APK was not created. Review the Bubblewrap build output above."
}

New-Item -ItemType Directory -Path $outputFolder -Force | Out-Null
$versionProperty = $twaManifest.PSObject.Properties["appVersion"]
$versionName = if ($versionProperty -and $versionProperty.Value) { [string]$versionProperty.Value } else { "1.0.0" }
$safeVersion = $versionName -replace '[^0-9A-Za-z._-]', '-'
$finalApk = Join-Path $outputFolder "XotiicDuck-Music-$safeVersion-signed.apk"
Copy-Item -LiteralPath $signedApk -Destination $finalApk -Force
if (Test-Path -LiteralPath $signedBundle) {
  Copy-Item -LiteralPath $signedBundle -Destination (Join-Path $outputFolder "XotiicDuck-Music-$safeVersion.aab") -Force
}

& (Join-Path $scriptFolder "VERIFY-APK.ps1") -ApkPath $finalApk
Write-Host ""
Write-Host "SIGNED APK READY" -ForegroundColor Green
Write-Host $finalApk
Write-Host "Keep the generated signing key and both passwords backed up. Every future APK update must use that same signing key." -ForegroundColor Yellow

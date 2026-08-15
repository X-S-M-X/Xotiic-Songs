[CmdletBinding()]
param(
  [string]$Repository = "X-S-M-X/Xotiic-Songs",
  [string]$Tag = "android-v1",
  [string]$Title = "XotiicDuck Music Android v1",
  [string]$ExpectedSha256 = "513cb8895ad6b8c94db08227d95b3e2a5bb0f41ecc62716527c83a89402bb32f"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputFolder = Join-Path $scriptFolder "output"
$verifier = Join-Path $scriptFolder "VERIFY-APK.ps1"
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

$sourceApk = Get-ChildItem -LiteralPath $outputFolder -Filter "*-signed.apk" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if (-not $sourceApk) {
  throw "No signed APK was found in $outputFolder. Run BUILD-ANDROID.ps1 first."
}

& $verifier -ApkPath $sourceApk.FullName

$hash = (Get-FileHash -LiteralPath $sourceApk.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $ExpectedSha256.ToLowerInvariant()) {
  throw "The APK hash is $hash, but the website currently advertises $ExpectedSha256. Do not publish until both match."
}

$stableApk = Join-Path $outputFolder "XotiicDuck-Music-Android.apk"
$checksumFile = Join-Path $outputFolder "APK-SHA256.txt"
Copy-Item -LiteralPath $sourceApk.FullName -Destination $stableApk -Force
[System.IO.File]::WriteAllText(
  $checksumFile,
  "$hash  XotiicDuck-Music-Android.apk" + [Environment]::NewLine,
  $utf8WithoutBom
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is not installed. Install it with: winget install --id GitHub.cli"
}

& gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not signed in. Run: gh auth login --web"
}

& gh repo view $Repository --json nameWithOwner | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI cannot access $Repository with the signed-in account."
}

& gh release view $Tag --repo $Repository *> $null
if ($LASTEXITCODE -eq 0) {
  throw "Release $Tag already exists. This script will not overwrite a published release."
}

$notes = @"
Official signed Android APK for XotiicDuck Music.

Package: music.xotiicduck.player
SHA-256: $hash

Keep Google Play Protect enabled. Download this APK only from the official XotiicDuck Music website or this GitHub release.
"@

& gh release create $Tag $stableApk $checksumFile --repo $Repository --title $Title --notes $notes
if ($LASTEXITCODE -ne 0) {
  throw "GitHub did not create the Android release. Read the error above before retrying."
}

$releaseUrl = & gh release view $Tag --repo $Repository --json url --jq ".url"
Write-Host ""
Write-Host "ANDROID RELEASE PUBLISHED" -ForegroundColor Green
Write-Host $releaseUrl
Write-Host "Direct APK: https://github.com/$Repository/releases/latest/download/XotiicDuck-Music-Android.apk"
Write-Host "SHA-256: $hash"

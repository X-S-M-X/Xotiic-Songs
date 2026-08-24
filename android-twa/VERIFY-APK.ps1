[CmdletBinding()]
param(
  [string]$ApkPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputFolder = Join-Path $scriptFolder "output"

if ([string]::IsNullOrWhiteSpace($ApkPath)) {
  $latest = Get-ChildItem -LiteralPath $outputFolder -Filter "*.apk" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $latest) { throw "No APK was found in $outputFolder." }
  $ApkPath = $latest.FullName
}

$resolvedApk = (Resolve-Path -LiteralPath $ApkPath).Path
$hash = Get-FileHash -LiteralPath $resolvedApk -Algorithm SHA256
$checksumFile = Join-Path (Split-Path -Parent $resolvedApk) "APK-SHA256.txt"
"$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($resolvedApk))" | Set-Content -LiteralPath $checksumFile -Encoding utf8

$sdkCandidates = @()
$bubblewrapConfig = Join-Path $env:USERPROFILE ".bubblewrap\config.json"
if (Test-Path -LiteralPath $bubblewrapConfig) {
  try {
    $config = Get-Content -LiteralPath $bubblewrapConfig -Raw | ConvertFrom-Json
    if ($config.androidSdkPath) { $sdkCandidates += [string]$config.androidSdkPath }
  } catch {
    Write-Warning "Bubblewrap's Android SDK configuration could not be read."
  }
}
$sdkCandidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
$apksigner = $null
foreach ($sdk in ($sdkCandidates | Select-Object -Unique)) {
  if (-not (Test-Path -LiteralPath $sdk)) { continue }
  $apksigner = Get-ChildItem -LiteralPath (Join-Path $sdk "build-tools") -Filter "apksigner.bat" -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($apksigner) { break }
}

Write-Host "APK SHA-256: $($hash.Hash.ToLowerInvariant())" -ForegroundColor Green
Write-Host "Checksum file: $checksumFile"
if ($apksigner) {
  $signatureOutput = & $apksigner.FullName verify --verbose --print-certs $resolvedApk 2>&1
  $signatureExitCode = $LASTEXITCODE
  $signatureOutput | ForEach-Object { Write-Host $_ }
  if ($signatureExitCode -ne 0) { throw "Android signature verification failed." }

  $digestLine = $signatureOutput | Where-Object { [string]$_ -match 'certificate SHA-256 digest:\s*([0-9a-fA-F:]+)' } | Select-Object -First 1
  if ($digestLine -and ([string]$digestLine -match 'certificate SHA-256 digest:\s*([0-9a-fA-F:]+)')) {
    $digest = ($Matches[1] -replace '[^0-9a-fA-F]', '').ToUpperInvariant()
    if ($digest.Length -eq 64) {
      $fingerprint = ((0..31 | ForEach-Object { $digest.Substring($_ * 2, 2) }) -join ":")
      $assetLinkEntry = [ordered]@{
        relation = @("delegate_permission/common.handle_all_urls")
        target = [ordered]@{
          namespace = "android_app"
          package_name = "music.xotiicduck.player"
          sha256_cert_fingerprints = @($fingerprint)
        }
      }
      $assetLinks = "[" + [Environment]::NewLine + ($assetLinkEntry | ConvertTo-Json -Depth 6) + [Environment]::NewLine + "]"
      $assetLinksFile = Join-Path (Split-Path -Parent $resolvedApk) "assetlinks.json"
      $assetLinks | Set-Content -LiteralPath $assetLinksFile -Encoding utf8
      Write-Host "Digital Asset Links file: $assetLinksFile" -ForegroundColor Green
      Write-Host "Signing certificate: $fingerprint"
    }
  }
} else {
  Write-Warning "apksigner was not found. The checksum was created, but Android signature details were not independently printed. Run Bubblewrap doctor and retry this script."
}

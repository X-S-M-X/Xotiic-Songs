[CmdletBinding()]
param(
  [string]$ApkPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputFolder = Join-Path $scriptFolder "output"
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

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
$checksumContent = "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($resolvedApk))" + [Environment]::NewLine
[System.IO.File]::WriteAllText($checksumFile, $checksumContent, $utf8WithoutBom)

$sdkCandidates = @()
$bubblewrapJdkPath = $null
$bubblewrapConfig = Join-Path $env:USERPROFILE ".bubblewrap\config.json"
if (Test-Path -LiteralPath $bubblewrapConfig) {
  try {
    $config = Get-Content -LiteralPath $bubblewrapConfig -Raw | ConvertFrom-Json
    if ($config.androidSdkPath) { $sdkCandidates += [string]$config.androidSdkPath }
    if ($config.jdkPath) { $bubblewrapJdkPath = [string]$config.jdkPath }
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
  $originalJavaHome = $env:JAVA_HOME
  $originalPath = $env:Path
  try {
    if ($bubblewrapJdkPath -and (Test-Path -LiteralPath (Join-Path $bubblewrapJdkPath "bin\java.exe"))) {
      $env:JAVA_HOME = $bubblewrapJdkPath
      $env:Path = (Join-Path $bubblewrapJdkPath "bin") + ";" + $originalPath
    }
    $signatureOutput = & $apksigner.FullName verify --verbose --print-certs $resolvedApk 2>&1
    $signatureExitCode = $LASTEXITCODE
  } finally {
    $env:JAVA_HOME = $originalJavaHome
    $env:Path = $originalPath
  }

  $signatureLines = @($signatureOutput | ForEach-Object { [string]$_ })
  $signatureLog = Join-Path (Split-Path -Parent $resolvedApk) "APK-SIGNATURE-VERIFY.txt"
  [System.IO.File]::WriteAllText($signatureLog, (($signatureLines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8WithoutBom)
  $metadataWarnings = @($signatureLines | Where-Object { $_ -match '^WARNING: META-INF/' })
  $signatureLines |
    Where-Object { $_ -notmatch '^WARNING: META-INF/' } |
    ForEach-Object { Write-Host $_ }
  if ($metadataWarnings.Count -gt 0) {
    Write-Host "$($metadataWarnings.Count) informational legacy v1 META-INF warnings were saved in the full verification report." -ForegroundColor DarkGray
  }
  if ($signatureExitCode -ne 0) { throw "Android signature verification failed." }
  if (-not ($signatureLines | Where-Object { $_ -match 'Verified using v2 scheme .*:\s*true' })) {
    throw "The APK did not pass Android v2 signature verification. Do not distribute it."
  }
  Write-Host "Android signature verification passed." -ForegroundColor Green
  Write-Host "Signature report: $signatureLog"

  $digestLine = $signatureLines | Where-Object { [string]$_ -match 'certificate SHA-256 digest:\s*([0-9a-fA-F:]+)' } | Select-Object -First 1
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
      [System.IO.File]::WriteAllText($assetLinksFile, ($assetLinks + [Environment]::NewLine), $utf8WithoutBom)
      Write-Host "Digital Asset Links file: $assetLinksFile" -ForegroundColor Green
      Write-Host "Signing certificate: $fingerprint"
    }
  }
} else {
  Write-Warning "apksigner was not found. The checksum was created, but Android signature details were not independently printed. Run Bubblewrap doctor and retry this script."
}

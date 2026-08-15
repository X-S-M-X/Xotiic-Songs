$ErrorActionPreference = "Stop"
$manifestUrl = "https://x-s-m-x.github.io/Xotiic-Songs/manifest.webmanifest"
$projectFolder = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command bubblewrap -ErrorAction SilentlyContinue)) {
  throw "Bubblewrap is not installed. Run: npm install -g @bubblewrap/cli"
}

Set-Location $projectFolder
bubblewrap doctor
bubblewrap init --manifest=$manifestUrl

Write-Host "Android project generated. Review its package ID, start URL, icons, and private signing-key location before running bubblewrap build."

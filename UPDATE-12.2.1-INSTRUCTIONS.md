# Update 12.2.1: installed-player cleanup

This small website update removes redundant Web App and Android APK installation choices while XotiicDuck Music is already running inside the installed PWA or signed Android APK. Supported Android Chrome visits can also detect the already installed related APK.

The update does not replace `catalog.js`, `music/`, `covers/`, the encrypted admin vault, the Android signing key, or `android-twa/output/`.

## Apply from PowerShell

The update package contains a `payload` folder. Use the exact paths below after extracting the ZIP into Downloads:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-12.2.1-Installed-Player"

Set-Location $repo
git status --short
git pull --rebase origin main

$payload = Get-ChildItem -LiteralPath $update -Directory -Recurse |
  Where-Object {
    $_.Name -eq "payload" -and
    (Test-Path -LiteralPath (Join-Path $_.FullName "UPDATE-12.2.1-INSTRUCTIONS.md"))
  } |
  Select-Object -First 1

if (-not $payload) {
  throw "The verified Update 12.2.1 payload folder was not found."
}

Get-ChildItem -LiteralPath $payload.FullName -Force |
  Copy-Item -Destination $repo -Recurse -Force

npm test
git diff --check
git status --short
```

The tests must identify package version `12.2.1` and pass before committing.

## Commit and publish

```powershell
$files = @(
  "index.html",
  "app.js",
  "styles.css",
  "sw.js",
  "manifest.webmanifest",
  "package.json",
  "tests\static.test.cjs",
  "README-FIRST.md",
  "DEPLOY.md",
  "UPDATE-12.2.1-INSTRUCTIONS.md"
)

git add -- $files
git --no-pager diff --cached --stat
git commit -m "Hide install choices inside installed apps"
git push origin main
```

Wait for GitHub Pages, then accept the in-player update prompt. Test the ordinary website, installed web app, and Android APK separately.

No APK rebuild, new signature, or replacement GitHub Release is required.

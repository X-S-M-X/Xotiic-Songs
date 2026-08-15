# Update 12.2: official Android download

This update adds a signed Android APK download centre without replacing `catalog.js`, `music/`, `covers/`, the encrypted admin vault, the private signing key, or the ignored Android `generated/` and `output/` folders.

## 1. Protect the current repository state

Open PowerShell in VS Code and run:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-12.2-Android-Download"

Set-Location $repo
git status --short
```

The Android build session may have left `android-twa/BUILD-ANDROID.ps1` modified. If that is the only line shown, preserve it before pulling:

```powershell
git add android-twa/BUILD-ANDROID.ps1
git commit -m "Preserve Android validation fix"
```

If any other files are shown, review them before continuing. Do not discard uncommitted songs, catalog edits, covers, or admin changes.

## 2. Pull and copy the update

```powershell
Set-Location $repo
git pull --rebase origin main

Get-ChildItem -LiteralPath "$update\payload" -Force |
  Copy-Item -Destination $repo -Recurse -Force
```

The payload contains only application code, Android helper scripts, documentation, and tests. It does not contain `catalog.js`, `music/`, or `covers/`.

## 3. Validate and publish the website update

```powershell
Set-Location $repo
npm test
git diff --check
git status --short

git add -- index.html app.js styles.css layout.css sw.js package.json `
  README-FIRST.md DEPLOY.md UPDATE-12.2-INSTRUCTIONS.md tests/static.test.cjs `
  android-twa/BUILD-ANDROID.ps1 android-twa/VERIFY-APK.ps1 `
  android-twa/PUBLISH-ANDROID-RELEASE.ps1 android-twa/README.md

git commit -m "Add official Android APK download"
git push origin main
```

Wait for GitHub Pages to deploy, then refresh the player and accept **Player update ready**. The Home page should show **Android APK** separately from **Install web app**.

## 4. Publish the verified APK as a GitHub Release

GitHub CLI uses a browser login. Do not paste GitHub tokens or signing passwords into scripts.

```powershell
gh --version
```

If that command is not found:

```powershell
winget install --id GitHub.cli
```

Close and reopen the VS Code terminal after installation, then run:

```powershell
gh auth login --web

$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
Set-Location "$repo\android-twa"
Set-ExecutionPolicy -Scope Process Bypass
.\PUBLISH-ANDROID-RELEASE.ps1
```

The script accepts only the currently advertised SHA-256:

```text
513cb8895ad6b8c94db08227d95b3e2a5bb0f41ecc62716527c83a89402bb32f
```

It uploads these stable public assets:

```text
XotiicDuck-Music-Android.apk
APK-SHA256.txt
```

Never upload `xotiicduck-release.keystore`, a password, `generated/`, or the Android App Bundle as a website download.

## 5. Connect the APK to the website origin

The generated public association file must eventually open at:

```text
https://x-s-m-x.github.io/.well-known/assetlinks.json
```

This requires the separate free user-site repository `x-s-m-x.github.io`. The existing `Xotiic-Songs` project repository can serve `/Xotiic-Songs/`, but it cannot place a file at the account domain root. Follow `android-twa/README.md` to publish the generated `android-twa/output/assetlinks.json` there before judging whether the APK correctly hides browser controls.

## 6. Test from Android

1. Open the live player in Chrome on the phone.
2. Choose **Android APK** and read the release information.
3. Download the APK and keep Google Play Protect enabled.
4. Allow installation only for the browser or Files app used for this download.
5. Install and open XotiicDuck Music.
6. Test streaming, lock-screen controls, background playback, seeking, rotation, and one saved offline song.
7. Disable that app's **Install unknown apps** permission afterward.

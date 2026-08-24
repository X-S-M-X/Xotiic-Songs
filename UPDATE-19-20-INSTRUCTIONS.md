# XotiicDuck Music Updates 19 and 20

This cumulative code-only package contains Updates 13 through 20. It excludes `catalog.js`, `music/`, and `covers/`, so owner-uploaded releases remain untouched.

## Update 19: Optional Online Platform

- Local-only mode remains the safe default
- Replaceable HTTPS platform adapter is integrated but inactive
- Accounts, global charts, and release alerts are all off
- No automatic backend request
- No Cloudflare, Supabase, or sign-in requirement
- Settings clearly shows which optional services are disabled

Read `OPTIONAL-ONLINE-SETUP.md` before ever configuring a backend.

## Update 20: Android and Connected Devices

- Connected Devices panel in expanded Now Playing
- Browser Remote Playback picker where supported
- Safari AirPlay picker fallback where supported
- Console and TV browser link handoff
- Media Session and lock-screen support status
- Responsive phone, tablet, and desktop device panel
- Trusted Web Activity preparation folder for a later Android wrapper
- Digital Asset Links template kept outside the live site
- Signing keys and release APK/AAB files blocked by `.gitignore`

Remote Playback is not supported equally by every browser. Console background playback during games is controlled by the console platform and cannot be guaranteed by a static website. Bluetooth remains controlled by device settings and the player requests no Bluetooth permission.

The Android folder is preparation only. There is no signed APK until you create and privately protect a real signing key, then publish its real certificate fingerprint at the host root.

## Protected Windows update

Extract this ZIP to:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-20`

Run in the VS Code PowerShell terminal:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-20"

Test-Path "$repo\.git"
Test-Path "$update\index.html"

Set-Location $repo
git remote set-url origin https://github.com/X-S-M-X/Xotiic-Songs.git
git status --short
```

Both tests must return `True`. Save any listed work first:

```powershell
git add -A
git commit -m "Save current songs and catalog before Update 20"
git push origin main
```

Apply and publish:

```powershell
Set-Location $repo
git pull --rebase origin main

Get-ChildItem -LiteralPath $update -Force |
  Where-Object { $_.Name -notin @(".git", "catalog.js", "music", "covers") } |
  Copy-Item -Destination $repo -Recurse -Force

Set-Location $repo
npm test
git status --short
git add -A
git commit -m "Ship XotiicDuck Music Updates 19 and 20"
git push origin main
```

After deployment, accept the player update prompt. Open a song, expand Now Playing, choose Devices, and test the picker on each browser you use.

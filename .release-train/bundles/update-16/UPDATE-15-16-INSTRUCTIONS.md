# XotiicDuck Music Updates 15 and 16

This is a code-only update package for the existing XotiicDuck Music repository. It does not contain `catalog.js`, `music/`, or `covers/`, so your uploaded songs, cover art, lyrics, and catalog remain in the established repository folder.

## Update 15: Creator Studio 2.0

- Batch MP3 intake with drag and drop
- Common ID3 title, artist, album, genre, track number, and embedded-cover reading
- Album and collection metadata wizard
- Multiple local metadata workspaces without storing MP3s, covers, passwords, or tokens
- Live release preflight checks
- Upcoming release calendar using the current device timezone
- Installed-console share target and file handling where the browser supports those PWA features

## Update 16: Offline and Android 2.0

- Save complete albums and playlists offline
- Persistent queue with pause, resume, retry, and clear-finished controls
- Abort-safe downloads that keep the previous saved copy until a replacement succeeds
- Data Saver confirmation and optional Wi-Fi-only queueing when the browser reports a connection type
- Public and admin manifest shortcuts
- Android sharing into the installed artist console on supported browsers

Browser support for share targets, file handlers, and connection-type reporting varies. Every feature has a normal Browse or Gallery fallback.

## Protected Windows update

Extract this ZIP to:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-16`

Run in the VS Code PowerShell terminal:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-16"

Test-Path "$repo\.git"
Test-Path "$update\index.html"

Set-Location $repo
git remote set-url origin https://github.com/X-S-M-X/Xotiic-Songs.git
git status --short
```

Both tests must return `True`. If Git lists current changes, save them before copying the update:

```powershell
git add -A
git commit -m "Save current songs and catalog before Update 16"
git push origin main
```

Then apply and publish the code-only update:

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
git commit -m "Ship XotiicDuck Music Updates 15 and 16"
git push origin main
```

After GitHub Pages deploys, accept the in-app update prompt. Open the artist console once while online so the new service worker and Android sharing registration can finish.

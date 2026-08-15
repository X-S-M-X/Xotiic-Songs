# Update 12 installation

Update 12 adds the Anime Pulse and Classic appearances, a full device-alignment layer, mobile mini-player swiping, compact Library tabs, clearer offline controls, and the redesigned Xotiic Upload console.

The update package deliberately does not contain `catalog.js`, `music/`, or `covers/`. Your live releases stay in the existing repository folder.

## 1. Extract the update

In Downloads, extract the ZIP so this file exists:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-12\index.html`

Keep using the existing Git repository here:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable`

## 2. Protect current uploads

Open PowerShell in VS Code and run:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-12"

Test-Path "$repo\.git"
Test-Path "$update\index.html"

Set-Location $repo
git status --short
```

Both `Test-Path` results must be `True`.

If `git status --short` prints modified or new files, save those current changes before pulling:

```powershell
git add -A
git commit -m "Save current songs before Update 12"
git push origin main
```

If Git says there is nothing to commit, continue normally.

## 3. Pull and copy Update 12

```powershell
Set-Location $repo
git pull --rebase origin main

Get-ChildItem -LiteralPath $update -Force |
  Where-Object { $_.Name -notin @(".git", "catalog.js", "music", "covers", "analytics.js", "analytics-worker", "GLOBAL-CHART-SETUP.md") } |
  Copy-Item -Destination $repo -Recurse -Force
```

That exclusion list protects the repository history, live catalog, MP3s, covers, and paused global-chart work.

## 4. Test and publish

```powershell
Set-Location $repo
git status --short
npm test
git add -A
git commit -m "Launch Update 12 anime redesign"
git push origin main
```

The test command should report every test as passing. The LF-to-CRLF messages on Windows are warnings, not failures.

## 5. Refresh installed copies

Wait for GitHub Pages to finish deploying. Open the public player and the artist console while online, then accept **Player update ready** or **Console update ready** when shown. If an installed copy still shows the old layout, close it completely, reopen it online, and refresh the page once.

In the player, open **Settings** to switch between Anime Pulse and Classic, choose an accent, or reduce motion. On phones and tablets, swipe the bottom mini-player left for the next song or right for the previous song. The Library now uses separate Playlists, Liked, and Offline tabs.

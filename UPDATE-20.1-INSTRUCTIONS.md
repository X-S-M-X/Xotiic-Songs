# XotiicDuck Music Update 20.1

Update 20.1 rebuilds Devices, Queue, and Settings for phones, tablets, installed apps, and desktop browsers.

## Included

- New multi-screen Devices icon
- Honest device-picker states based on actual browser support
- Working native Share action where supported
- Working Copy player link fallback
- Compact device help for TVs, consoles, Bluetooth, and other phones
- Theme-aware Queue with compact mobile controls
- Theme-aware Settings with collapsible diagnostics
- Six anime colour presets: Pulse, Sakura, Aqua, Ember, Royal, and Void
- A custom anime option with separate primary and secondary colour pickers
- Matching palette support in the private Artist Console
- Classic black and green remains the default appearance
- Player and Artist Console cache refreshes

The package does not contain `catalog.js`, `music/`, or `covers/`. Your uploaded songs and cover images are not replaced.

## Recommended one-command update

Extract the ZIP so this exact file exists:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-20.1-Devices-Queue-Settings\APPLY-UPDATE-20-1.ps1`

Open the existing repository in VS Code, open a PowerShell terminal, and run:

```powershell
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-20.1-Devices-Queue-Settings"

Set-ExecutionPolicy -Scope Process Bypass
& "$update\APPLY-UPDATE-20-1.ps1"
```

The script checks the repository, pulls `origin/main`, copies only the update payload, runs all tests, commits the listed code files, and pushes the update.

## If the script reports uncommitted work

Protect your current catalog and song changes first:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"

Set-Location $repo
git status --short
git add -A
git commit -m "Save current songs before Update 20.1"
git push origin main
```

Then run the recommended update command again.

## Manual fallback

Use this only if Windows blocks the included script:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-20.1-Devices-Queue-Settings"

Test-Path "$repo\.git"
Test-Path "$update\payload\index.html"
Test-Path "$update\payload\update-20-1.css"

Set-Location $repo
git remote set-url origin https://github.com/X-S-M-X/Xotiic-Songs.git
git status --short
git pull --rebase origin main

Get-ChildItem -LiteralPath "$update\payload" -Force |
  Copy-Item -Destination $repo -Recurse -Force

Set-Location $repo
npm test
git status --short
git add -- app.js connected-devices.js index.html package.json sw.js theme.js update-20-1.css UPDATE-20.1-INSTRUCTIONS.md admin/admin-hotfix.css admin/index.html admin/sw.js admin/theme-sync.js tests/static.test.cjs tests/theme.test.cjs
git diff --cached --stat
git commit -m "Ship Update 20.1 Devices Queue and Settings redesign"
git push origin main
```

All three `Test-Path` commands must return `True`. If `git pull --rebase` says you have unstaged changes, stop and use the protection commands above first.

## After GitHub Pages deploys

1. Open the player while online.
2. Accept the player update prompt, or fully close and reopen the installed app.
3. Open Settings and confirm the version reads `20.1.0`.
4. Test Classic Xotiic, each anime preset, and Custom pair.
5. Open a song, expand Now Playing, and test Devices.
6. On a browser without a device picker, confirm Share player link or Copy player link works.
7. Open Queue on a phone and desktop and confirm both header buttons and row controls fit.

Remote Playback is not available in every browser. When it is unavailable, the button is intentionally disabled and Link mode is shown instead. The Share and Copy actions remain the supported handoff route.

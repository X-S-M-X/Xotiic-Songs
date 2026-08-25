# XotiicDuck Music Update 20.1.1

Update 20.1.1 is a focused Queue layout hotfix. It contains no new player feature and does not change any music, cover image, release, playlist, or admin-upload data.

## Included

- Correct Queue header grid on phone, tablet, and desktop layouts
- Equal-width mobile `Save as playlist` and `Clear upcoming` actions
- Removal of the conflicting 82px mobile width limit
- Automatic button height and normal label wrapping
- Minimum 44px mobile action height
- Player version changed to `20.1.1`
- New service-worker cache and asset versions
- Narrow-screen regression coverage

## Recommended update command

```powershell
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-20.1.1-Queue-Layout-Hotfix"

Set-ExecutionPolicy -Scope Process Bypass
& "$update\APPLY-UPDATE-20-1-1.ps1"
```

The updater automatically keeps these local Android folders out of Git without deleting them:

- `android-twa/generated/`
- `android-twa/output/`

It never stages those folders and never stages `catalog.js`, `music/`, or `covers/`.

## After GitHub Pages deploys

1. Open the player while online.
2. Accept the update prompt if it appears.
3. Fully close and reopen the installed PWA or APK once.
4. Open Settings and confirm the version is `20.1.1`.
5. Open Queue at a narrow phone width.
6. Confirm `Save as playlist` and `Clear upcoming` are centred and fully inside their borders.
7. Confirm `Clear upcoming` keeps the current song and removes only later songs.
8. Check the same Queue header on a tablet or desktop.

The Android APK does not need to be rebuilt for this web-interface repair because the TWA renders the hosted player.

## Manual fallback

Use this only if Windows blocks the included updater:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-20.1.1-Queue-Layout-Hotfix"

Set-Location $repo
git status --short
git pull --rebase origin main

Get-ChildItem -LiteralPath "$update\payload" -Force |
  Copy-Item -Destination $repo -Recurse -Force

Set-Location $repo
npm test

$files = @(
  "app.js",
  "index.html",
  "package.json",
  "sw.js",
  "update-20-1.css",
  "UPDATE-20.1.1-INSTRUCTIONS.md",
  "tests/static.test.cjs"
)

git add -- $files
git diff --cached --stat
git commit -m "Fix Update 20.1 queue action layout"
git push origin main
```

If `git status --short` shows files other than the two local Android folders, stop before the pull and protect those changes first.

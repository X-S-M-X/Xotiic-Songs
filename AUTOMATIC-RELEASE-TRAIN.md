# XotiicDuck Music automatic release train

This package installs all three completed code-only pairs at once, but keeps them hidden inside `.release-train/bundles/` until their release window.

## Planned pair schedule

| Pair | Earliest promotion time | Included work |
| --- | --- | --- |
| Updates 15 and 16 | 18 August 2026 at 09:17 UTC | Creator Studio 2.0 and Offline/Android 2.0 |
| Updates 17 and 18 | 21 August 2026 at 09:17 UTC | Personal Discovery and Storage Evolution |
| Updates 19 and 20 | 24 August 2026 at 09:17 UTC | Optional Online Platform and Connected Devices/Android preparation |

The workflow checks every six hours at minute 17. It releases only one pair per run and enforces at least 48 hours from the actual previous promotion. If GitHub runs late, later updates stay separated instead of all releasing together.

## Protected data

Every bundled pair excludes:

- `catalog.js`
- `music/`
- `covers/`

The promotion script rejects those paths, and the workflow performs a second staged-diff check before committing. Your uploaded songs, covers, lyrics, and release schedule remain controlled by the artist console.

## One-time Windows installation

Extract the ZIP to:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Automatic-Release-Train`

Run in the VS Code PowerShell terminal:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$train = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Automatic-Release-Train"

Test-Path "$repo\.git"
Test-Path "$train\.release-train\config.json"
Test-Path "$train\.github\workflows\release-train.yml"

Set-Location $repo
git remote set-url origin https://github.com/X-S-M-X/Xotiic-Songs.git
git status --short
```

All three tests must return `True`. If Git lists existing work, save it first:

```powershell
git add -A
git commit -m "Save songs and catalog before installing release train"
git push origin main
```

Then install and validate the train:

```powershell
Set-Location $repo
git pull --rebase origin main

Get-ChildItem -LiteralPath $train -Force |
  Where-Object { $_.Name -ne ".git" } |
  Copy-Item -Destination $repo -Recurse -Force

Set-Location $repo
node .release-train/promote-release.mjs --check
git status --short
git add -A
git commit -m "Install XotiicDuck automatic release train"
git push origin main
```

## One GitHub setting

On GitHub open:

`X-S-M-X/Xotiic-Songs` then `Settings` then `Pages`

Under Build and deployment, change Source to `GitHub Actions`.

This is required because a commit created with the workflow's built-in token does not start a separate branch-based Pages build. The same release workflow therefore tests, commits, assembles, and deploys the public site directly.

## Check or release manually

Open the repository's Actions tab and choose `XotiicDuck automatic release train`.

- Normal scheduled runs wait for the dates above.
- Run workflow with `force_next` left off to check safely without bypassing timing.
- Turn `force_next` on only if you deliberately want the next pair immediately.

If a test or deployment fails, the update does not silently skip ahead. Re-run the failed workflow or wait for the next six-hour check.

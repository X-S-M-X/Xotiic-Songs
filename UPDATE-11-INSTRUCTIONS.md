# Update 11: exact VS Code PowerShell steps

These commands preserve the live `catalog.js`, every uploaded MP3, every cover, and the existing `.git` history.

## 1. Extract the update

Extract the supplied ZIP so this folder exists:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-11`

Do not rename the existing repository folder.

## 2. Check both folders

Open the existing repository in VS Code, open a PowerShell terminal, and run:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-11"

Test-Path "$repo\.git"
Test-Path "$update\index.html"
```

Both results must say `True`.

## 3. Pull anything published from the phone admin app

```powershell
Set-Location $repo
git remote set-url origin https://github.com/X-S-M-X/Xotiic-Songs.git
git status --short
git pull --rebase origin main
```

If `git status --short` shows local changes before the pull, stop there and save/commit those changes first. Do not use `git reset`, `git restore`, or a force push.

## 4. Copy only Update 11 application files

```powershell
Get-ChildItem -LiteralPath $update -Force |
  Where-Object { $_.Name -notin @(".git", "catalog.js", "music", "covers") } |
  Copy-Item -Destination $repo -Recurse -Force
```

The exclusion is deliberate. It prevents an update package from replacing the live song catalog, music, or artwork.

## 5. Validate, commit, and push

```powershell
Set-Location $repo
npm test
git status --short
git add -A
git commit -m "Add release scheduling and listening charts"
git push origin main
```

The test run should finish with all tests passing. The LF/CRLF messages on Windows are warnings, not failures.

## 6. Refresh the installed apps

Wait for the GitHub Pages deployment to finish. Open the public player and artist console while online, then accept the update prompt or refresh once. Installed copies receive the new service worker and keep the same local playlists, favorites, offline songs, and encrypted admin vault.

## Optional global chart

The real worldwide Top Tracks This Month backend is included but starts disabled. After Update 11 is safely online, follow `GLOBAL-CHART-SETUP.md`. It is a separate one-time Cloudflare deployment and does not require rebuilding the player UI.

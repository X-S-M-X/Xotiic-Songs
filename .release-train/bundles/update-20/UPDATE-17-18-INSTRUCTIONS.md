# XotiicDuck Music Updates 17 and 18

This cumulative code-only package includes Updates 13 through 18. It intentionally excludes `catalog.js`, `music/`, and `covers/` so your uploaded catalog and media remain untouched.

## Update 17: Personal Discovery

- New compact For You library tab
- Private On Repeat, More Like This, Recently Added, Downloaded Favourites, Forgotten Favourites, Late Night, Battle Anthems, Character Themes, and rediscovery collections when enough matching songs exist
- Local Xotiic Recap with monthly qualified-play totals
- Listening history stays on the current device
- The home-page progress clutter remains disabled
- Richer Character, Energy, Vocal Style, Performance, and Similar Release metadata in the artist console

## Update 18: Streaming and Storage Evolution

- Transaction-safe offline replacement so an interrupted update keeps the previous saved copy
- SHA-256 integrity records for newly saved MP3s and covers where Web Crypto is available
- Deep offline verification from Settings
- Orphaned and superseded cache cleanup
- Storage persistence request and clear browser-support messaging
- Existing byte-range playback remains active for saved MP3 seeking

## Protected Windows update

Extract this ZIP to:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-18`

Run in the VS Code PowerShell terminal:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-18"

Test-Path "$repo\.git"
Test-Path "$update\index.html"

Set-Location $repo
git remote set-url origin https://github.com/X-S-M-X/Xotiic-Songs.git
git status --short
```

Both tests must return `True`. Save any listed work before copying:

```powershell
git add -A
git commit -m "Save current songs and catalog before Update 18"
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
git commit -m "Ship XotiicDuck Music Updates 17 and 18"
git push origin main
```

After deployment, accept the player update prompt. Open Library, choose For You, and open Settings to run Verify downloads.

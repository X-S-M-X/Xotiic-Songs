# XotiicDuck Music Updates 13 and 14

This is a code-only update package for the existing XotiicDuck Music repository.

It intentionally does not contain `catalog.js`, `music/`, or `covers/`. Those files are the live catalog and owner-uploaded media and must remain in the established repository folder.

## Included

- Update 13, Music Library 2.0
- Update 14, Playback Engine 2.0
- Public-player and artist-console responsive alignment repairs
- Catalog schema 3 support in the artist console
- Automated validation for new controls, metadata, service workers, manifests, security-critical catalog formatting, and the deliberate absence of sound-processing controls

## Not included

- Equalizer, crossfade, normalization, or other sound processing
- Global listening analytics or Cloudflare
- A signed Android APK
- Placeholder Updates 15 through 20

Future app-code releases can be scheduled with GitHub Actions after each pair is complete and tested. Update 19 still needs a backend decision. Update 20 still needs a separately protected Android signing process.

## Protected Windows update

Extract the ZIP so the update folder is:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-14`

Open PowerShell in VS Code and run:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-14"

Test-Path "$repo\.git"
Test-Path "$update\index.html"

Set-Location $repo
git remote set-url origin https://github.com/X-S-M-X/Xotiic-Songs.git
git status --short
```

Both `Test-Path` commands must return `True`.

If `git status --short` prints any files, save that existing work first:

```powershell
git add -A
git commit -m "Save current songs and catalog before Update 14"
git push origin main
```

Then pull and copy the code update:

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
git commit -m "Ship XotiicDuck Music Updates 13 and 14"
git push origin main
```

Wait for GitHub Pages to finish deploying. Open the public player, accept **Player update ready** if shown, and reopen the artist console once so its version 14 service worker takes control.

## Quick checks after deployment

1. Open Discover and test search, release type, genre, and sorting.
2. Open a song, seek through it, change shuffle and repeat, then try the sleep timer.
3. Open Settings and run Player diagnostics.
4. Open the artist console and confirm Publish now, Schedule, and Draft remain centered.
5. Edit a release and confirm optional metadata and lyrics save without replacing its MP3 or cover unless replacement files were selected.

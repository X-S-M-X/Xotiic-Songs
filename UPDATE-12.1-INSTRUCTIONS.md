# Update 12.1 admin alignment fix

This follow-up centers the complete Publish now, Schedule, and Draft controls in the artist console Ready Check card on desktop, tablet, and phone layouts. It keeps Classic Xotiic as the default player appearance, pauses the multi-song play tracker, removes the permanent circle from the Now Playing timeline, and adds full-song private preview playback to the admin console. Both service-worker caches advance so installed copies receive the corrected files.

## Install from the existing repository

Extract the ZIP so this file exists:

`C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-12.1\admin\index.html`

Then run these commands in the VS Code PowerShell terminal:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-12.1"

Test-Path "$repo\.git"
Test-Path "$update\admin\index.html"

Set-Location $repo
git status --short
```

Both path checks must return `True`. If Git lists unfinished local changes, commit and push those changes before continuing.

```powershell
Set-Location $repo
git pull --rebase origin main

Get-ChildItem -LiteralPath $update -Force |
  Where-Object { $_.Name -notin @(".git", "catalog.js", "music", "covers", "analytics.js", "analytics-worker", "GLOBAL-CHART-SETUP.md") } |
  Copy-Item -Destination $repo -Recurse -Force

Set-Location $repo
npm test
git add -A
git commit -m "Fix admin release mode alignment"
git push origin main
```

After GitHub Pages deploys, open the artist console online and accept **Console update ready**. If the old alignment remains visible, close the installed console completely, reopen it online, and refresh once.

In **Manage music**, choose **Preview** beside any published, scheduled, draft, or archived release. In **New release**, select an MP3 and choose **Test selected MP3**. Playback progress appears only in the single active preview bar.

# Deploy XotiicDuck Music on GitHub Pages

## Initial upload from VS Code

Open this extracted folder in VS Code and confirm `index.html` is at the top level. In the terminal run:

```powershell
git init -b main
git add .
git commit -m "Launch XotiicDuck Music and artist console"
git remote add origin https://github.com/X-S-M-X/Xotiic-Songs.git
git push -u origin main
```

Then open **GitHub repository → Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, `main`, and `/ (root)`, then save.

The public player will be located at:

`https://x-s-m-x.github.io/Xotiic-Songs/`

The private console will be located at:

`https://x-s-m-x.github.io/Xotiic-Songs/admin/`

## Important order

Push the complete package and wait for GitHub Pages to finish before creating the admin vault. The console needs an existing `main` branch and `catalog.js`.

## Future updates

Music published through Xotiic Upload is committed directly to `main`. GitHub Pages will redeploy automatically. Source changes made in VS Code can still be committed and pushed normally.

For Update 21, use the protected `APPLY-UPDATE-21.ps1` script in the update package. It pulls the live branch before checking the source version, stages only the listed app files, and never copies or stages `catalog.js`, `music/`, `covers/`, `.release-train/`, or Android build/signing folders. Artwork Vault concepts are not GitHub files: they remain in the browser's IndexedDB and should be backed up from the console before browser storage is cleared.

Before copying Updates 13 and 14, save and pull the newest catalog and songs that Xotiic Upload may already have published. Then copy only the app files, leaving `.git`, `catalog.js`, `music/`, and `covers/` untouched:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-14"

Set-Location $repo
git status --short
git pull --rebase origin main

Get-ChildItem -LiteralPath $update -Force |
  Where-Object { $_.Name -notin @(".git", "catalog.js", "music", "covers") } |
  Copy-Item -Destination $repo -Recurse -Force

Set-Location $repo
npm test
git add -A
git commit -m "Ship XotiicDuck Music Updates 13 and 14"
git push origin main
```

If `git status --short` shows local work before the pull, commit and push it first. Git cannot rebase while files have uncommitted changes. The paths above match the established project folder and the Update 14 extracted folder. Do not replace the live `catalog.js`, `music/`, or `covers/`. After GitHub Pages finishes, reopen the website and accept the **Player update ready** prompt.

Updates 13 and 14 keep the multi-song listening tracker hidden and do not connect to Cloudflare or another global analytics backend. The active song still keeps its normal seek position on the device.

GitHub Actions can run future code-release workflows on a UTC schedule, but later bundles must be completed and tested before such a workflow is enabled. Do not schedule placeholder builds. Scheduled GitHub jobs can also start later than the exact minute during busy periods.

Update 9 adds `offline.js`, `range.js`, automated tests, and a GitHub Actions validation workflow. The `music/` and `covers/` folders remain user data and are intentionally not included in application replacement copies.

## Offline listening behavior

Listeners choose **Save offline** on each song they want stored. The complete MP3 and cover are saved only on that device. A song must be saved once while online; normal streaming does not silently download the catalog. Browser or operating-system storage cleanup can remove website data, so listeners should keep the original online catalog available and re-save a song if needed.

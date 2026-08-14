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

Before copying Update 11, pull the newest catalog and songs that Xotiic Upload may already have published. Then copy only the app files, leaving `.git`, `catalog.js`, `music/`, and `covers/` untouched:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable-Update-11"

Set-Location $repo
git pull --rebase origin main

Get-ChildItem -LiteralPath $update -Force |
  Where-Object { $_.Name -notin @(".git", "catalog.js", "music", "covers") } |
  Copy-Item -Destination $repo -Recurse -Force

Set-Location $repo
npm test
git add -A
git commit -m "Add release scheduling and listening charts"
git push origin main
```

The paths above match the established project folder and the Update 11 extracted folder. Do not copy the package's `catalog.js` over the live one, and do not replace the live `music/` or `covers/` folders. The upgraded admin console converts the live catalog to version 2 on its next successful release change. After GitHub Pages finishes, reopen the website and accept the **Player update ready** prompt.

The global monthly chart is optional and disabled by default. Follow `GLOBAL-CHART-SETUP.md` only after the main update is online.

Update 9 adds `offline.js`, `range.js`, automated tests, and a GitHub Actions validation workflow. The `music/` and `covers/` folders remain user data and are intentionally not included in application replacement copies.

## Offline listening behavior

Listeners choose **Save offline** on each song they want stored. The complete MP3 and cover are saved only on that device. A song must be saved once while online; normal streaming does not silently download the catalog. Browser or operating-system storage cleanup can remove website data, so listeners should keep the original online catalog available and re-save a song if needed.

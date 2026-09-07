# XotiicDuck Music Update 22

This is the complete protected Update 22 installer for the existing Update 21 website and Artist Console. It is not the earlier development checkpoint.

## Included

- Artwork-led Home, improved phone/tablet/desktop layouts, shared dark themed controls, grouped Settings, library density, optional desktop queue and custom-colour contrast handling.
- Shareable release pages with existing lyrics, credits, YouTube/Spotify/Apple Music links and links between alternate versions. Existing song links keep working.
- Queue Undo and desktop drag reordering, with move buttons retained for touch and keyboard use.
- Song projects with a stable cover-to-MP3-to-release workflow. Resume a linked project to edit its existing release.
- Bulk square artwork import, exact-file duplicate checking, filename title suggestions, batch metadata fill, original images and selected project exports.
- Backup conflict previews, all-or-nothing project restoration and size checks before audio is encoded.
- Conservative franchise/character suggestions on upload, including draft/scheduled forms, and editable bulk review for existing releases. Ambiguous song titles are left for you to review.
- Private online drafts, archives and scheduled publication tools, with a separately reviewed migration.
- Public-only Pages build and browser-test deployment gate. The completed Update 13-20 release train is retired so its old deployment cannot bypass the new gate.

Your current untimed lyrics work as they are. **You do not have to timestamp your songs.** This update does not claim automatic lyric synchronization.

## Install

Requirements: Git, Node.js **22.12 or newer**, an existing clean checkout on main, and GitHub access for that checkout. The workflow changes require permission to update workflow files.

1. Extract the ZIP into Downloads.
2. The extracted folder should be `XotiicDuck-Update-22`, containing `APPLY-UPDATE-22.ps1`, `installer.cjs` and `payload`.
3. Run:

```powershell
$repo = "$env:USERPROFILE\Downloads\XotiicDuck-Music-Portable"
$update = "$env:USERPROFILE\Downloads\XotiicDuck-Update-22"
Test-Path "$update\APPLY-UPDATE-22.ps1"
Set-ExecutionPolicy -Scope Process Bypass
& "$update\APPLY-UPDATE-22.ps1" -Repo $repo
```

The path check must return True. If extraction created an extra nested folder, use the folder that directly contains the script.

The installer excludes local Android generated/output folders, checks for uncommitted changes, **pulls before checking the version**, verifies every payload hash and checks for conflicting newer code before copying. It backs up replaced files, runs tests and a public build, stages only the update files, then commits and pushes. GitHub runs the browser checks before Pages deployment.

If it stops because you have uncommitted changes, inspect `git status --short` and save only the intended files. Do not use blanket `git add -A` with Android outputs or signing material.

If validation fails before commit, the installer restores the files it copied. If the final push fails, it keeps the validated commit and backup so you can resolve the Git error and push again.

The ZIP does not contain catalog.js, music, covers, APK output, Android projects or signing keys. It cannot replace your uploaded songs or covers.

## One-time private storage setup

Read **PRIVATE-STORAGE-SETUP.md** next. Creating the private repository, configuring its publishing secret and migrating existing unreleased records require that setup. The update is not claiming those external steps have already run.

Until setup finishes, keep new unfinished work in local Artwork Vault projects. Existing published music remains usable.

## After deployment

Open the app online, accept Player update ready if shown, then close and reopen it. Settings > About and diagnostics should show **22.0.0**. The Artist Console also serves 22.0.0.

The APK loads this website, so this update does not require an APK rebuild.

## Maintenance and verification

The active styles are generated into `ui/player.css` and `ui/console.css`. Historical styles remain as compatibility sources; this is not a framework rewrite. Run `npm run build:ui` after editing CSS or versioned scripts.

The package was checked with automated logic, DOM, publishing and installer tests, plus manual browser review of responsive screens. The Pages build was checked against the current catalog and real referenced media. See VALIDATION.md for results and limitations.

There are no listener cloud accounts, global charts, mandatory manual lyric timing, or paid APIs added.

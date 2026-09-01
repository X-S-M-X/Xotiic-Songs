# XotiicDuck Music Update 21

Update 21 is the Adaptive Listener and Artwork Vault release. It coordinates the public player and Artist Console across phone, tablet, desktop, installed PWA, and Android TWA layouts.

## Included

- Cover-first phone Home interface and compact phone player
- Persistent tablet listener navigation rail
- Readable three-card desktop catalog, expanding to four cards on very large screens
- Wide-screen-only Now Playing inspector
- Responsive Queue, Settings, Devices, Search, Library, and Discover surfaces
- Meaningful Discover filters that disappear when the catalog offers only one option
- Private on-device Recently played and monthly listening sections
- Installed-context suppression for install promotions
- Artist Console layouts tailored to phone, tablet, and desktop
- Four-step phone release workflow: Artwork, Audio, Details, Review
- IndexedDB Artwork Vault for cover-only song concepts
- Concept search, statuses, inspector, editing, deletion, backup, and restore
- Direct Attach MP3 handoff from a concept to the real release form
- Player, console, manifest, and service-worker version `21.0.0`

## Artwork Vault storage

Artwork Vault is intentionally local and unpublished. A saved concept never appears in `catalog.js`, the public player, GitHub, or the Android package. The cover Blob and its working metadata remain in IndexedDB on the current browser/app installation.

Use **Artwork Vault → Back up** before:

- moving to another phone or computer;
- switching browsers;
- uninstalling the PWA;
- clearing browser/site data; or
- resetting the device.

The JSON backup contains the concept metadata and embedded cover images. It does not contain the GitHub token, console password, MP3 files, published catalog, or listener library.

## Protected update command

Extract the update ZIP so this file exists:

```text
C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-21-Adaptive-Artwork-Vault\APPLY-UPDATE-21.ps1
```

Then open PowerShell and run:

```powershell
$update = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Update-21-Adaptive-Artwork-Vault"

Set-ExecutionPolicy -Scope Process Bypass
& "$update\APPLY-UPDATE-21.ps1"
```

The updater:

1. Keeps local Android generated/output folders outside Git.
2. Stops if unrelated repository changes need protection.
3. Pulls `origin/main` before checking the installed player version.
4. Applies only the Update 21 code and documentation payload.
5. Runs every project test and `git diff --check`.
6. Stages only the explicit Update 21 file list.
7. Commits and pushes to `main`.

It never copies or stages:

- `catalog.js`
- `music/`
- `covers/`
- `.release-train/`
- `android-twa/`
- the APK output
- the generated Android project
- a signing key

## After GitHub Pages deploys

1. Open the website while online and accept **Player update ready** if shown.
2. Fully close and reopen the website, installed PWA, or APK once.
3. Open Settings and confirm player version `21.0.0`.
4. Check Home, Discover, Library, Queue, Settings, and Devices on a phone.
5. Check that the tablet layout uses an icon navigation rail rather than phone bottom navigation.
6. Open Artist access and confirm the five console destinations: Overview, Artwork, New release, Manage music, Security.
7. Create one Artwork Vault concept with a square cover and working title.
8. Close and reopen the console, confirm the concept remains, then choose **Attach MP3**.
9. Confirm the New release form opens at Audio with the title, cover, and optional metadata already loaded.

No APK rebuild is required. The signed Android TWA displays the hosted player and receives the new interface after GitHub Pages and the service worker update.

# XotiicDuck Music — GitHub release package

This folder contains two connected installable web apps:

- The public XotiicDuck Music player at the repository root.
- The private Xotiic Upload artist console at `admin/`.

There are no demo songs or fake covers. The public catalog remains empty until a complete release is published.

## Publish the complete project

1. Upload this entire folder to the public GitHub repository `x-s-m-x/Xotiic-Songs`.
2. Keep `index.html`, `catalog.js`, `music/`, `covers/`, and `admin/` at the repository root.
3. In GitHub, open **Settings → Pages**.
4. Select **Deploy from a branch**, `main`, and `/ (root)`.
5. Wait for the Pages address to become active.

## First owner setup

1. Open the public website and choose **Artist access** in the footer, or open `/admin/` directly.
2. Create a fine-grained GitHub token limited to only `Xotiic-Songs`, with **Contents: Read and write** permission.
3. Choose the console username and a password of at least 12 characters.
4. Paste the token once. The console verifies the `x-s-m-x` owner and encrypts the token locally.
5. Use the console's **Install** button on each authorized phone or computer. It opens the native prompt when the browser provides one, or shows the correct steps for that device.

Each device has its own encrypted vault. Resetting a device vault does not delete music from GitHub.

## Publishing from a phone

Open Xotiic Upload, unlock it, select the MP3 from Files, select the square cover from Gallery, enter the release information, and publish. The console commits the MP3, cover, and `catalog.js` together. GitHub Pages updates the player shortly afterward.

## Phone and tablet support

Both apps adapt from 320-pixel phones through large tablets, including portrait and landscape layouts. Navigation, the music player, upload forms, dialogs, and safe areas for notches/home indicators are handled separately from the desktop layout.

On phones and tablets, tap the compact player above the navigation bar to open **Now Playing**. The expanded view includes the square cover, elapsed and total time, touch seeking, restart/previous, play/pause, next, shuffle, repeat Off/All/One, queue access, favorites, and local playlists. Playlist names and song choices are saved only in that browser; the MP3 files remain in the official catalog.

Lyrics are optional. The Lyrics control appears only when a published catalog entry contains lyric text, so releases without lyrics keep a clean player.

- **Android/Chrome or Edge:** the Install button opens the browser prompt when available; otherwise follow its menu instructions.
- **Samsung Internet:** use **☰ → Add page to → Home screen**, or **Install app** when shown.
- **iPhone/iPad:** open in Safari, choose **Share → Add to Home Screen**, enable **Open as Web App**, and tap **Add**.

Installation support belongs to the browser. On browsers without installable-web-app support, the complete website still works normally.

See `ADMIN-SETUP.md` for the complete security and token instructions.

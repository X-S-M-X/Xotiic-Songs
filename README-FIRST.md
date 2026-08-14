# XotiicDuck Music — GitHub release package

This folder contains two connected installable web apps:

- The public XotiicDuck Music player at the repository root.
- The private Xotiic Upload artist console at `admin/`.

There are no demo songs or fake covers. Every visible entry comes from the live owner-managed catalog and requires a complete MP3 and square cover.

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

Open Xotiic Upload, unlock it, select the MP3 from Files, select the square cover from Gallery, enter the release information, then choose **Publish now**, **Schedule**, or **Draft**. Publish now uses the current date automatically. Scheduled releases stay hidden until the chosen local date and time, then the player makes them public automatically. The console commits the MP3, cover, and `catalog.js` together.

## Phone and tablet support

Both apps adapt from 320-pixel phones through large tablets, including portrait and landscape layouts. Navigation, the music player, upload forms, dialogs, and safe areas for notches/home indicators are handled separately from the desktop layout.

On phones and tablets, tap the compact player above the navigation bar to open **Now Playing**. The expanded view includes the square cover, elapsed and total time, touch seeking, restart/previous, play/pause, next, shuffle, repeat Off/All/One, editable queue, favorites, sharing, local playlists, and an explicit **Save offline** control. Playback position, volume, and the current queue resume on the same device.

To listen without internet, open a song while online and choose **Save offline**. The player downloads that song's complete MP3 and cover and shows it under **Library → Offline songs**. Offline seeking works because the service worker serves byte ranges from the saved complete file. Browser storage can still be removed by the operating system, private-browsing mode, or a user clearing site data; the app requests persistent storage where the browser supports it, but no website can promise permanent device storage.

Favorites and playlists can be backed up from **Your library → Back up** and restored from the JSON file. That small backup contains playlist names, track IDs, and favorites—not MP3s, covers, passwords, or GitHub access.

Lyrics are optional. The Lyrics control appears only when a published catalog entry contains lyric text, so releases without lyrics keep a clean player.

- **Android/Chrome or Edge:** the Install button opens the browser prompt when available; otherwise follow its menu instructions.
- **Samsung Internet:** use **☰ → Add page to → Home screen**, or **Install app** when shown.
- **iPhone/iPad:** open in Safari, choose **Share → Add to Home Screen**, enable **Open as Web App**, and tap **Add**.

Installation support belongs to the browser. On browsers without installable-web-app support, the complete website still works normally.

Background controls use the browser Media Session API where supported, so installed copies can continue audio when the app is in the background and provide lock-screen controls. Force-closing the browser/PWA or an operating-system battery rule can still stop playback.

## What Update 11 adds

- A new owner overview with live, scheduled, draft, and archived counts, the next release, quick actions, and copyable diagnostics.
- Publish now, exact date/time scheduling, automatic dates, hidden drafts, and recoverable archiving instead of destructive deletion.
- A versioned catalog format that remains compatible with every existing song.
- Correct date-based Latest Releases on Home and newest-first Discover ordering.
- Private Recently Played and Your Top Tracks This Month sections stored only on the listener's device.
- An optional real global monthly chart backed by the included Cloudflare Worker and D1 project. It remains hidden until deliberately deployed and enabled.
- Automatic scheduled visibility without needing to reopen the admin console or edit a date on release day.

See `GLOBAL-CHART-SETUP.md` for the optional worldwide chart. The player and all local features work without it.

## Update 9.2 playback-state polish

Update 9.2 keeps every visible song and playlist control synchronized with the real audio state. The active item shows Pause while playing, returns to Play when paused or finished, receives a clear active highlight, and can pause or resume without restarting its queue.

## Update 9.1 editor fix

Update 9.1 fixes the artist console error that could appear after saving edited lyrics or other release details. It also aligns the replacement MP3 and cover file controls consistently on phones, tablets, and desktop browsers.

## What Update 9 adds

- User-selected offline MP3 and cover downloads, storage usage, removal, and offline seeking.
- Resume of song, position, volume, queue, and playback context.
- Editable queue order, **Play next**, remove, clear-upcoming, and playlist song reordering.
- Shareable song links and optional release description/date/YouTube metadata.
- Listener Library backup/restore, visible buffering/error states, retry controls, and safer update prompts.
- Artist-side release editing, optional MP3/cover replacement, phone cover optimization, and encrypted vault backup/restore.
- Automated tests that run on GitHub Actions for range handling, catalog formatting, vault encryption, manifests, and required controls.

To run the same dependency-free validation locally, open this folder in the VS Code terminal and run `npm test`. GitHub also runs it automatically after a push through `.github/workflows/validate.yml`.

See `ADMIN-SETUP.md` for the complete security and token instructions.

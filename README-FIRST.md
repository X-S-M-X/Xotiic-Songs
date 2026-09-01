# XotiicDuck Music | GitHub release package

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

If the song is not finished yet, open **Artwork Vault** instead. A concept needs only a square cover and working title. Optional franchise, character, mood, performance, tags, and notes can be saved with it. Later, choose **Attach MP3** to preload the real release form and continue from the audio step. Artwork Vault concepts stay in IndexedDB on that device and never enter the public catalog; use the vault's **Back up** command before changing devices, browsers, or clearing site data.

## Phone and tablet support

Both apps adapt from 320-pixel phones through large tablets, including portrait and landscape layouts. Navigation, the music player, upload forms, dialogs, and safe areas for notches/home indicators are handled separately from the desktop layout.

On phones and tablets, tap the compact player above the navigation bar to open **Now Playing**. Swipe that compact player left for the next song or right for the previous song. The expanded view includes the square cover, elapsed and total time, touch seeking, restart/previous, play/pause, next, shuffle, repeat Off/All/One, editable queue, favorites, sharing, local playlists, and an explicit **Save offline** control. Playback position, volume, and the current queue resume on the same device.

To listen without internet, open a song while online and choose **Save offline**. The player downloads that song's complete MP3 and cover and shows it under **Library → Offline songs**. Offline seeking works because the service worker serves byte ranges from the saved complete file. Browser storage can still be removed by the operating system, private-browsing mode, or a user clearing site data; the app requests persistent storage where the browser supports it, but no website can promise permanent device storage.

The Library is split into **Playlists**, **Liked**, and **Offline** tabs so small screens do not need to render one very long page. Every offline row says **Saved** and has a clearly labeled **Remove** action. Favorites and playlists can be backed up from **Your library → Back up** and restored from the JSON file. That small backup contains playlist names, track IDs, and favorites, but not MP3s, covers, passwords, or GitHub access.

Lyrics are optional. The Lyrics control appears only when a published catalog entry contains lyric text, so releases without lyrics keep a clean player.

Home can show private **Recently played** and **Your listening this month** sections after meaningful listening. Those sections are calculated locally, stay only on that device, and can be cleared by the listener. They are not a public chart and are not sent to an analytics service.

- **Android/Chrome or Edge:** the Install button opens the browser prompt when available; otherwise follow its menu instructions.
- **Samsung Internet:** use **☰ → Add page to → Home screen**, or **Install app** when shown.
- **iPhone/iPad:** open in Safari, choose **Share → Add to Home Screen**, enable **Open as Web App**, and tap **Add**.

Installation support belongs to the browser. On browsers without installable-web-app support, the complete website still works normally.

Background controls use the browser Media Session API where supported, so installed copies can continue audio when the app is in the background and provide lock-screen controls. Force-closing the browser/PWA or an operating-system battery rule can still stop playback.

## What Update 21 adds

- Deliberately different phone, tablet, desktop, and large-desktop layouts instead of scaling one desktop page down.
- A cover-first phone Home screen, two-column phone release grid, compact player, four-item listener navigation, and bottom-sheet dialogs.
- A persistent tablet navigation rail, wider tablet workspace, and tablet player placement that does not compete with phone navigation.
- More readable desktop cards, a less crowded content column, and a Now Playing inspector reserved for genuinely wide screens.
- One adaptive Update 21 foundation loaded after the historical styles, replacing the pattern of adding another small responsive hotfix for every screen.
- Meaningful Discover controls only: release-type and genre controls hide when the live catalog has no real choice to offer.
- Restored local Recently played and monthly listening sections with matching privacy wording.
- Installed APK/PWA detection that removes installation promotions inside installed contexts and on supported browsers that detect the related Android app.
- A first-class Artist Console **Artwork Vault** backed by IndexedDB for square cover concepts without MP3 files.
- Artwork Vault search, statuses, inspector, edit/delete, JSON backup/restore, and a direct **Attach MP3** path into New release.
- A four-step phone release workflow for Artwork, Audio, Details, and Review, while tablets and desktops keep a dense production workspace.
- The existing Classic black-and-green theme, anime palettes, custom two-colour theme, player data, GitHub catalog, and Android wrapper remain intact.

See `UPDATE-21-INSTRUCTIONS.md` for the protected updater and device checks.

## What Updates 13 and 14 add

Update 13 is Music Library 2.0:

- Discover search across titles, artists, collections, genres, franchises, moods, tags, credits, descriptions, and lyrics.
- Release-type and genre filters, plus latest, oldest, title, and duration sorting.
- Album and collection pages with ordered tracks and collection play or shuffle.
- Queue-to-playlist saving and richer release metadata in Now Playing.
- Artist-console fields for collection title, track number, franchise, mood, tags, credits, and explicit marking.
- Latest releases are ordered by public release timing and then by catalog order when dates match.

Update 14 is Playback Engine 2.0:

- A sleep timer for 15, 30, 45, or 60 minutes, plus stop after the current song.
- Better Media Session support for play, pause, stop, seek, previous, and next controls where the browser supports them.
- Keyboard seeking on desktop: Left or Right seeks 10 seconds, Shift plus Left or Right changes track, S toggles shuffle, and R changes repeat.
- Versioned MP3 and cover URLs so edited media replaces stale browser copies without breaking offline downloads.
- Player health details for app version, install mode, connection, storage, and saved-song count.
- A new responsive alignment layer for Discover, collections, queues, Now Playing actions, settings, and the artist-console editor.

No equalizer, crossfade, loudness normalization, or other sound-processing control was added. The active-song timeline remains the only playback progress tracker.

## What Update 12 added

- **Classic Xotiic** remains the default black-and-green appearance. **Anime Pulse** is an optional visual redesign in Settings.
- Pulse, Sakura, and Aqua accents, with system, full, or reduced motion preferences.
- A rebuilt alignment layer for phones from 320 pixels wide, tablets, desktop, portrait, landscape, notches, and home indicators.
- Mobile and tablet mini-player gestures: swipe left for next, swipe right for previous, or tap to open Now Playing.
- Compact Library tabs for Playlists, Liked, and Offline, with counts and keyboard support.
- Clear offline states using **Saved**, **Save offline**, and **Remove** labels instead of unexplained icons.
- A redesigned artist console with aligned file controls, visible device timezone details, and recoverable metadata drafts while preparing a release.
- A private full-song admin test player for live, scheduled, draft, and archived catalog MP3 files.
- Private listening sections qualify a play only after meaningful listening, remain on the device, and never use a global listening backend.

See `UPDATE-13-14-INSTRUCTIONS.md` for the protected Windows update process that keeps the live catalog, songs, and covers intact.

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

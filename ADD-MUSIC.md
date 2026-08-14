# Add an official release

## Recommended: Xotiic Upload

1. Open the website's **Artist access** link or visit the `admin/` address.
2. Unlock the owner console.
3. Select the final MP3 from Files.
4. Select the square JPG, PNG, or WebP cover from Gallery.
5. Enter the title, artist, release type, genre, optional description, optional YouTube link, and optional lyrics.
6. Choose **Publish now**, **Schedule**, or **Draft**. Publish now fills today's date automatically; Schedule asks for the exact local date and time.
7. Review the release and save it to GitHub.

The console detects the MP3 duration, verifies square artwork, optimizes large phone covers to a high-quality square WebP, prevents duplicate release IDs, and commits the audio, cover, and catalog together.

## Correct an existing release

Open **Manage music → Edit** beside the release. You can change its title, artist, release type, genre, visibility/schedule, description, YouTube link, or lyrics. A replacement MP3 and square cover are optional. The fixed release ID keeps existing song links, playlists, charts, and listener references stable. Changed files and `catalog.js` are committed together.

Use **Archive** when a release should disappear without deleting its MP3 or cover. Archived releases can be restored as drafts later.

## Manual fallback

You can still add a release through VS Code:

1. Put the MP3 in `music/`.
2. Put the square cover in `covers/`.
3. Add the release object inside `window.XOTIICDUCK_RELEASES` in `catalog.js`.
4. Commit and push the files to `main`.

The public player displays complete `published` entries plus `scheduled` entries after their valid `releaseAt` time. Drafts and archived entries remain hidden. Optional `description`, `releaseDate`, and an HTTPS `youtubeUrl` from youtube.com/youtu.be appear in the release information. An optional `lyrics` string enables the Lyrics control inside Now Playing; leaving it out keeps that control hidden.

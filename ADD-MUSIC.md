# Add an official release

## Recommended: Xotiic Upload

1. Open the website's **Artist access** link or visit the `admin/` address.
2. Unlock the owner console.
3. Select the final MP3 from Files.
4. Select the square JPG, PNG, or WebP cover from Gallery.
5. Enter the title, artist, release type, genre, date, and optional description.
6. Review the release and choose **Publish to GitHub**.

The console detects the MP3 duration, verifies square artwork, prevents duplicate release IDs, and commits the audio, cover, and catalog together.

## Manual fallback

You can still add a release through VS Code:

1. Put the MP3 in `music/`.
2. Put the square cover in `covers/`.
3. Add the release object inside `window.XOTIICDUCK_RELEASES` in `catalog.js`.
4. Commit and push the files to `main`.

The public player displays only entries with `status: "published"`, a valid MP3 path, a cover path, title, artist, and duration.

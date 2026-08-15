# Xotiic Upload

`admin/` is the private, installable release console connected to the public XotiicDuck Music catalog.

## Security model

- A fine-grained GitHub token must belong to `x-s-m-x` and have write access to only `x-s-m-x/Xotiic-Songs`.
- First-time setup encrypts that token with a key derived from the chosen console password.
- The token remains encrypted in browser storage while the console is locked and is held only in memory while unlocked.
- The password and token are never committed to GitHub.
- Each phone or computer requires its own one-time setup.

## Required GitHub token permission

Create a fine-grained personal access token with access to only `Xotiic-Songs` and set **Repository permissions → Contents** to **Read and write**. Metadata read permission is added automatically by GitHub.

## Publishing behavior

The console validates the MP3, verifies and optimizes square artwork, accepts an optional description, YouTube link, and lyrics, reads the latest `catalog.js`, creates Git blobs, and publishes the MP3, cover, and catalog as one atomic commit. GitHub Pages then updates the public player.

The console supports immediate publishing with an automatic date, exact date/time scheduling in the displayed device timezone, hidden drafts, editing existing metadata, optional MP3/cover replacement, hiding live releases, recoverable archiving, token renewal, encrypted vault backup/restore, diagnostics, recoverable release-metadata drafts, and a 30-minute idle lock. Archived files remain in the repository and can be restored as drafts. Browser security requires MP3 and cover files to be selected again after restoring a metadata draft.

Update 12 gives the console a responsive artist-studio layout: a desktop sidebar, tablet toolbar, phone bottom navigation, aligned file selectors, and safe-area handling for portrait and landscape devices.

The private preview player can play the complete MP3 for published, scheduled, draft, and archived catalog entries without changing their visibility. Open **Manage music** and use **Play test** beside any song. Only the single active preview shows a timeline, and closing or locking the console stops it.

The console's URL is visible because the repository and GitHub Pages site are public. That does not grant upload access: every repository change is verified by GitHub using the owner's limited token, and the token stays encrypted while the local console is locked.

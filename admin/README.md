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

The console supports publishing hidden drafts, editing existing release metadata, optionally replacing a release MP3/cover, making drafts public, hiding live releases, deleting current release files, renewing the GitHub token, encrypted vault backup/restore, and a 30-minute idle lock.

The console's URL is visible because the repository and GitHub Pages site are public. That does not grant upload access: every repository change is verified by GitHub using the owner's limited token, and the token stays encrypted while the local console is locked.

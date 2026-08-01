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
5. Install Xotiic Upload from the browser menu on each authorized phone or computer.

Each device has its own encrypted vault. Resetting a device vault does not delete music from GitHub.

## Publishing from a phone

Open Xotiic Upload, unlock it, select the MP3 from Files, select the square cover from Gallery, enter the release information, and publish. The console commits the MP3, cover, and `catalog.js` together. GitHub Pages updates the player shortly afterward.

See `ADMIN-SETUP.md` for the complete security and token instructions.

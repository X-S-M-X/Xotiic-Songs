# Xotiic Upload owner setup

## Create a limited GitHub token

1. Sign in to GitHub as `x-s-m-x`.
2. Open <https://github.com/settings/personal-access-tokens/new>.
3. Give the token a clear name such as `Xotiic Upload - Samsung`.
4. Choose an expiration that suits you. When it expires, use **Security → Replace GitHub token** in the admin console.
5. Under **Repository access**, choose **Only select repositories** and select `Xotiic-Songs`.
6. Under **Repository permissions**, set **Contents** to **Read and write**. GitHub supplies Metadata read access automatically.
7. Generate the token and copy it once.

## Secure the first device

1. Open `https://x-s-m-x.github.io/Xotiic-Songs/admin/` after GitHub Pages is active.
2. Choose a private username.
3. Choose a unique password with at least 12 characters.
4. Paste the fine-grained token.
5. Complete setup and install the admin PWA from Chrome's menu.

The token is encrypted locally with PBKDF2-SHA256 and AES-256-GCM. The token is decrypted only into memory after a successful login. The console locks after 30 minutes without activity. The `/admin/` page itself is public because GitHub Pages is public, but publishing still requires the encrypted local vault, its username/password, a valid GitHub token belonging to the required owner, and repository write permission.

## Release timing

- **Publish now** applies the current date automatically and publishes after GitHub Pages deploys.
- **Schedule** stores an exact UTC timestamp calculated from the phone/computer's displayed local time. The public player makes it visible automatically when that instant arrives.
- **Draft** uploads the complete release but keeps it hidden.
- **Archive** hides an existing release without deleting its current MP3 or cover. It can later be restored as a draft.

Scheduling controls when the song appears in the player. Because the GitHub repository itself is public, a determined person could inspect repository files before that time. Treat this as automatic storefront timing, not a confidential pre-release embargo.

The release form shows the active device timezone. While preparing a release, its text fields and chosen timing mode are saved locally as a recoverable metadata draft. The browser does not allow the console to restore selected MP3 or cover files, so those must be selected again after a page reload. Tokens and passwords are never included in release drafts.

Updates 13 and 14 add optional collection and discovery metadata. Songs that share the exact same collection title and artist are grouped into a collection page in the public player. Track numbers control their order. Empty optional fields are omitted from the catalog, and older catalog entries remain compatible.

## Artwork Vault concepts

Update 21 adds an Artwork Vault for square covers whose songs are not finished yet. These concepts are separate from the encrypted GitHub credential vault and separate from the published catalog. Their cover images and working metadata are stored locally in IndexedDB on the current browser/app installation.

Use **Artwork → Back up** regularly. Clearing site data, uninstalling the PWA, or changing browsers can remove local concepts. Restoring an Artwork Vault backup does not restore or expose the GitHub token, console password, MP3 files, or published catalog.

## Add another phone or computer

Open the admin address on that device and repeat first-time setup using a valid fine-grained token. Alternatively, download the already-encrypted file from **Security → Back up this device vault**, restore it on the new device, then enter its existing username and password. Device vaults remain separate after restoration.

Treat the encrypted backup as sensitive. It does not expose the token by itself, but someone who obtains both the backup and its password could unlock the token. Do not commit a vault backup to GitHub.

## Lost password or removed phone

- Use **Reset this device** to remove only the local encrypted vault.
- Revoke the device's GitHub token at <https://github.com/settings/personal-access-tokens> if the device is lost.
- Published songs remain in the repository.

## File limits

- MP3: 40 MB maximum in the phone uploader.
- Cover: 10 MB maximum, JPG/PNG/WebP, within 3% of a square aspect ratio.
- Covers over 1600 pixels or 2 MB are reduced to at most 1400 × 1400 and encoded as high-quality WebP before upload.
- GitHub repository blobs have an absolute 100 MB limit, but the lower console limit is safer for mobile memory and uploads.

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

The token is encrypted locally with PBKDF2-SHA256 and AES-256-GCM. The token is decrypted only into memory after a successful login. The console locks after 30 minutes without activity.

## Add another phone or computer

Open the admin address on that device and repeat first-time setup using a valid fine-grained token. Device vaults are separate. They may use the same console username and password if desired.

## Lost password or removed phone

- Use **Reset this device** to remove only the local encrypted vault.
- Revoke the device's GitHub token at <https://github.com/settings/personal-access-tokens> if the device is lost.
- Published songs remain in the repository.

## File limits

- MP3: 40 MB maximum in the phone uploader.
- Cover: 10 MB maximum, JPG/PNG/WebP, within 3% of a square aspect ratio.
- GitHub repository blobs have an absolute 100 MB limit, but the lower console limit is safer for mobile memory and uploads.

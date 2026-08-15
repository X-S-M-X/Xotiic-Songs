# XotiicDuck Music Android wrapper preparation

This folder prepares Update 20 for a Trusted Web Activity wrapper. It does not contain a signing key or a finished APK.

The web player remains the source of truth. The Android wrapper opens:

`https://x-s-m-x.github.io/Xotiic-Songs/`

## Why there is no APK in this update

Bubblewrap needs a private signing key. The certificate fingerprint from that key must appear in a Digital Asset Links file before Chrome can remove its browser bar. Committing a key or inventing a fingerprint would be unsafe.

The Digital Asset Links file must be available at the root of the host:

`https://x-s-m-x.github.io/.well-known/assetlinks.json`

That is outside the `/Xotiic-Songs/` project path. Use either a separate `X-S-M-X.github.io` user-site repository for the host-root file or a custom domain that you control. Do not place the template in this project's live `.well-known` folder and assume it will verify.

## Generate the Android project later

Requirements on Windows:

- Current Node.js LTS
- Java and Android command-line tools, or permission for Bubblewrap to install its recommended dependencies
- A private location to back up the generated keystore and its passwords

In PowerShell:

```powershell
npm install -g @bubblewrap/cli
Set-Location "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable\android-twa"
.\BUILD-ANDROID.ps1
```

The script runs Bubblewrap's official manifest-based initialization. During the prompts use:

- Application ID: `music.xotiicduck.player`
- App name: `XotiicDuck Music`
- Launcher name: `XotiicDuck`
- Start URL: `/Xotiic-Songs/`
- Version name: `20.0.0`
- Version code: `20`
- Signing-key path: a private path that is backed up outside GitHub

After the build, obtain the real SHA-256 certificate fingerprint and replace the placeholder in `assetlinks.template.json`. Publish the completed JSON at the host root only after confirming the package ID and fingerprint.

Never commit the keystore, its passwords, `local.properties`, or release APK/AAB outputs. The root `.gitignore` blocks the common paths, but check `git status --short` before every commit.

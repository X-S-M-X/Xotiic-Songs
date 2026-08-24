# XotiicDuck Music Android APK workflow

This folder turns the existing installable web player into a signed Android Trusted Web Activity. It is the same XotiicDuck Music app and catalog, not a second copy of the music service.

The first build is designed for direct installation from the official website. Google Play is not required.

## What the Android wrapper provides

- An installable `.apk` with the XotiicDuck Music icon and app identity
- The complete responsive player at `https://x-s-m-x.github.io/Xotiic-Songs/`
- Browser-backed Media Session controls for lock-screen and background playback
- The existing PWA cache and user-selected offline song downloads
- Web updates without rebuilding the APK when only HTML, CSS, JavaScript, songs, or covers change

The wrapper still relies on an Android browser that supports Trusted Web Activities. If Android cannot verify that the website and APK have the same owner, it safely falls back to a Custom Tab and shows browser controls.

## Security rules that cannot be skipped

1. Never commit the signing keystore or either password to GitHub.
2. Keep two private backups of the keystore. Every future APK update must use the same signing certificate.
3. Do not send the keystore or passwords through chat, email, or Discord.
4. Publish only the public SHA-256 certificate fingerprint in `assetlinks.json`.
5. Distribute the APK through HTTPS and publish its `APK-SHA256.txt` checksum beside it.

The project `.gitignore` blocks the generated Android project, signing keys, build outputs, and local SDK files.

## One-time Windows setup and first build

Install the current Node.js LTS release first. Then open the established website repository in VS Code and run:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
Set-Location "$repo\android-twa"
Set-ExecutionPolicy -Scope Process Bypass
.\BUILD-ANDROID.ps1
```

The script uses the pinned official Bubblewrap CLI package and offers to download its recommended JDK 17 and Android command-line tools. Accept the Android SDK licenses when asked.

During Bubblewrap's one-time questions, use:

- Application ID: `music.xotiicduck.player`
- App name: `XotiicDuck Music`
- Launcher name: `XotiicDuck`
- Start URL: `/Xotiic-Songs/`
- Version name: `1.0.0`
- Version code: `1`
- Display mode: `standalone`
- Orientation: `any`
- Signing-key path shown by the script in your private Documents folder

Create strong, unique keystore and key passwords and save them in a password manager. Bubblewrap asks for them locally. The script does not record them.

After a successful build, the important files are placed in:

```text
android-twa\output\XotiicDuck-Music-1.0.0-signed.apk
android-twa\output\APK-SHA256.txt
android-twa\output\assetlinks.json
```

The `.aab` output is kept only in case Google Play is considered later.

## Connect the APK to the GitHub Pages website

Trusted Web Activity verification always checks the host root:

```text
https://x-s-m-x.github.io/.well-known/assetlinks.json
```

The existing project is hosted below `/Xotiic-Songs/`, so placing the file at `Xotiic-Songs/.well-known/` is not enough. Create a separate public repository named:

```text
X-S-M-X.github.io
```

Inside that repository, place the generated file at:

```text
.well-known/assetlinks.json
```

Enable GitHub Pages for that user-site repository. Then confirm the exact URL above opens as JSON without a login, redirect, or 404 response.

If a custom domain is adopted later, publish the same file at that domain's root and rebuild the wrapper for the new host.

## Install and test on Android

1. Copy the signed APK and checksum to the phone, or download them from the official HTTPS site.
2. Compare the APK's SHA-256 hash with `APK-SHA256.txt`.
3. Allow **Install unknown apps** only for the browser or file manager used to open this APK.
4. Install the APK and launch it.
5. Confirm there is no browser address bar after `assetlinks.json` is live.
6. Play a song, lock the phone, and test pause, resume, previous, and next from Android media controls.
7. Save one song offline, close the app, enable airplane mode, and confirm that saved song still plays.
8. Disable the browser or file manager's **Install unknown apps** permission again if it is no longer needed.

To install through USB debugging instead, connect a phone and run this from the generated project folder:

```powershell
npx --yes @bubblewrap/cli@1.22.7 install --apkFile="..\output\XotiicDuck-Music-1.0.0-signed.apk"
```

## Future APK updates

Normal website updates do not require a new APK. Rebuild only when the Android identity, icons, permissions, deep links, minimum Android version, or wrapper behavior changes.

Before distributing a replacement APK:

1. Increase `appVersion` and `appVersionCode` in `generated\twa-manifest.json`.
2. Run `npx --yes @bubblewrap/cli@1.22.7 update` inside `generated`.
3. Run `BUILD-ANDROID.ps1` again.
4. Sign with the original keystore.
5. Verify the new checksum and signature.
6. Install it over the previous APK to confirm Android accepts it as an update.

Losing the original signing key means the existing installed app cannot receive a normal update. It would have to be uninstalled and replaced as a different app.

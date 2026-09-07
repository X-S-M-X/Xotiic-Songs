# Update 22 validation

Checked 7 September 2026 against public repository base commit `90229344b379c6a9603efc8a13d08c797350d850`.

- Automated suite: **47/47 passed**. Includes DOM integration, queue Undo/context handling, encrypted vault checks, public field filtering, publication transfer recovery/concurrency, shared media protection, package integrity and Windows CRLF compatibility.
- Full public build: **45 public releases**, **28 excluded unreleased records**, **130 output files**, using real referenced catalog assets. Catalog counts reflect the check date.
- Manual browser checks: 320 px player/queue, 390 px console, 834 px tablet, and desktop. Release route survives reload; Settings closes through Back; queue Undo restores a removed song while keeping the queue open. Clear upcoming measured 145 px wide with 145 px content width and 44 px height at 320 px.
- Console preview: Artwork Vault, bulk tools and New release navigation loaded using a development fixture with publishing disabled.
- Six browser CI cases were authored and discovered successfully for phone, tablet and desktop. Their Playwright runner was **not executed here**. The GitHub workflow runs them before deployment of that same commit.
- No live owner authentication, private repository migration, scheduled workflow, Windows PowerShell execution or production deployment was performed.
- Audio did not complete playback in the internal preview, so audible playback is **not verified here**. Existing playback transport was retained; actual referenced MP3 files passed the public build's existence checks. Verify play, seek, next track and an offline song after deployment.
- Installed Android/PWA update delivery still needs live-device verification after Pages deploys.

Package integrity and protected-path verification are performed by `installer.cjs --verify-package` before delivery and again when the installer starts.

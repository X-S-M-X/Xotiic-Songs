# Enable the real worldwide monthly chart

The public player is safe to publish with analytics disabled. `analytics.js` starts with `enabled: false`, so the global chart stays hidden and no requests are sent until this setup is complete.

The backend in `analytics-worker/` uses a Cloudflare Worker plus D1. It has no weekly keep-alive requirement. Cloudflare runs it only when requests arrive, and the monthly cleanup runs automatically.

## What a qualified play means

The player submits one event only after a listener has actually heard at least 30 seconds, or half of a short song. The Worker then deduplicates each anonymous monthly listener by song and six-hour time bucket. It also caps accepted events from one network each day to make simple refresh spam ineffective.

The database stores the song ID, UTC month/day/bucket, and keyed hashes. It does not store a username, email address, raw IP address, precise location, lyrics, MP3, or cover.

## One-time Cloudflare setup in PowerShell

Open the existing project in VS Code, then run:

```powershell
$repo = "C:\Users\Xotii\Downloads\XotiicDuck-Music-Portable"
Set-Location "$repo\analytics-worker"
npm install
npx wrangler login
npx wrangler d1 create xotiic-song-stats
```

Cloudflare prints a `database_id`. Open `analytics-worker\wrangler.jsonc` in VS Code and replace only `PASTE_DATABASE_ID_HERE` with that ID.

Create a private random hashing secret:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)
$secret | npx wrangler secret put ANALYTICS_HASH_SECRET
$secret = $null
$bytes = $null
```

Apply the database migration and deploy:

```powershell
npx wrangler d1 migrations apply xotiic-song-stats --remote
npx wrangler deploy
```

The final command prints a URL similar to:

`https://xotiic-song-stats.YOUR-SUBDOMAIN.workers.dev`

Open `analytics.js` in the project root and change it to:

```js
window.XOTIIC_ANALYTICS = Object.freeze({
  enabled: true,
  endpoint: "https://xotiic-song-stats.YOUR-SUBDOMAIN.workers.dev",
});
```

Use the exact URL printed by Cloudflare. Do not add `/v1` to it.

Then commit the configuration:

```powershell
Set-Location $repo
git add analytics.js analytics-worker GLOBAL-CHART-SETUP.md index.html app.js sw.js
git commit -m "Enable global monthly listening chart"
git push origin main
```

## Verify it

Open this URL in a browser:

`https://xotiic-song-stats.YOUR-SUBDOMAIN.workers.dev/v1/health`

It should return JSON containing `"ok":true`. The global chart stays hidden until at least one qualified play exists. That is intentional, not a broken placeholder.

## Disable it safely

Set `enabled` back to `false` in `analytics.js` and push that single change. Local Recently Played and Your Top Tracks continue working, while global requests stop immediately.

Never commit the value of `ANALYTICS_HASH_SECRET`, `.dev.vars`, `.env`, a Cloudflare API token, or a GitHub token.

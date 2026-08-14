# Xotiic Songs global listening chart

This optional Cloudflare Worker turns the Home chart into a real worldwide monthly ranking while the main player remains on GitHub Pages.

It accepts only qualified listens produced after meaningful playback. It stores the release ID, UTC time bucket, and keyed hashes used for deduplication. Raw IP addresses, names, emails, and precise locations are not stored.

The deployment steps are kept in `GLOBAL-CHART-SETUP.md` at the project root. Never commit `.dev.vars`, `.env`, or the analytics hash secret.

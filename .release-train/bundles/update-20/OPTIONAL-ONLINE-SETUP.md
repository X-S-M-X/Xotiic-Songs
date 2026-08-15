# Optional Online Platform

Update 19 is integrated in local-only mode. It does not create accounts, submit listening history, load a global chart, or send release alerts.

The safe defaults live in `online-config.js`:

- `enabled` is `false`
- `endpoint` is empty
- every optional feature is `false`

Do not switch these values on until a real HTTPS backend has authentication, rate limits, validation, deletion controls, and a published privacy explanation. An external endpoint also requires an exact approved origin in the public page's Content Security Policy `connect-src` directive. Do not replace that directive with a wildcard.

The disabled adapter in `online-platform.js` makes a future backend replaceable without rewriting the player. It performs no automatic request. Even after configuration, a feature can contact the endpoint only when both the main switch and its individual feature switch are enabled.

Recommended future order:

1. Release alerts that use no listening history
2. Optional account-based library sync
3. Global charts only after abuse prevention and privacy review

Cloudflare, Supabase, and other hosted backends are not required for Updates 13 through 20.

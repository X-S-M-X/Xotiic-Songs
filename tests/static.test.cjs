const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("public player exposes offline, recovery, and safe update controls", () => {
  const html = read("index.html");
  for (const id of ["now-playing-offline", "offline-catalog", "library-export", "library-import", "playback-status", "update-banner"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /crossorigin="anonymous"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "public HTML IDs must be unique");
  for (const id of ["recently-played-section", "monthly-chart-section", "library-switcher", "settings-layer"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.doesNotMatch(html, /id=["']global-chart-section["']/);
});

test("service worker serves explicitly saved media with range support", () => {
  const worker = read("sw.js");
  assert.match(worker, /xotiic-media-v1/);
  assert.match(worker, /createPartialResponse/);
  assert.match(worker, /anime-theme\.css\?v=12/);
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker, /addEventListener\("install"[\s\S]{0,220}skipWaiting/);
});

test("song and playlist surfaces share synchronized play and pause state", () => {
  const app = read("app.js");
  const styles = read("styles.css");
  assert.match(app, /const syncPlaybackIndicators = \(\) =>/);
  assert.match(app, /\$\$\('\[data-track-action\]'\)/);
  assert.match(app, /\$\$\('\[data-playlist-action\]'\)/);
  assert.match(app, /const activateTrack = \(track, prepareQueue = null\) =>/);
  assert.match(app, /if \(isCurrentTrack\(track\.id\)\) \{\s*togglePlay\(\)/);
  assert.match(styles, /\.release-card\.is-current-track \.card-play/);
  assert.match(styles, /\.playlist-card\.is-current-playlist/);
});

test("anime appearance, compact library, and mobile swipe controls are wired", () => {
  const html = read("index.html");
  const app = read("app.js");
  const layout = read("layout.css");
  const anime = read("anime-theme.css");
  const theme = read("theme.js");
  assert.match(theme, /theme: "classic"/);
  assert.match(theme, /\["anime", "classic"\]/);
  assert.match(html, /role="tablist" aria-label="Library collections"/);
  assert.match(app, /const setLibraryTab =/);
  assert.match(app, /startMiniPlayerGesture/);
  assert.match(app, /skip\(dx < 0 \? 1 : -1\)/);
  assert.match(app, /const LISTENING_INSIGHTS_ENABLED = false/);
  assert.match(layout, /touch-action: pan-y/);
  assert.match(anime, /html\[data-theme="anime"\]/);
  assert.match(anime, /--current-cover-image/);
  assert.match(html, /Classic Xotiic<\/strong><small>Default dark-green interface/);
  assert.match(layout, /Keep the expanded Now Playing seek line clean/);
});

test("official Android download is separate, verified, and release-backed", () => {
  const html = read("index.html");
  const app = read("app.js");
  const styles = read("styles.css");
  const builder = read("android-twa/BUILD-ANDROID.ps1");
  const verifier = read("android-twa/VERIFY-APK.ps1");
  const publisher = read("android-twa/PUBLISH-ANDROID-RELEASE.ps1");
  assert.ok((html.match(/data-info="android"/g) || []).length >= 3);
  assert.match(html, /Install web app/);
  assert.match(app, /releases\/latest\/download\/XotiicDuck-Music-Android\.apk/);
  assert.match(app, /513cb8895ad6b8c94db08227d95b3e2a5bb0f41ecc62716527c83a89402bb32f/);
  assert.match(app, /Keep <strong>Google Play Protect<\/strong> enabled/);
  assert.match(styles, /\.android-release-card/);
  assert.match(styles, /\.android-checksum/);
  assert.match(builder, /"build", "--skipPwaValidation"/);
  assert.match(verifier, /config\.jdkPath/);
  assert.match(verifier, /Android signature verification passed/);
  assert.match(publisher, /XotiicDuck-Music-Android\.apk/);
  assert.match(publisher, /gh release create/);
  assert.doesNotMatch(html + app, /\.keystore/);
});

test("installed APK and PWA contexts hide redundant installation surfaces", () => {
  const html = read("index.html");
  const app = read("app.js");
  const styles = read("styles.css");
  const worker = read("sw.js");
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.ok((html.match(/data-install-surface/g) || []).length >= 2);
  for (const mode of ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]) {
    assert.match(app, new RegExp(`APP_DISPLAY_MODES[\\s\\S]*?${mode}`));
    assert.match(styles, new RegExp(`display-mode: ${mode}`));
  }
  assert.match(app, /android-app:\/\/music\.xotiicduck\.player/);
  assert.match(app, /sessionStorage\.setItem\(APP_CONTEXT_KEY, "android"\)/);
  assert.match(app, /app\.classList\.toggle\("app-installed", installed\)/);
  assert.match(app, /navigator\.getInstalledRelatedApps\(\)/);
  assert.match(app, /relatedApp\.id === "music\.xotiicduck\.player"/);
  assert.match(styles, /\.app-shell\.app-installed \[data-install-surface\]/);
  assert.match(styles, /\.app-shell\.app-installed \[data-info="android"\]/);
  assert.match(worker, /xotiicduck-portable-v12-2-1-installed-context/);
  assert.ok(manifest.related_applications.some((appEntry) => appEntry.platform === "play" && appEntry.id === "music.xotiicduck.player"));
  assert.ok(manifest.related_applications.some((appEntry) => appEntry.platform === "webapp"));
});

test("admin supports metadata edits, encrypted backup, and atomic updates", () => {
  const html = read("admin/index.html");
  const app = read("admin/app.js");
  const github = read("admin/github.js");
  const styles = read("admin/styles.css");
  const updateStyles = read("admin/update-12.css");
  assert.match(html, /id="edit-release-form"/);
  assert.match(html, /id="export-vault"/);
  assert.match(app, /prepareCoverFile/);
  assert.match(github, /async updateRelease/);
  assert.match(styles, /input\[type="file"\]::file-selector-button/);
  assert.match(html, /name="release-mode" value="scheduled"/);
  assert.match(html, /id="overview-scheduled"/);
  assert.match(app, /effectiveStatus/);
  assert.match(app, /releaseArchive/);
  assert.match(html, /id="release-draft-banner"/);
  for (const id of ["admin-preview-player", "admin-preview-audio", "admin-preview-progress"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /RELEASE_DRAFT_KEY/);
  assert.match(app, /restoreReleaseDraft/);
  assert.match(app, /const playCatalogPreview =/);
  assert.doesNotMatch(app, /playSelectedPreview/);
  assert.match(app, /dataset\.releasePreview/);
  assert.doesNotMatch(app.match(/const saveReleaseDraft = \(\) => \{[\s\S]*?\n  \};/)?.[0] || "", /audioFile|coverFile|token/);
  assert.match(updateStyles, /\.replacement-file-field input\[type="file"\]/);
  assert.match(updateStyles, /\.release-mode-selector label \{[\s\S]*?place-items: center;/);
  assert.match(updateStyles, /\.release-mode-selector label > span \{[\s\S]*?place-items: center;/);
  assert.match(updateStyles, /\.release-mode-selector label strong,[\s\S]*?text-align: center;/);
  assert.match(updateStyles, /\.admin-preview-player \{/);
  assert.match(html, /update-12\.css\?v=12\.1/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "admin HTML IDs must be unique");
});

test("async admin forms retain their form reference after awaited work", () => {
  const app = read("admin/app.js");
  assert.equal((app.match(/const form = event\.currentTarget;/g) || []).length, 2);
  assert.doesNotMatch(app, /event\.currentTarget\.reset\(\)/);
  assert.doesNotMatch(app, /event\.currentTarget\.querySelector\(/);
});

test("web app manifests are valid and use current versioned icons", () => {
  for (const [file, version] of [["manifest.webmanifest", "v=12"], ["admin/manifest.webmanifest", "v=12"]]) {
    const manifest = JSON.parse(read(file));
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);
    assert.ok(manifest.icons.every((icon) => icon.src.includes(version)));
    assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2);
  }
});

test("versioned HTML assets exist in both app scopes", () => {
  for (const file of ["index.html", "admin/index.html"]) {
    const html = read(file);
    const base = path.dirname(path.join(root, file));
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      if (/^(?:#|https?:|data:|mailto:|tel:|\?)/.test(reference)) continue;
      const clean = reference.split(/[?#]/)[0];
      assert.ok(fs.existsSync(path.resolve(base, clean)), `${file} references missing asset ${clean}`);
    }
  }
});

test("global analytics remains out of the active player", () => {
  const html = read("index.html");
  const app = read("app.js");
  const worker = read("sw.js");
  assert.doesNotMatch(html, /analytics\.js|workers\.dev|global-chart-section/);
  assert.doesNotMatch(app, /analyticsEndpoint|submitGlobalListen|loadGlobalChart/);
  assert.doesNotMatch(worker, /analytics\.js/);
});

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
  assert.match(worker, /anime-theme\.css\?v=20/);
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
  assert.match(app, /const LOCAL_LISTENING_TRACKING_ENABLED = true/);
  assert.match(app, /const HOME_LISTENING_SECTIONS_ENABLED = false/);
  assert.match(layout, /touch-action: pan-y/);
  assert.match(anime, /html\[data-theme="anime"\]/);
  assert.match(anime, /--current-cover-image/);
  assert.match(html, /Classic Xotiic<\/strong><small>Default dark-green interface/);
  assert.match(layout, /Keep the expanded Now Playing seek line clean/);
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
  assert.match(html, /update-12\.css\?v=20/);
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
  for (const [file, version] of [["manifest.webmanifest", "v=20"], ["admin/manifest.webmanifest", "v=20"]]) {
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

test("Updates 13 and 14 expose library discovery and playback utilities", () => {
  const html = read("index.html");
  const app = read("app.js");
  const styles = read("update-13-14.css");
  const worker = read("sw.js");
  for (const id of [
    "discover-search", "discover-type", "discover-sort", "collection-layer",
    "queue-save", "now-playing-sleep", "sleep-layer", "health-refresh",
    "track-metadata", "track-credits",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /const APP_VERSION = "20\.0\.0"/);
  assert.match(app, /const releaseCollections = \(\) =>/);
  assert.match(app, /const openQueuePlaylistEditor = \(\) =>/);
  assert.match(app, /const startSleepTimer = \(minutes\) =>/);
  assert.match(app, /\["stop", \(\) => \{ audio\.pause\(\); seekTo\(0\); \}\]/);
  assert.match(app, /navigator\.mediaSession\.setActionHandler\(action, handler\)/);
  assert.match(styles, /\.discover-toolbar/);
  assert.match(styles, /\.collection-grid/);
  assert.match(styles, /\.sleep-modal/);
  assert.match(worker, /update-13-14\.css\?v=20/);
});

test("artist console supports Update 13 catalog metadata", () => {
  const html = read("admin/index.html");
  const app = read("admin/app.js");
  const github = read("admin/github.js");
  const worker = read("admin/sw.js");
  const styles = read("admin/update-13-14.css");
  for (const prefix of ["release", "edit"]) {
    for (const suffix of ["collection", "track-number", "franchise", "mood", "tags", "credits", "explicit"]) {
      assert.match(html, new RegExp(`id=["']${prefix}-${suffix}["']`));
    }
  }
  assert.match(app, /releaseType/);
  assert.match(app, /parseTags/);
  assert.match(github, /const CATALOG_VERSION = 3/);
  assert.match(worker, /xotiic-upload-v20/);
  assert.match(worker, /update-13-14\.css\?v=20/);
  assert.match(styles, /\.release-mode-selector label \{[\s\S]*?place-items: center;[\s\S]*?text-align: center;/);
  assert.match(styles, /\.release-mode-selector label strong,[\s\S]*?text-align: center;/);
});

test("Update 14 deliberately omits sound-processing controls", () => {
  const combined = [read("index.html"), read("app.js"), read("update-13-14.css")].join("\n");
  assert.doesNotMatch(combined, /equalizer|crossfade|loudness normalization|audio worklet|createMediaElementSource/i);
});

test("Updates 15 and 16 add Creator Studio and resilient offline downloads", () => {
  const html = read("index.html");
  const manager = read("download-manager.js");
  const offline = read("offline.js");
  const adminHtml = read("admin/index.html");
  const studio = read("admin/studio.js");
  const adminManifest = JSON.parse(read("admin/manifest.webmanifest"));
  const adminWorker = read("admin/sw.js");
  for (const id of ["download-manager", "download-manager-pause", "download-data-saver", "download-wifi-only", "collection-detail-offline", "playlist-detail-offline"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(manager, /AbortController/);
  assert.match(manager, /navigator\.connection/);
  assert.match(offline, /\{ signal \} = \{\}/);
  for (const id of ["creator-studio-tools", "bulk-audio-input", "studio-apply-album", "workspace-list", "release-preflight", "release-calendar"]) {
    assert.match(adminHtml, new RegExp(`id=["']${id}["']`));
  }
  assert.match(studio, /const readId3 = async/);
  assert.match(studio, /const captureWorkspace =/);
  assert.ok(adminManifest.share_target);
  assert.ok(Array.isArray(adminManifest.file_handlers));
  assert.match(adminWorker, /storeSharedFiles/);
});

test("Updates 17 and 18 add private discovery and offline integrity tools", () => {
  const html = read("index.html");
  const app = read("app.js");
  const discovery = read("discovery.js");
  const storage = read("storage-tools.js");
  const offline = read("offline.js");
  const worker = read("sw.js");
  const adminHtml = read("admin/index.html");
  const adminApp = read("admin/app.js");
  for (const id of ["library-tab-for-you", "library-panel-for-you", "for-you-content", "health-integrity", "health-verify", "health-cleanup", "health-persist"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(discovery, /const createMixes =/);
  assert.match(discovery, /More like/);
  assert.match(discovery, /XOTIIC RECAP/);
  assert.match(app, /const LOCAL_LISTENING_TRACKING_ENABLED = true/);
  assert.match(app, /const HOME_LISTENING_SECTIONS_ENABLED = false/);
  assert.match(storage, /offline\.audit/);
  assert.match(storage, /offline\.cleanup/);
  assert.match(offline, /const MANIFEST_KEY/);
  assert.match(offline, /const audit = async/);
  assert.match(offline, /const cleanup = async/);
  assert.match(offline, /SHA-256/);
  assert.match(worker, /update-17-18\.css\?v=20/);
  for (const prefix of ["release", "edit"]) {
    for (const suffix of ["character", "energy", "vocal-style", "performance", "similar"]) {
      assert.match(adminHtml, new RegExp(`id=["']${prefix}-${suffix}["']`));
    }
  }
  assert.match(adminApp, /similarReleaseIds/);
});

test("Updates 19 and 20 keep online services optional and prepare connected devices", () => {
  const html = read("index.html");
  const config = read("online-config.js");
  const platform = read("online-platform.js");
  const devices = read("connected-devices.js");
  const worker = read("sw.js");
  const wrapper = JSON.parse(read("android-twa/wrapper-values.json"));
  const assetLinks = read("android-twa/assetlinks.template.json");
  for (const id of ["online-platform-card", "online-platform-status", "now-playing-devices", "devices-layer", "device-picker-button", "device-copy-link"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(config, /enabled: false/);
  assert.match(config, /endpoint: ""/);
  assert.doesNotMatch(platform, /request\([^)]*\)[\s\S]*?\.then\(/);
  assert.match(devices, /remote\.prompt/);
  assert.match(devices, /webkitShowPlaybackTargetPicker/);
  assert.match(devices, /watchAvailability/);
  assert.match(worker, /update-19-20\.css\?v=20/);
  assert.match(worker, /connected-devices\.js\?v=20/);
  assert.equal(wrapper.status, "preparation-only");
  assert.equal(wrapper.signingKeyIncluded, false);
  assert.match(assetLinks, /REPLACE_WITH_THE_REAL_SIGNING_CERTIFICATE/);
  assert.ok(!fs.existsSync(path.join(root, ".well-known", "assetlinks.json")), "a placeholder asset link must not be published live");
});

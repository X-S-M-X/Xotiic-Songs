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
  for (const id of ["recently-played-section", "monthly-chart-section", "global-chart-section"]) assert.match(html, new RegExp(`id=["']${id}["']`));
});

test("service worker serves explicitly saved media with range support", () => {
  const worker = read("sw.js");
  assert.match(worker, /xotiic-media-v1/);
  assert.match(worker, /createPartialResponse/);
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

test("admin supports metadata edits, encrypted backup, and atomic updates", () => {
  const html = read("admin/index.html");
  const app = read("admin/app.js");
  const github = read("admin/github.js");
  const styles = read("admin/styles.css");
  assert.match(html, /id="edit-release-form"/);
  assert.match(html, /id="export-vault"/);
  assert.match(app, /prepareCoverFile/);
  assert.match(github, /async updateRelease/);
  assert.match(styles, /input\[type="file"\]::file-selector-button/);
  assert.match(html, /name="release-mode" value="scheduled"/);
  assert.match(html, /id="overview-scheduled"/);
  assert.match(app, /effectiveStatus/);
  assert.match(app, /releaseArchive/);
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
  for (const [file, version] of [["manifest.webmanifest", "v=11"], ["admin/manifest.webmanifest", "v=11"]]) {
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

test("optional global chart is private by default and backed by a guarded Worker", () => {
  const config = read("analytics.js");
  const worker = read("analytics-worker/src/index.js");
  const schema = read("analytics-worker/migrations/0001_initial.sql");
  assert.match(config, /enabled: false/);
  assert.match(worker, /originAllowed/);
  assert.match(worker, /ANALYTICS_HASH_SECRET/);
  assert.match(worker, /INSERT OR IGNORE INTO qualified_listens/);
  assert.doesNotMatch(schema, /raw_ip|ip_address/i);
});

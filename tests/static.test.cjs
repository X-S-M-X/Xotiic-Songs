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
});

test("service worker serves explicitly saved media with range support", () => {
  const worker = read("sw.js");
  assert.match(worker, /xotiic-media-v1/);
  assert.match(worker, /createPartialResponse/);
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker, /addEventListener\("install"[\s\S]{0,220}skipWaiting/);
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
});

test("async admin forms retain their form reference after awaited work", () => {
  const app = read("admin/app.js");
  assert.equal((app.match(/const form = event\.currentTarget;/g) || []).length, 2);
  assert.doesNotMatch(app, /event\.currentTarget\.reset\(\)/);
  assert.doesNotMatch(app, /event\.currentTarget\.querySelector\(/);
});

test("web app manifests are valid and use current versioned icons", () => {
  for (const [file, version] of [["manifest.webmanifest", "v=9"], ["admin/manifest.webmanifest", "v=10"]]) {
    const manifest = JSON.parse(read(file));
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);
    assert.ok(manifest.icons.every((icon) => icon.src.includes(version)));
    assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2);
  }
});

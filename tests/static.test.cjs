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
  assert.match(html, /id="edit-release-form"/);
  assert.match(html, /id="export-vault"/);
  assert.match(app, /prepareCoverFile/);
  assert.match(github, /async updateRelease/);
});

test("web app manifests are valid and use version 9 icons", () => {
  for (const file of ["manifest.webmanifest", "admin/manifest.webmanifest"]) {
    const manifest = JSON.parse(read(file));
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);
    assert.ok(manifest.icons.every((icon) => icon.src.includes("v=9")));
    assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2);
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseCatalog, formatCatalog, GitHubError } = require("../admin/github.js");

test("catalog format round-trips release metadata", () => {
  const releases = [{ id: "test-song", title: "Test Song", youtubeUrl: "https://youtu.be/example", status: "scheduled", releaseAt: "2026-08-20T08:00:00.000Z" }];
  const formatted = formatCatalog(releases);
  assert.match(formatted, /XOTIICDUCK_CATALOG_VERSION = 2/);
  assert.deepEqual(parseCatalog(formatted), releases);
});

test("live catalog has stable unique IDs and supported release states", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../catalog.js"), "utf8");
  const releases = parseCatalog(source);
  const ids = releases.map((release) => release.id);
  assert.equal(new Set(ids).size, ids.length, "release IDs must stay unique");
  for (const release of releases) {
    assert.match(release.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(["published", "scheduled", "draft", "archived"].includes(release.status));
    if (release.status === "scheduled") assert.ok(Number.isFinite(Date.parse(release.releaseAt)));
  }
});

test("catalog parser rejects executable or malformed input", () => {
  assert.throws(() => parseCatalog("window.XOTIICDUCK_RELEASES = alert(1);"), GitHubError);
  assert.throws(() => parseCatalog("const releases = [];"), GitHubError);
});

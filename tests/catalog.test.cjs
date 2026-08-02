const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCatalog, formatCatalog, GitHubError } = require("../admin/github.js");

test("catalog format round-trips release metadata", () => {
  const releases = [{ id: "test-song", title: "Test Song", youtubeUrl: "https://youtu.be/example", status: "draft" }];
  assert.deepEqual(parseCatalog(formatCatalog(releases)), releases);
});

test("catalog parser rejects executable or malformed input", () => {
  assert.throws(() => parseCatalog("window.XOTIICDUCK_RELEASES = alert(1);"), GitHubError);
  assert.throws(() => parseCatalog("const releases = [];"), GitHubError);
});

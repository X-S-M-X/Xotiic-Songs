const test = require("node:test");
const assert = require("node:assert/strict");
const { parseByteRange, createPartialResponse } = require("../range.js");

test("parses normal, open-ended, and suffix byte ranges", () => {
  assert.deepEqual(parseByteRange("bytes=2-5", 10), { start: 2, end: 5, length: 4 });
  assert.deepEqual(parseByteRange("bytes=7-", 10), { start: 7, end: 9, length: 3 });
  assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9, length: 3 });
});

test("rejects malformed and unsatisfiable byte ranges", () => {
  assert.equal(parseByteRange("items=0-2", 10), null);
  assert.equal(parseByteRange("bytes=12-14", 10), null);
  assert.equal(parseByteRange("bytes=5-2", 10), null);
});

test("creates a seekable partial response from a complete cached file", async () => {
  const request = new Request("https://example.test/music/song.mp3", { headers: { Range: "bytes=2-5" } });
  const complete = new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  const partial = await createPartialResponse(request, complete);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-5/8");
  assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())], [2, 3, 4, 5]);
});

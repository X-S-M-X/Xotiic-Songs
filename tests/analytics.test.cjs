const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const loadWorker = async () => (await import(pathToFileURL(path.resolve(__dirname, "../analytics-worker/src/index.js")))).default;

const fakeDatabase = () => ({
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async first() { return { count: 0 }; },
          async run() { return { success: true, meta: { changes: 1 }, sql, values }; },
          async all() { return { success: true, results: [{ trackId: "test-song", plays: 7 }] }; },
        };
      },
      async run() { return { success: true, meta: { changes: 0 } }; },
    };
  },
});

test("global analytics rejects foreign origins", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("https://stats.example/v1/listens", {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ trackId: "test-song", listenerId: "abcdefghijklmnopqrstuvwx" }),
  }), { DB: fakeDatabase(), ALLOWED_ORIGIN: "https://x-s-m-x.github.io", ANALYTICS_HASH_SECRET: "a-secure-test-secret-that-is-long-enough" });
  assert.equal(response.status, 403);
});

test("global analytics accepts a qualified anonymous listen and returns charts", async () => {
  const worker = await loadWorker();
  const env = { DB: fakeDatabase(), ALLOWED_ORIGIN: "https://x-s-m-x.github.io", ANALYTICS_HASH_SECRET: "a-secure-test-secret-that-is-long-enough" };
  const accepted = await worker.fetch(new Request("https://stats.example/v1/listens", {
    method: "POST",
    headers: { Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.10" },
    body: JSON.stringify({ trackId: "test-song", listenerId: "abcdefghijklmnopqrstuvwx" }),
  }), env);
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).counted, true);

  const chart = await worker.fetch(new Request("https://stats.example/v1/charts/monthly?limit=5", { headers: { Origin: env.ALLOWED_ORIGIN } }), env);
  assert.equal(chart.status, 200);
  assert.deepEqual((await chart.json()).tracks, [{ trackId: "test-song", plays: 7 }]);
});

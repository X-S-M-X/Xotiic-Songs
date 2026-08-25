const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "theme.js"), "utf8");

const loadTheme = (saved = null) => {
  const properties = new Map();
  const storage = new Map(saved ? [["xotiicduck-appearance-v1", JSON.stringify(saved)]] : []);
  const root = {
    dataset: {},
    style: { setProperty: (name, value) => properties.set(name, value) },
  };
  const meta = { setAttribute: (name, value) => { meta[name] = value; } };
  const window = { dispatchEvent: () => undefined };
  const context = vm.createContext({
    window,
    document: {
      documentElement: root,
      querySelector: (selector) => selector === 'meta[name="theme-color"]' ? meta : null,
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options?.detail; }
    },
  });
  vm.runInContext(source, context);
  return { api: window.XotiicAppearance, properties, root, storage };
};

test("classic black and green remains the appearance default", () => {
  const { api, root } = loadTheme();
  assert.equal(api.current.theme, "classic");
  assert.equal(api.current.accent, "pulse");
  assert.equal(root.dataset.theme, "classic");
});

test("custom anime colours are sanitized, applied, and persisted", () => {
  const { api, properties, root, storage } = loadTheme();
  const applied = api.apply({
    theme: "anime",
    accent: "custom",
    motion: "reduced",
    primary: "#112233",
    secondary: "#aabbcc",
  }, { persist: true });

  assert.equal(applied.primary, "#112233");
  assert.equal(applied.secondary, "#aabbcc");
  assert.equal(root.dataset.accent, "custom");
  assert.equal(properties.get("--anime-custom-main"), "#112233");
  assert.equal(properties.get("--anime-custom-main-rgb"), "17, 34, 51");
  assert.equal(properties.get("--anime-custom-second-rgb"), "170, 187, 204");
  assert.equal(properties.get("--anime-custom-on"), "#ffffff");
  assert.equal(JSON.parse(storage.get(api.STORAGE_KEY)).accent, "custom");
});

test("invalid saved colours return to safe palette values", () => {
  const { api } = loadTheme({
    theme: "anime",
    accent: "custom",
    motion: "full",
    primary: "not-a-colour",
    secondary: "#123",
  });
  assert.equal(api.current.primary, api.defaults.primary);
  assert.equal(api.current.secondary, api.defaults.secondary);
});

const CACHE_NAME = "xotiicduck-portable-v5";
const scoped = (file) => new URL(file, self.registration.scope).href;
const CATALOG_URL = scoped("./catalog.js");
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=5",
  "./catalog.js",
  "./app.js?v=5",
  "./manifest.webmanifest?v=5",
  "./favicon.svg?v=5",
  "./apple-touch-icon.png?v=5",
  "./icon-192.png?v=5",
  "./icon-512.png?v=5",
  "./icon-maskable-192.png?v=5",
  "./icon-maskable-512.png?v=5",
].map(scoped);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("xotiicduck-portable-") && key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.headers.has("range")) return;

  if (url.href.split("?")[0] === CATALOG_URL) {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" }))
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(CATALOG_URL, response.clone()));
          return response;
        })
        .catch(() => caches.match(CATALOG_URL))
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(scoped("./index.html"))));
    return;
  }

  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

importScripts("./range.js?v=18");

const CACHE_NAME = "xotiicduck-portable-v18-1-discover-queue-hotfix";
const MEDIA_CACHE = "xotiic-media-v1";
const scoped = (file) => new URL(file, self.registration.scope).href;
const CATALOG_URL = scoped("./catalog.js");
const SHELL = [
  "./",
  "./index.html",
  "./theme.js?v=18",
  "./styles.css?v=18.1",
  "./player-hotfix.css?v=1",
  "./layout.css?v=18",
  "./anime-theme.css?v=18",
  "./update-13-14.css?v=18",
  "./update-15-16.css?v=18",
  "./update-17-18.css?v=18",
  "./catalog.js",
  "./range.js?v=18",
  "./offline.js?v=18",
  "./app.js?v=18.1",
  "./download-manager.js?v=18",
  "./discovery.js?v=18",
  "./storage-tools.js?v=18",
  "./manifest.webmanifest?v=18",
  "./favicon.svg?v=18",
  "./apple-touch-icon.png?v=18",
  "./icon-192.png?v=18",
  "./icon-512.png?v=18",
  "./icon-maskable-192.png?v=18",
  "./icon-maskable-512.png?v=18",
].map(scoped);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("xotiicduck-portable-") && key !== CACHE_NAME).map((key) => caches.delete(key))
    )),
    self.clients.claim(),
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET") return;

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

  const isAudio = url.origin === self.location.origin && /\/music\/[^/]+\.mp3$/i.test(url.pathname);
  const isCover = url.origin === self.location.origin && /\/covers\/[^/]+\.(?:jpe?g|png|webp)$/i.test(url.pathname);
  if (isAudio || isCover) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const cached = await cache.match(url.href);
      if (cached && request.headers.has("range")) return self.XotiicRange.createPartialResponse(request, cached);
      if (cached) return cached;
      return fetch(request);
    })());
    return;
  }

  if (request.headers.has("range")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(scoped("./index.html"))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

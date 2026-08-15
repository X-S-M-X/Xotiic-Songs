importScripts("./range.js?v=12");

const CACHE_NAME = "xotiicduck-portable-v12-2-1-installed-context";
const MEDIA_CACHE = "xotiic-media-v1";
const scoped = (file) => new URL(file, self.registration.scope).href;
const CATALOG_URL = scoped("./catalog.js");
const SHELL = [
  "./",
  "./index.html",
  "./theme.js?v=12.1",
  "./styles.css?v=12.2.1",
  "./player-hotfix.css?v=1",
  "./layout.css?v=12.2",
  "./anime-theme.css?v=12",
  "./catalog.js",
  "./range.js?v=12",
  "./offline.js?v=12",
  "./app.js?v=12.2.1",
  "./manifest.webmanifest?v=12.2.1",
  "./favicon.svg?v=12",
  "./apple-touch-icon.png?v=12",
  "./icon-192.png?v=12",
  "./icon-512.png?v=12",
  "./icon-maskable-192.png?v=12",
  "./icon-maskable-512.png?v=12",
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

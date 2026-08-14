const CACHE_NAME = "xotiic-upload-v11";
const scoped = (file) => new URL(file, self.registration.scope).href;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=11",
  "./config.js?v=11",
  "./crypto.js?v=11",
  "./github.js?v=11",
  "./app.js?v=11",
  "./manifest.webmanifest?v=11",
  "../favicon.svg?v=11",
  "../apple-touch-icon.png?v=11",
  "../icon-192.png?v=11",
  "../icon-512.png?v=11",
  "../icon-maskable-192.png?v=11",
  "../icon-maskable-512.png?v=11"
].map(scoped);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("xotiic-upload-") && key !== CACHE_NAME).map((key) => caches.delete(key))
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
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(scoped("./index.html"))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

const CACHE_NAME = "xotiic-upload-v5";
const scoped = (file) => new URL(file, self.registration.scope).href;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=5",
  "./config.js?v=5",
  "./crypto.js?v=5",
  "./github.js?v=5",
  "./app.js?v=5",
  "./manifest.webmanifest?v=5",
  "../favicon.svg?v=5",
  "../apple-touch-icon.png?v=5",
  "../icon-192.png?v=5",
  "../icon-512.png?v=5",
  "../icon-maskable-192.png?v=5",
  "../icon-maskable-512.png?v=5"
].map(scoped);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("xotiic-upload-") && key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
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

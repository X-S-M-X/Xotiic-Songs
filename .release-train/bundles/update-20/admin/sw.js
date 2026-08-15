const CACHE_NAME = "xotiic-upload-v20";
const SHARED_DB = "xotiic-upload-share-inbox-v1";
const SHARED_STORE = "files";
const scoped = (file) => new URL(file, self.registration.scope).href;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20",
  "./update-12.css?v=20",
  "./update-13-14.css?v=20",
  "./update-15-16.css?v=20",
  "./config.js?v=20",
  "./crypto.js?v=20",
  "./github.js?v=20",
  "./app.js?v=20",
  "./studio.js?v=20",
  "./manifest.webmanifest?v=20",
  "../favicon.svg?v=20",
  "../apple-touch-icon.png?v=20",
  "../icon-192.png?v=20",
  "../icon-512.png?v=20",
  "../icon-maskable-192.png?v=20",
  "../icon-maskable-512.png?v=20"
].map(scoped);

const openSharedDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(SHARED_DB, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(SHARED_STORE)) request.result.createObjectStore(SHARED_STORE, { keyPath: "id", autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const storeSharedFiles = async (files) => {
  const db = await openSharedDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARED_STORE, "readwrite");
    const store = transaction.objectStore(SHARED_STORE);
    files.forEach((file) => store.add({ file, receivedAt: Date.now() }));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

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
  if (request.method === "POST" && url.origin === self.location.origin && url.pathname.endsWith("/admin/share-target")) {
    event.respondWith((async () => {
      try {
        const form = await request.formData();
        const files = [...form.getAll("audio"), ...form.getAll("cover")].filter((item) => item instanceof Blob && item.size > 0);
        if (files.length) await storeSharedFiles(files);
        return Response.redirect(scoped("./?panel=upload&shared=1"), 303);
      } catch {
        return Response.redirect(scoped("./?panel=upload&shared=error"), 303);
      }
    })());
    return;
  }
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(scoped("./index.html"))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

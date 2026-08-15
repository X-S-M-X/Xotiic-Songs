(() => {
  "use strict";

  const CACHE_NAME = "xotiic-media-v1";
  const INDEX_KEY = "xotiicduck-offline-tracks-v1";

  const absoluteUrl = (value) => new URL(value, location.href).href;
  const deleteAssetVariants = async (cache, value, keep = "") => {
    const target = new URL(value, location.href);
    const keepUrl = keep ? new URL(keep, location.href).href : "";
    const keys = await cache.keys();
    await Promise.all(keys.map((request) => {
      const candidate = new URL(request.url);
      return candidate.origin === target.origin && candidate.pathname === target.pathname && request.url !== keepUrl
        ? cache.delete(request)
        : Promise.resolve(false);
    }));
  };

  const readIndex = () => {
    try {
      const value = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
      return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string"))] : [];
    } catch {
      return [];
    }
  };

  const writeIndex = (ids) => {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)])); } catch { /* Cache playback still works. */ }
  };

  const progress = (callback, phase, ratio, loaded = 0, total = 0) => {
    callback?.({ phase, ratio: Math.max(0, Math.min(1, ratio)), loaded, total });
  };

  const fetchWholeResponse = async (url, callback, start, span, phase, signal) => {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`Download failed with status ${response.status}.`);
    const expected = Number(response.headers.get("content-length")) || 0;
    let blob;

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        const fraction = expected ? loaded / expected : Math.min(0.92, loaded / (8 * 1024 * 1024));
        progress(callback, phase, start + fraction * span, loaded, expected);
      }
      blob = new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
    } else {
      blob = await response.blob();
    }

    const headers = new Headers(response.headers);
    headers.delete("content-range");
    headers.set("content-length", String(blob.size));
    headers.set("accept-ranges", "bytes");
    progress(callback, phase, start + span, blob.size, expected || blob.size);
    return new Response(blob, { status: 200, statusText: "OK", headers });
  };

  const supported = () => "caches" in globalThis && typeof fetch === "function";

  const requestPersistence = async () => {
    if (!navigator.storage?.persist) return false;
    try { return await navigator.storage.persist(); } catch { return false; }
  };

  const isDownloaded = async (track) => {
    if (!supported() || !track?.audio || !track?.cover) return false;
    const cache = await caches.open(CACHE_NAME);
    const [audio, cover] = await Promise.all([
      cache.match(absoluteUrl(track.audio)),
      cache.match(absoluteUrl(track.cover)),
    ]);
    return Boolean(audio && cover);
  };

  const reconcile = async (tracks) => {
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const valid = [];
    for (const id of readIndex()) {
      const track = byId.get(id);
      if (track && await isDownloaded(track)) valid.push(id);
    }
    writeIndex(valid);
    return valid;
  };

  const save = async (track, callback, { signal } = {}) => {
    if (!supported()) throw new Error("Offline storage is unavailable in this browser.");
    if (!track?.id || !track.audio || !track.cover) throw new Error("This release is missing its offline files.");
    await requestPersistence();
    const cache = await caches.open(CACHE_NAME);
    const audioUrl = absoluteUrl(track.audio);
    const coverUrl = absoluteUrl(track.cover);
    try {
      progress(callback, "audio", 0);
      const audioResponse = await fetchWholeResponse(audioUrl, callback, 0, 0.9, "audio", signal);
      await cache.put(audioUrl, audioResponse);
      const coverResponse = await fetchWholeResponse(coverUrl, callback, 0.9, 0.1, "cover", signal);
      await cache.put(coverUrl, coverResponse);
      await Promise.all([
        deleteAssetVariants(cache, audioUrl, audioUrl),
        deleteAssetVariants(cache, coverUrl, coverUrl),
      ]);
      writeIndex([...readIndex(), track.id]);
      progress(callback, "complete", 1);
      return estimate();
    } catch (error) {
      await Promise.allSettled([cache.delete(audioUrl), cache.delete(coverUrl)]);
      writeIndex(readIndex().filter((id) => id !== track.id));
      throw error;
    }
  };

  const remove = async (track) => {
    if (!supported() || !track) return;
    const cache = await caches.open(CACHE_NAME);
    await Promise.all([
      deleteAssetVariants(cache, absoluteUrl(track.audio)),
      deleteAssetVariants(cache, absoluteUrl(track.cover)),
    ]);
    writeIndex(readIndex().filter((id) => id !== track.id));
  };

  const estimate = async () => {
    if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
    try {
      const value = await navigator.storage.estimate();
      return { usage: Number(value.usage) || 0, quota: Number(value.quota) || 0 };
    } catch {
      return { usage: 0, quota: 0 };
    }
  };

  globalThis.XotiicOffline = Object.freeze({
    CACHE_NAME,
    INDEX_KEY,
    supported,
    readIndex,
    reconcile,
    isDownloaded,
    save,
    remove,
    estimate,
    requestPersistence,
  });
})();

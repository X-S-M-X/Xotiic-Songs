(() => {
  "use strict";

  const CACHE_NAME = "xotiic-media-v1";
  const INDEX_KEY = "xotiicduck-offline-tracks-v1";
  const MANIFEST_KEY = "xotiicduck-offline-integrity-v1";

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

  const readManifest = () => {
    try {
      const value = JSON.parse(localStorage.getItem(MANIFEST_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };

  const writeManifest = (value) => {
    try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(value)); } catch { /* Integrity details are optional. */ }
  };

  const digestBlob = async (blob) => {
    if (!globalThis.crypto?.subtle?.digest || !blob || blob.size > 64 * 1024 * 1024) return "";
    try {
      const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
      return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  };

  const responseRecord = async (response, url, { deep = true } = {}) => {
    if (!response) return null;
    const blob = await response.clone().blob();
    return {
      url,
      bytes: blob.size,
      type: blob.type || response.headers.get("content-type") || "application/octet-stream",
      sha256: deep ? await digestBlob(blob) : "",
    };
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
    const manifest = readManifest();
    for (const id of Object.keys(manifest)) if (!valid.includes(id)) delete manifest[id];
    writeManifest(manifest);
    return valid;
  };

  const save = async (track, callback, { signal } = {}) => {
    if (!supported()) throw new Error("Offline storage is unavailable in this browser.");
    if (!track?.id || !track.audio || !track.cover) throw new Error("This release is missing its offline files.");
    await requestPersistence();
    const cache = await caches.open(CACHE_NAME);
    const audioUrl = absoluteUrl(track.audio);
    const coverUrl = absoluteUrl(track.cover);
    const previousAudio = await cache.match(audioUrl);
    const previousCover = await cache.match(coverUrl);
    const wasIndexed = readIndex().includes(track.id);
    let committing = false;
    try {
      progress(callback, "audio", 0);
      const audioResponse = await fetchWholeResponse(audioUrl, callback, 0, 0.9, "audio", signal);
      const coverResponse = await fetchWholeResponse(coverUrl, callback, 0.9, 0.1, "cover", signal);
      const [audioRecord, coverRecord] = await Promise.all([
        responseRecord(audioResponse, audioUrl),
        responseRecord(coverResponse, coverUrl),
      ]);
      committing = true;
      await cache.put(audioUrl, audioResponse);
      await cache.put(coverUrl, coverResponse);
      await Promise.all([
        deleteAssetVariants(cache, audioUrl, audioUrl),
        deleteAssetVariants(cache, coverUrl, coverUrl),
      ]);
      const manifest = readManifest();
      manifest[track.id] = { audio: audioRecord, cover: coverRecord, savedAt: new Date().toISOString() };
      writeManifest(manifest);
      writeIndex([...readIndex(), track.id]);
      progress(callback, "complete", 1);
      return estimate();
    } catch (error) {
      if (committing) {
        await Promise.allSettled([
          previousAudio ? cache.put(audioUrl, previousAudio) : cache.delete(audioUrl),
          previousCover ? cache.put(coverUrl, previousCover) : cache.delete(coverUrl),
        ]);
      }
      if (!wasIndexed) {
        const manifest = readManifest();
        delete manifest[track.id];
        writeManifest(manifest);
        writeIndex(readIndex().filter((id) => id !== track.id));
      }
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
    const manifest = readManifest();
    delete manifest[track.id];
    writeManifest(manifest);
  };

  const audit = async (tracks, { deep = false } = {}) => {
    if (!supported()) return { checked: 0, healthy: 0, damaged: 0, entries: [] };
    const cache = await caches.open(CACHE_NAME);
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const manifest = readManifest();
    const entries = [];
    for (const id of readIndex()) {
      const track = byId.get(id);
      if (!track) {
        entries.push({ id, status: "orphaned", reason: "Release no longer exists" });
        continue;
      }
      const audioUrl = absoluteUrl(track.audio);
      const coverUrl = absoluteUrl(track.cover);
      const [audioResponse, coverResponse] = await Promise.all([cache.match(audioUrl), cache.match(coverUrl)]);
      if (!audioResponse || !coverResponse) {
        entries.push({ id, status: "damaged", reason: !audioResponse ? "MP3 missing" : "Cover missing" });
        continue;
      }
      const record = manifest[id];
      const [audioInfo, coverInfo] = await Promise.all([
        responseRecord(audioResponse, audioUrl, { deep }),
        responseRecord(coverResponse, coverUrl, { deep }),
      ]);
      const sizeMismatch = Boolean(record?.audio?.bytes && record.audio.bytes !== audioInfo.bytes)
        || Boolean(record?.cover?.bytes && record.cover.bytes !== coverInfo.bytes);
      const hashMismatch = deep && (Boolean(record?.audio?.sha256 && audioInfo.sha256 && record.audio.sha256 !== audioInfo.sha256)
        || Boolean(record?.cover?.sha256 && coverInfo.sha256 && record.cover.sha256 !== coverInfo.sha256));
      if (sizeMismatch || hashMismatch) entries.push({ id, status: "damaged", reason: hashMismatch ? "Checksum mismatch" : "File size mismatch" });
      else entries.push({ id, status: "healthy", reason: deep ? "Checksums verified" : "Files present" });
    }
    return {
      checked: entries.length,
      healthy: entries.filter((entry) => entry.status === "healthy").length,
      damaged: entries.filter((entry) => entry.status !== "healthy").length,
      entries,
    };
  };

  const cleanup = async (tracks) => {
    if (!supported()) return { removed: 0, bytes: 0, valid: [] };
    const cache = await caches.open(CACHE_NAME);
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const validIds = [];
    const keepUrls = new Set();
    for (const id of readIndex()) {
      const track = byId.get(id);
      if (!track || !await isDownloaded(track)) continue;
      validIds.push(id);
      keepUrls.add(absoluteUrl(track.audio));
      keepUrls.add(absoluteUrl(track.cover));
    }
    let removed = 0;
    let bytes = 0;
    for (const request of await cache.keys()) {
      if (keepUrls.has(request.url)) continue;
      const response = await cache.match(request);
      bytes += Number(response?.headers.get("content-length")) || 0;
      if (await cache.delete(request)) removed += 1;
    }
    writeIndex(validIds);
    const manifest = readManifest();
    for (const id of Object.keys(manifest)) if (!validIds.includes(id)) delete manifest[id];
    writeManifest(manifest);
    return { removed, bytes, valid: validIds };
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
    MANIFEST_KEY,
    supported,
    readIndex,
    reconcile,
    isDownloaded,
    save,
    remove,
    estimate,
    requestPersistence,
    audit,
    cleanup,
    readManifest,
  });
})();

(() => {
  "use strict";

  const player = globalThis.XotiicPlayer;
  const root = document.querySelector("#download-manager");
  if (!player || !root) return;

  const QUEUE_KEY = "xotiicduck-download-queue-v1";
  const PREFS_KEY = "xotiicduck-download-preferences-v1";
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let queue = [];
  let paused = false;
  let running = false;
  let controller = null;
  let promptedForMeteredBatch = false;
  let prefs = { respectDataSaver: true, wifiOnly: false };

  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    prefs = {
      respectDataSaver: stored.respectDataSaver !== false,
      wifiOnly: stored.wifiOnly === true,
    };
  } catch { /* Defaults remain active. */ }

  try {
    const stored = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    if (Array.isArray(stored)) {
      queue = stored
        .filter((job) => typeof job?.id === "string")
        .map((job) => ({ id: job.id, label: String(job.label || "Offline collection").slice(0, 100), status: ["done", "error"].includes(job.status) ? job.status : "pending", progress: job.status === "done" ? 1 : 0, error: String(job.error || "").slice(0, 180) }));
    }
  } catch { queue = []; }

  const tracksById = () => new Map(player.getTracks().map((track) => [track.id, track]));
  const saveQueue = () => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.map(({ id, label, status, error }) => ({ id, label, status, error }))));
    } catch { /* The active queue still works for this visit. */ }
  };
  const savePrefs = () => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* Preferences remain active for this visit. */ }
  };
  const connection = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const connectionLabel = () => {
    const info = connection();
    if (!navigator.onLine) return "Offline";
    if (!info) return "Connection type unavailable";
    return info.type || info.effectiveType || "Online";
  };

  const render = () => {
    const map = tracksById();
    const pending = queue.filter((job) => job.status === "pending" || job.status === "downloading").length;
    const failed = queue.filter((job) => job.status === "error").length;
    const done = queue.filter((job) => job.status === "done").length;
    $("#download-manager-state").textContent = running ? `Downloading · ${pending} left` : paused ? `Paused · ${pending} waiting` : failed ? `${failed} failed` : done ? `${done} complete` : "Ready";
    $("#download-manager-queue").innerHTML = queue.length
      ? queue.map((job) => {
          const track = map.get(job.id);
          const percent = Math.max(0, Math.min(100, Math.round((job.progress || 0) * 100)));
          return `<article class="download-job ${escapeHtml(job.status)}"><div><strong>${escapeHtml(track?.title || job.id)}</strong><small>${escapeHtml(job.label)} · ${job.status === "error" ? escapeHtml(job.error || "Download failed") : job.status === "done" ? "Saved offline" : job.status === "downloading" ? `${percent}%` : "Waiting"}</small></div><span aria-hidden="true"><i style="width:${percent}%"></i></span><button type="button" data-download-remove="${escapeHtml(job.id)}" aria-label="Remove ${escapeHtml(track?.title || job.id)} from this download queue">×</button></article>`;
        }).join("")
      : `<p class="download-manager-empty">Open an album or playlist and choose <strong>Save offline</strong>.</p>`;
    $("#download-manager-pause").textContent = paused ? "Resume" : "Pause";
    $("#download-manager-pause").disabled = !queue.some((job) => ["pending", "downloading"].includes(job.status));
    $("#download-manager-retry").disabled = failed === 0;
    $("#download-manager-clear").disabled = done === 0;
    $("#download-data-saver").checked = prefs.respectDataSaver;
    $("#download-wifi-only").checked = prefs.wifiOnly;
    root.dataset.connection = connectionLabel();
  };

  const networkAllowed = () => {
    if (!navigator.onLine) {
      player.showToast("Reconnect before starting queued downloads.");
      return false;
    }
    const info = connection();
    if (prefs.wifiOnly) {
      if (!info?.type) {
        player.showToast("This browser cannot verify Wi-Fi. Turn off Wi-Fi only to continue.");
        return false;
      }
      if (!["wifi", "ethernet"].includes(info.type)) {
        player.showToast("Queued downloads are waiting for Wi-Fi.");
        return false;
      }
    }
    if (prefs.respectDataSaver && info?.saveData && !promptedForMeteredBatch) {
      promptedForMeteredBatch = true;
      if (!window.confirm("Data Saver is active. Continue this multi-song download?")) {
        paused = true;
        render();
        return false;
      }
    }
    return true;
  };

  const processQueue = async () => {
    if (running || paused || !networkAllowed()) return;
    running = true;
    render();
    try {
      while (!paused) {
        const job = queue.find((entry) => entry.status === "pending");
        if (!job) break;
        const track = tracksById().get(job.id);
        if (!track) {
          job.status = "error";
          job.error = "Release is no longer available";
          continue;
        }
        if (player.getOfflineIds().includes(job.id)) {
          job.status = "done";
          job.progress = 1;
          continue;
        }
        job.status = "downloading";
        job.error = "";
        controller = new AbortController();
        render();
        try {
          await player.saveOffline(job.id, ({ ratio }) => {
            job.progress = Number(ratio) || 0;
            render();
          }, { signal: controller.signal });
          job.status = "done";
          job.progress = 1;
        } catch (error) {
          if (controller.signal.aborted && paused) {
            job.status = "pending";
            job.progress = 0;
          } else {
            job.status = "error";
            job.error = error?.message || "Download failed";
          }
        } finally {
          controller = null;
          saveQueue();
          render();
        }
      }
    } finally {
      running = false;
      saveQueue();
      render();
      player.refreshOffline().catch(() => undefined);
    }
  };

  const enqueue = (ids, label) => {
    const available = tracksById();
    const saved = new Set(player.getOfflineIds());
    const existing = new Set(queue.filter((job) => job.status !== "error").map((job) => job.id));
    const additions = [...new Set(ids)].filter((id) => available.has(id) && !saved.has(id) && !existing.has(id));
    if (!additions.length) {
      player.showToast("Every song in this collection is already saved or queued.");
      return;
    }
    queue.push(...additions.map((id) => ({ id, label, status: "pending", progress: 0, error: "" })));
    paused = false;
    saveQueue();
    render();
    player.showToast(`${additions.length} song${additions.length === 1 ? "" : "s"} added to offline downloads.`);
    processQueue();
  };

  $("#collection-detail-offline")?.addEventListener("click", () => {
    const collection = player.getActiveCollection();
    if (collection) enqueue(collection.tracks.map((track) => track.id), collection.title);
  });
  $("#playlist-detail-offline")?.addEventListener("click", () => {
    const playlist = player.getActivePlaylist();
    if (playlist) enqueue(playlist.trackIds, playlist.name);
  });
  $("#download-manager-pause")?.addEventListener("click", () => {
    paused = !paused;
    if (paused) controller?.abort();
    else processQueue();
    render();
  });
  $("#download-manager-retry")?.addEventListener("click", () => {
    for (const job of queue) if (job.status === "error") { job.status = "pending"; job.progress = 0; job.error = ""; }
    paused = false;
    saveQueue();
    render();
    processQueue();
  });
  $("#download-manager-clear")?.addEventListener("click", () => {
    queue = queue.filter((job) => job.status !== "done");
    saveQueue();
    render();
  });
  $("#download-manager-queue")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-download-remove]");
    if (!button) return;
    const job = queue.find((entry) => entry.id === button.dataset.downloadRemove);
    if (job?.status === "downloading") controller?.abort();
    queue = queue.filter((entry) => entry !== job);
    saveQueue();
    render();
  });
  $("#download-data-saver")?.addEventListener("change", (event) => { prefs.respectDataSaver = event.target.checked; promptedForMeteredBatch = false; savePrefs(); render(); });
  $("#download-wifi-only")?.addEventListener("change", (event) => { prefs.wifiOnly = event.target.checked; savePrefs(); render(); if (!paused) processQueue(); });
  window.addEventListener("online", processQueue);
  connection()?.addEventListener?.("change", () => { render(); if (!paused) processQueue(); });
  document.addEventListener("xotiic:statechange", render);

  render();
  processQueue();
})();

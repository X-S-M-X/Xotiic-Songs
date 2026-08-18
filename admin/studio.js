(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const WORKSPACE_KEY = "xotiic-upload-workspaces-v1";
  const SHARED_DB = "xotiic-upload-share-inbox-v1";
  const SHARED_STORE = "files";
  const TEXT_FIELDS = [
    "release-title", "release-artist", "release-album", "release-collection",
    "release-track-number", "release-genre", "release-franchise", "release-mood",
    "release-tags", "release-credits", "release-id", "release-youtube",
    "release-description", "release-lyrics", "release-schedule",
  ];
  const batch = [];
  let currentBatchId = "";

  const admin = () => globalThis.XotiicAdmin;
  const toast = (message, type = "success") => admin()?.showToast(message, type);
  const text = (value) => String(value ?? "").trim();
  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };
  const slugify = (value) => text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const safeJson = (raw, fallback) => {
    try { return JSON.parse(raw); } catch { return fallback; }
  };
  const readWorkspaces = () => {
    const stored = safeJson(localStorage.getItem(WORKSPACE_KEY), []);
    return Array.isArray(stored) ? stored.filter((item) => item && typeof item === "object").slice(0, 30) : [];
  };
  const writeWorkspaces = (items) => localStorage.setItem(WORKSPACE_KEY, JSON.stringify(items.slice(0, 30)));

  const dispatchValue = (element, value) => {
    if (!element) return;
    if (element.type === "checkbox") element.checked = Boolean(value);
    else element.value = value ?? "";
    element.dispatchEvent(new Event(element.tagName === "SELECT" || element.type === "checkbox" || element.type === "radio" ? "change" : "input", { bubbles: true }));
  };

  const captureWorkspace = () => {
    const values = {};
    TEXT_FIELDS.forEach((id) => { values[id] = $(`#${id}`)?.value ?? ""; });
    values["release-explicit"] = Boolean($("#release-explicit")?.checked);
    values["release-mode"] = $("input[name='release-mode']:checked")?.value || "published";
    return values;
  };

  const restoreWorkspace = (values = {}) => {
    TEXT_FIELDS.forEach((id) => dispatchValue($(`#${id}`), values[id] ?? ""));
    dispatchValue($("#release-explicit"), values["release-explicit"] === true);
    const mode = ["published", "scheduled", "draft"].includes(values["release-mode"]) ? values["release-mode"] : "published";
    dispatchValue($(`input[name='release-mode'][value='${mode}']`), true);
    window.scrollTo({ top: $("#release-form")?.offsetTop || 0, behavior: "smooth" });
  };

  const renderWorkspaces = () => {
    const target = $("#workspace-list");
    if (!target) return;
    const items = readWorkspaces();
    target.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "studio-empty";
      empty.textContent = "No saved workspaces.";
      target.append(empty);
      return;
    }
    items.forEach((item) => {
      const row = document.createElement("article");
      row.className = "workspace-item";
      const copy = document.createElement("div");
      copy.className = "workspace-copy";
      const name = document.createElement("strong");
      name.textContent = text(item.name) || "Untitled workspace";
      const detail = document.createElement("small");
      const saved = Number.isFinite(Date.parse(item.updatedAt)) ? new Date(item.updatedAt).toLocaleString() : "Saved locally";
      detail.textContent = `${text(item.values?.["release-title"]) || "Untitled release"} · ${saved}`;
      copy.append(name, detail);
      const actions = document.createElement("div");
      actions.className = "workspace-actions";
      const load = document.createElement("button");
      load.type = "button";
      load.dataset.workspaceLoad = item.id;
      load.textContent = "Load";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.workspaceRemove = item.id;
      remove.textContent = "Delete";
      actions.append(load, remove);
      row.append(copy, actions);
      target.append(row);
    });
  };

  const decodeSynchsafe = (bytes, offset) => ((bytes[offset] & 0x7f) << 21)
    | ((bytes[offset + 1] & 0x7f) << 14)
    | ((bytes[offset + 2] & 0x7f) << 7)
    | (bytes[offset + 3] & 0x7f);
  const decodeUint32 = (bytes, offset) => ((bytes[offset] << 24) >>> 0)
    + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
  const trimDecoded = (value) => value.replace(/^\ufeff/, "").replace(/\0+/g, "").trim();
  const decodeTextBytes = (bytes, encoding = 3) => {
    if (!bytes?.length) return "";
    try {
      if (encoding === 0) return trimDecoded(new TextDecoder("iso-8859-1").decode(bytes));
      if (encoding === 1) {
        const little = bytes[0] === 0xff && bytes[1] === 0xfe;
        const big = bytes[0] === 0xfe && bytes[1] === 0xff;
        return trimDecoded(new TextDecoder(little ? "utf-16le" : big ? "utf-16be" : "utf-16le").decode(bytes.subarray(little || big ? 2 : 0)));
      }
      if (encoding === 2) return trimDecoded(new TextDecoder("utf-16be").decode(bytes));
      return trimDecoded(new TextDecoder("utf-8").decode(bytes));
    } catch {
      return trimDecoded(String.fromCharCode(...bytes.subarray(0, 4096)));
    }
  };

  const findTerminator = (bytes, start, encoding) => {
    if (encoding === 1 || encoding === 2) {
      for (let index = start; index + 1 < bytes.length; index += 2) {
        if (bytes[index] === 0 && bytes[index + 1] === 0) return index + 2;
      }
      return bytes.length;
    }
    const found = bytes.indexOf(0, start);
    return found < 0 ? bytes.length : found + 1;
  };

  const parseApic = (bytes, fileName) => {
    if (!bytes?.length) return null;
    const encoding = bytes[0];
    const mimeEnd = bytes.indexOf(0, 1);
    if (mimeEnd < 0 || mimeEnd + 2 >= bytes.length) return null;
    const mime = new TextDecoder("ascii").decode(bytes.subarray(1, mimeEnd)).toLowerCase();
    if (!/^image\/(?:jpeg|png|webp)$/.test(mime)) return null;
    const descriptionStart = mimeEnd + 2;
    const dataStart = findTerminator(bytes, descriptionStart, encoding);
    if (dataStart >= bytes.length) return null;
    const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    const base = fileName.replace(/\.[^.]+$/, "") || "cover";
    return new File([bytes.subarray(dataStart)], `${base}-embedded-cover.${extension}`, { type: mime, lastModified: Date.now() });
  };

  const readId3 = async (file) => {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 8 * 1024 * 1024)).arrayBuffer());
    if (head.length < 10 || String.fromCharCode(...head.subarray(0, 3)) !== "ID3") return {};
    const version = head[3];
    if (version < 3 || version > 4) return {};
    const tagEnd = Math.min(head.length, 10 + decodeSynchsafe(head, 6));
    const metadata = {};
    let offset = 10;
    while (offset + 10 <= tagEnd) {
      const frameId = String.fromCharCode(...head.subarray(offset, offset + 4));
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
      const size = version === 4 ? decodeSynchsafe(head, offset + 4) : decodeUint32(head, offset + 4);
      if (!size || offset + 10 + size > tagEnd) break;
      const data = head.subarray(offset + 10, offset + 10 + size);
      if (["TIT2", "TPE1", "TALB", "TCON", "TRCK"].includes(frameId)) {
        const decoded = decodeTextBytes(data.subarray(1), data[0]);
        if (decoded) metadata[frameId] = decoded;
      } else if (frameId === "APIC" && !metadata.cover) {
        metadata.cover = parseApic(data, file.name);
      }
      offset += 10 + size;
    }
    return metadata;
  };

  const assignFile = (input, file) => {
    if (!input || !file) return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      toast("This browser cannot move the selected file into the release form. Choose it with Browse instead.", "error");
      return false;
    }
  };

  const applyId3 = (metadata, file, batchIndex = 0) => {
    const title = text(metadata.TIT2) || file.name.replace(/\.[^.]+$/, "");
    dispatchValue($("#release-title"), title);
    if (text(metadata.TPE1)) dispatchValue($("#release-artist"), metadata.TPE1);
    if (text(metadata.TALB)) {
      dispatchValue($("#release-collection"), metadata.TALB);
      dispatchValue($("#release-album"), "Album");
    }
    if (text(metadata.TCON)) dispatchValue($("#release-genre"), metadata.TCON.replace(/^\(\d+\)/, ""));
    const parsedTrack = Number.parseInt(text(metadata.TRCK).split("/")[0], 10);
    if (Number.isFinite(parsedTrack) && parsedTrack > 0) dispatchValue($("#release-track-number"), parsedTrack);
    else if (batchIndex >= 0) dispatchValue($("#release-track-number"), Number($("#studio-track-start")?.value || 1) + batchIndex);
    if (metadata.cover) assignFile($("#cover-file"), metadata.cover);
  };

  const renderBatch = () => {
    const target = $("#bulk-audio-queue");
    if (!target) return;
    $("#studio-batch-count").textContent = `${batch.length} queued`;
    target.replaceChildren();
    if (!batch.length) {
      const empty = document.createElement("p");
      empty.className = "studio-empty";
      empty.textContent = "No batch files selected.";
      target.append(empty);
      return;
    }
    batch.forEach((entry, index) => {
      const row = document.createElement("article");
      row.className = `studio-queue-item${entry.id === currentBatchId ? " is-current" : ""}`;
      const copy = document.createElement("div");
      copy.className = "studio-queue-copy";
      const title = document.createElement("strong");
      title.textContent = text(entry.metadata?.TIT2) || entry.file.name;
      const detail = document.createElement("small");
      const artist = text(entry.metadata?.TPE1);
      detail.textContent = `${artist ? `${artist} · ` : ""}${formatBytes(entry.file.size)}${entry.error ? " · ID3 unavailable" : ""}`;
      copy.append(title, detail);
      const actions = document.createElement("div");
      actions.className = "studio-queue-actions";
      const load = document.createElement("button");
      load.type = "button";
      load.dataset.batchLoad = entry.id;
      load.textContent = entry.id === currentBatchId ? "Reload" : "Load";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.batchRemove = entry.id;
      remove.textContent = "Remove";
      actions.append(load, remove);
      row.append(copy, actions);
      target.append(row);
    });
  };

  const addBatchFiles = async (files) => {
    const audioFiles = [...files].filter((file) => file.type === "audio/mpeg" || /\.mp3$/i.test(file.name));
    if (!audioFiles.length) {
      toast("Choose one or more MP3 files.", "error");
      return;
    }
    const tools = $("#creator-studio-tools");
    if (tools) tools.open = true;
    for (const file of audioFiles) {
      if (batch.some((entry) => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified)) continue;
      const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, metadata: {}, error: false };
      batch.push(entry);
      try { entry.metadata = await readId3(file); } catch { entry.error = true; }
      renderBatch();
    }
    if (!currentBatchId && batch.length) loadBatch(batch[0].id);
  };

  const loadBatch = (id) => {
    const index = batch.findIndex((entry) => entry.id === id);
    const entry = batch[index];
    if (!entry) return;
    currentBatchId = entry.id;
    if (assignFile($("#audio-file"), entry.file)) {
      applyId3(entry.metadata, entry.file, index);
      renderBatch();
      toast(`Loaded ${text(entry.metadata.TIT2) || entry.file.name} into the release form.`);
    }
  };

  const applyAlbumDefaults = () => {
    dispatchValue($("#release-collection"), $("#studio-collection")?.value || "");
    dispatchValue($("#release-album"), $("#studio-release-type")?.value || "Album");
    dispatchValue($("#release-franchise"), $("#studio-franchise")?.value || "");
    dispatchValue($("#release-genre"), $("#studio-genre")?.value || "Anime J-Rock");
    if (!$("#release-track-number")?.value) dispatchValue($("#release-track-number"), $("#studio-track-start")?.value || "1");
    toast("Album details applied to the current release.");
  };

  const renderPreflight = () => {
    const target = $("#release-preflight");
    if (!target) return;
    const releaseFiles = admin()?.getReleaseFiles?.() || {};
    const title = text($("#release-title")?.value);
    const releaseId = text($("#release-id")?.value);
    const mode = $("input[name='release-mode']:checked")?.value || "published";
    const scheduled = Date.parse($("#release-schedule")?.value || "");
    const checks = [
      [Boolean(releaseFiles.audioFile && releaseFiles.audioDuration > 0), "MP3 master", releaseFiles.audioFile ? `Detected ${Math.round(releaseFiles.audioDuration || 0)} seconds` : "Choose a complete MP3"],
      [Boolean(releaseFiles.coverFile && releaseFiles.coverWidth === releaseFiles.coverHeight), "Square cover", releaseFiles.coverFile ? `${releaseFiles.coverWidth} × ${releaseFiles.coverHeight}` : "Choose JPG, PNG or WebP artwork"],
      [Boolean(title && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(releaseId)), "Metadata and ID", title ? releaseId || "Release ID missing" : "Song title missing"],
      [mode !== "scheduled" || (Number.isFinite(scheduled) && scheduled > Date.now() + 60000), "Release timing", mode === "scheduled" ? "Scheduled date must be in the future" : `${mode[0].toUpperCase()}${mode.slice(1)} selected`],
    ];
    target.replaceChildren();
    checks.forEach(([ready, name, detail]) => {
      const row = document.createElement("div");
      row.className = `preflight-item${ready ? " is-ready" : ""}`;
      const mark = document.createElement("span");
      mark.textContent = ready ? "✓" : "!";
      const copy = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = name;
      const note = document.createElement("small");
      note.textContent = detail;
      copy.append(heading, note);
      row.append(mark, copy);
      target.append(row);
    });
  };

  const renderCalendar = () => {
    const target = $("#release-calendar");
    if (!target) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Device time";
    $("#release-calendar-timezone").textContent = zone;
    const releases = (admin()?.getReleases?.() || [])
      .filter((release) => release.status === "scheduled" && Number.isFinite(Date.parse(release.releaseAt)) && Date.parse(release.releaseAt) > Date.now())
      .sort((left, right) => Date.parse(left.releaseAt) - Date.parse(right.releaseAt))
      .slice(0, 8);
    target.replaceChildren();
    if (!releases.length) {
      const empty = document.createElement("p");
      empty.textContent = "No scheduled releases yet.";
      target.append(empty);
      return;
    }
    releases.forEach((release) => {
      const row = document.createElement("article");
      row.className = "calendar-release";
      const moment = new Date(release.releaseAt);
      const time = document.createElement("time");
      time.dateTime = release.releaseAt;
      time.textContent = moment.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const copy = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = text(release.title) || "Untitled release";
      const detail = document.createElement("small");
      detail.textContent = moment.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
      copy.append(name, detail);
      row.append(time, copy);
      target.append(row);
    });
  };

  const openSharedDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARED_STORE)) request.result.createObjectStore(SHARED_STORE, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const takeSharedFiles = async () => {
    if (!("indexedDB" in globalThis)) return [];
    const db = await openSharedDb();
    const items = await new Promise((resolve, reject) => {
      const transaction = db.transaction(SHARED_STORE, "readwrite");
      const store = transaction.objectStore(SHARED_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const found = request.result || [];
        store.clear();
        resolve(found);
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    return items.map((item) => item.file).filter((file) => file instanceof Blob);
  };

  const receiveFiles = async (files) => {
    const list = [...files];
    const audioFiles = list.filter((file) => file.type === "audio/mpeg" || /\.mp3$/i.test(file.name || ""));
    const cover = list.find((file) => /^image\/(?:jpeg|png|webp)$/.test(file.type));
    if (cover) assignFile($("#cover-file"), cover);
    if (audioFiles.length) await addBatchFiles(audioFiles);
    if (audioFiles.length || cover) {
      admin()?.selectPanel?.("upload");
      toast(`Received ${audioFiles.length + (cover ? 1 : 0)} shared file${audioFiles.length + (cover ? 1 : 0) === 1 ? "" : "s"}.`);
    }
  };

  $("#bulk-audio-input")?.addEventListener("change", (event) => addBatchFiles(event.currentTarget.files));
  const drop = $("#batch-drop");
  ["dragenter", "dragover"].forEach((name) => drop?.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((name) => drop?.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.remove("is-dragging");
  }));
  drop?.addEventListener("drop", (event) => addBatchFiles(event.dataTransfer.files));

  $("#studio-apply-album")?.addEventListener("click", applyAlbumDefaults);
  $("#workspace-save")?.addEventListener("click", () => {
    const name = text($("#workspace-name")?.value) || text($("#release-title")?.value) || "Untitled workspace";
    const items = readWorkspaces();
    const existing = items.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const workspace = { id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, updatedAt: new Date().toISOString(), values: captureWorkspace() };
    writeWorkspaces([workspace, ...items.filter((item) => item.id !== workspace.id)]);
    $("#workspace-name").value = name;
    renderWorkspaces();
    toast(`Saved ${name} on this device.`);
  });
  $("#workspace-new")?.addEventListener("click", () => {
    if (window.confirm("Clear the current release form and start a new workspace?")) admin()?.resetReleaseForm?.();
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.batchLoad) loadBatch(target.dataset.batchLoad);
    if (target.dataset.batchRemove) {
      const index = batch.findIndex((entry) => entry.id === target.dataset.batchRemove);
      if (index >= 0) {
        if (batch[index].id === currentBatchId) currentBatchId = "";
        batch.splice(index, 1);
        renderBatch();
      }
    }
    if (target.dataset.workspaceLoad) {
      const workspace = readWorkspaces().find((item) => item.id === target.dataset.workspaceLoad);
      if (workspace) {
        restoreWorkspace(workspace.values);
        $("#workspace-name").value = workspace.name;
        toast(`Loaded ${workspace.name}. Select its MP3 and cover before publishing.`);
      }
    }
    if (target.dataset.workspaceRemove) {
      const items = readWorkspaces();
      const workspace = items.find((item) => item.id === target.dataset.workspaceRemove);
      if (workspace && window.confirm(`Delete the local workspace “${workspace.name}”?`)) {
        writeWorkspaces(items.filter((item) => item.id !== workspace.id));
        renderWorkspaces();
      }
    }
  });

  $("#release-form")?.addEventListener("input", renderPreflight);
  $("#release-form")?.addEventListener("change", renderPreflight);
  document.addEventListener("xotiic:adminstate", () => {
    renderCalendar();
    renderPreflight();
  });

  if ("launchQueue" in globalThis && "LaunchParams" in globalThis) {
    globalThis.launchQueue.setConsumer(async (launchParams) => {
      const files = [];
      for (const handle of launchParams.files || []) {
        try { files.push(await handle.getFile()); } catch { /* The user may revoke a file handle. */ }
      }
      await receiveFiles(files);
    });
  }

  renderBatch();
  renderWorkspaces();
  renderCalendar();
  renderPreflight();
  if (new URLSearchParams(location.search).get("shared") === "1") {
    takeSharedFiles().then(receiveFiles).catch(() => toast("Shared files could not be opened. Choose them from the release form instead.", "error"));
  }
})();

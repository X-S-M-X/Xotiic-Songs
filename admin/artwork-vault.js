(() => {
  "use strict";

  const DB_NAME = "xotiic-artwork-vault-v1";
  const DB_VERSION = 1;
  const STORE_NAME = "concepts";
  const BACKUP_APP = "XotiicDuck Artwork Vault";
  const BACKUP_VERSION = 1;
  const MAX_COVER_BYTES = 10 * 1024 * 1024;
  const MAX_IMPORT_BYTES = 120 * 1024 * 1024;
  const VALID_STATUS = new Set(["concept", "needs-audio", "ready"]);
  const RELEASE_STEPS = ["artwork", "audio", "details", "review"];
  const STATUS_LABELS = Object.freeze({
    concept: "Concept",
    "needs-audio": "Needs audio",
    ready: "Ready for release",
  });

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const admin = globalThis.XotiicAdmin;
  if (!admin) return;

  const state = {
    concepts: [],
    selectedId: "",
    editorCover: null,
    editorCoverName: "",
    editorCoverType: "",
    editorCoverWidth: 0,
    editorCoverHeight: 0,
    editorPreviewUrl: "",
    renderUrls: new Set(),
    previousFocus: null,
    releaseStep: "artwork",
    suppressReleaseReset: false,
    renderTimer: null,
    databaseAvailable: "indexedDB" in globalThis,
  };

  const icon = (name) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ui-icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#admin-icon-${name}`);
    svg.append(use);
    return svg;
  };

  const cleanText = (value, maximum) => String(value || "").trim().slice(0, maximum);
  const cleanStatus = (value) => VALID_STATUS.has(value) ? value : "concept";
  const formatDate = (value) => {
    const date = new Date(Number(value) || Date.now());
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  };
  const formatBytes = (bytes) => admin.formatBytes?.(bytes) || `${Math.round((Number(bytes) || 0) / 1024)} KB`;

  const createId = () => globalThis.crypto?.randomUUID?.()
    || `concept-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const openDatabase = () => new Promise((resolve, reject) => {
    if (!state.databaseAvailable) {
      reject(new Error("Artwork storage is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("status", "status");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Artwork storage could not be opened."));
    request.onblocked = () => reject(new Error("Close other Xotiic Upload tabs, then try again."));
  });

  const getAllConcepts = async () => {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  };

  const saveConceptRecord = async (record) => {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("Concept save was cancelled."));
      });
    } finally {
      database.close();
    }
  };

  const deleteConceptRecord = async (id) => {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  };

  const readImage = (blob) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight, image, url });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That cover image could not be read."));
    };
    image.src = url;
  });

  const canvasBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The cover could not be optimized.")), type, quality);
  });

  const prepareCover = async (source, name = "cover.webp") => {
    if (!(source instanceof Blob) || !source.size) throw new Error("Choose a square cover image.");
    if (!/^image\/(?:jpeg|png|webp)$/i.test(source.type)) throw new Error("Use a JPG, PNG, or WebP cover.");
    if (source.size > MAX_COVER_BYTES) throw new Error("The cover must be 10 MB or smaller.");
    const { width, height, image, url } = await readImage(source);
    try {
      if (!width || !height) throw new Error("The cover dimensions could not be read.");
      const ratio = width / height;
      if (ratio < 0.97 || ratio > 1.03) throw new Error("Artwork Vault accepts square covers only.");

      let blob = source;
      let outputName = name || "cover.webp";
      let optimized = false;
      if (Math.max(width, height) > 1600 || source.size > 2 * 1024 * 1024) {
        const canvas = document.createElement("canvas");
        canvas.width = 1400;
        canvas.height = 1400;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser cannot optimize the cover image.");
        context.drawImage(image, 0, 0, 1400, 1400);
        blob = await canvasBlob(canvas, "image/webp", 0.88);
        outputName = `${outputName.replace(/\.[^.]+$/, "") || "cover"}.webp`;
        optimized = true;
      }
      return { blob, name: outputName, type: blob.type || source.type, width, height, optimized };
    } finally {
      URL.revokeObjectURL(url);
      image.removeAttribute("src");
    }
  };

  const clearEditorPreview = () => {
    if (state.editorPreviewUrl) URL.revokeObjectURL(state.editorPreviewUrl);
    state.editorPreviewUrl = "";
  };

  const setEditorPreview = (blob) => {
    clearEditorPreview();
    const preview = $("#artwork-cover-preview");
    if (!blob) {
      preview.classList.remove("has-image");
      preview.style.backgroundImage = "";
      return;
    }
    state.editorPreviewUrl = URL.createObjectURL(blob);
    preview.style.backgroundImage = `url(${JSON.stringify(state.editorPreviewUrl)})`;
    preview.classList.add("has-image");
  };

  const clearRenderUrls = () => {
    state.renderUrls.forEach((url) => URL.revokeObjectURL(url));
    state.renderUrls.clear();
  };

  const coverUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    state.renderUrls.add(url);
    return url;
  };

  const visibleConcepts = () => {
    const query = cleanText($("#artwork-search")?.value, 100).toLowerCase();
    const filter = $("#artwork-filter")?.value || "all";
    const sort = $("#artwork-sort")?.value || "updated";
    const result = state.concepts.filter((concept) => filter === "all" || concept.status === filter)
      .filter((concept) => !query || [concept.title, concept.franchise, concept.character, concept.mood, concept.tags, concept.notes]
        .join(" ").toLowerCase().includes(query));
    result.sort((left, right) => {
      if (sort === "title") return left.title.localeCompare(right.title);
      if (sort === "created") return (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0);
      return (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0);
    });
    return result;
  };

  const updateCounts = () => {
    const total = state.concepts.length;
    const needsAudio = state.concepts.filter((entry) => entry.status === "needs-audio").length;
    const ready = state.concepts.filter((entry) => entry.status === "ready").length;
    for (const [selector, value] of [
      ["#artwork-total", total],
      ["#artwork-needs-audio", needsAudio],
      ["#artwork-ready", ready],
      ["#overview-concepts", total],
      ["#artwork-count-badge", total],
    ]) {
      const element = $(selector);
      if (element) element.textContent = String(value);
    }
  };

  const renderInspector = () => {
    const inspector = $("#artwork-inspector");
    const concept = state.concepts.find((entry) => entry.id === state.selectedId);
    inspector.replaceChildren();
    if (!concept) {
      const empty = document.createElement("div");
      empty.className = "artwork-inspector-empty";
      const symbol = document.createElement("span");
      symbol.append(icon("box"));
      const title = document.createElement("strong");
      title.textContent = "Select a concept";
      const copy = document.createElement("p");
      copy.textContent = "Its artwork, notes, and release shortcut will appear here.";
      empty.append(symbol, title, copy);
      inspector.append(empty);
      return;
    }

    const cover = document.createElement("div");
    cover.className = "artwork-inspector-cover";
    const image = document.createElement("img");
    image.src = coverUrl(concept.coverBlob);
    image.alt = `${concept.title} cover`;
    cover.append(image);

    const copy = document.createElement("div");
    copy.className = "artwork-inspector-copy";
    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = STATUS_LABELS[concept.status];
    const title = document.createElement("h3");
    title.textContent = concept.title;
    const description = document.createElement("p");
    description.textContent = concept.notes || "No creative notes yet.";
    const metadata = document.createElement("dl");
    metadata.className = "artwork-inspector-meta";
    const rows = [
      ["Franchise", concept.franchise || "Not set"],
      ["Character", concept.character || "Not set"],
      ["Updated", formatDate(concept.updatedAt)],
      ["Cover", `${concept.coverWidth || "?"} × ${concept.coverHeight || "?"} · ${formatBytes(concept.coverBlob?.size)}`],
    ];
    rows.forEach(([term, value]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      row.append(dt, dd);
      metadata.append(row);
    });
    const actions = document.createElement("div");
    actions.className = "artwork-inspector-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.artworkEdit = concept.id;
    edit.textContent = "Edit concept";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.artworkDelete = concept.id;
    remove.textContent = "Delete";
    const use = document.createElement("button");
    use.type = "button";
    use.dataset.artworkUse = concept.id;
    use.textContent = "Attach MP3 and continue release";
    actions.append(edit, remove, use);
    copy.append(label, title, description, metadata, actions);
    inspector.append(cover, copy);
  };

  const render = () => {
    clearRenderUrls();
    updateCounts();
    const grid = $("#artwork-grid");
    const empty = $("#artwork-empty");
    const concepts = visibleConcepts();
    grid.replaceChildren();
    empty.hidden = concepts.length > 0;

    concepts.forEach((concept) => {
      const card = document.createElement("article");
      card.className = `artwork-card${concept.id === state.selectedId ? " active" : ""}`;
      card.dataset.status = concept.status;
      const main = document.createElement("button");
      main.type = "button";
      main.className = "artwork-card-main";
      main.dataset.artworkSelect = concept.id;
      main.setAttribute("aria-label", `Open ${concept.title}`);
      const cover = document.createElement("span");
      cover.className = "artwork-card-cover";
      const image = document.createElement("img");
      image.src = coverUrl(concept.coverBlob);
      image.alt = `${concept.title} cover`;
      image.loading = "lazy";
      const status = document.createElement("span");
      status.className = "artwork-card-status";
      status.textContent = STATUS_LABELS[concept.status];
      cover.append(image, status);
      const copy = document.createElement("span");
      copy.className = "artwork-card-copy";
      const title = document.createElement("strong");
      title.textContent = concept.title;
      const meta = document.createElement("small");
      meta.textContent = [concept.franchise, concept.character, `Updated ${formatDate(concept.updatedAt)}`].filter(Boolean).join(" · ");
      copy.append(title, meta);
      main.append(cover, copy);

      const actions = document.createElement("div");
      actions.className = "artwork-card-actions";
      const attach = document.createElement("button");
      attach.type = "button";
      attach.dataset.artworkUse = concept.id;
      attach.textContent = "Attach MP3";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.dataset.artworkEdit = concept.id;
      edit.setAttribute("aria-label", `Edit ${concept.title}`);
      edit.append(icon("edit"));
      actions.append(attach, edit);
      card.append(main, actions);
      grid.append(card);
    });
    renderInspector();
  };

  const scheduleRender = () => {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(render, 120);
  };

  const loadConcepts = async ({ announceError = true } = {}) => {
    try {
      state.concepts = (await getAllConcepts()).filter((entry) => entry?.id && entry.coverBlob instanceof Blob && entry.title);
      if (state.selectedId && !state.concepts.some((entry) => entry.id === state.selectedId)) state.selectedId = "";
      render();
      return state.concepts;
    } catch (error) {
      state.databaseAvailable = false;
      if (announceError) admin.showToast(error.message || "Artwork Vault is unavailable.", "error");
      $("#artwork-new").disabled = true;
      $("#artwork-empty h3").textContent = "Artwork storage is unavailable.";
      $("#artwork-empty p").textContent = "Use a current browser with IndexedDB enabled, then reopen the console.";
      render();
      return [];
    }
  };

  const editorRecord = () => {
    const existing = state.concepts.find((entry) => entry.id === $("#artwork-editor-id").value);
    const now = Date.now();
    return {
      id: existing?.id || createId(),
      title: cleanText($("#artwork-title").value, 100),
      status: cleanStatus($("#artwork-status").value),
      franchise: cleanText($("#artwork-franchise").value, 80),
      character: cleanText($("#artwork-character").value, 80),
      mood: cleanText($("#artwork-mood").value, 60),
      performance: cleanText($("#artwork-performance").value, 30),
      tags: cleanText($("#artwork-tags").value, 240),
      notes: cleanText($("#artwork-notes").value, 2000),
      coverBlob: state.editorCover || existing?.coverBlob || null,
      coverName: state.editorCoverName || existing?.coverName || "cover.webp",
      coverType: state.editorCoverType || existing?.coverType || state.editorCover?.type || "image/webp",
      coverWidth: state.editorCoverWidth || existing?.coverWidth || 0,
      coverHeight: state.editorCoverHeight || existing?.coverHeight || 0,
      createdAt: Number(existing?.createdAt) || now,
      updatedAt: now,
    };
  };

  const validateEditorRecord = (record) => {
    if (!record.title) throw new Error("Add a working title before saving.");
    if (!(record.coverBlob instanceof Blob) || !record.coverBlob.size) throw new Error("Add a square cover before saving.");
    return record;
  };

  const closeEditor = () => {
    $("#artwork-editor-layer").hidden = true;
    document.body.classList.remove("modal-open");
    clearEditorPreview();
    state.editorCover = null;
    $("#artwork-cover-file").value = "";
    state.previousFocus?.focus?.({ preventScroll: true });
    state.previousFocus = null;
  };

  const openEditor = (id = "") => {
    const concept = state.concepts.find((entry) => entry.id === id);
    state.previousFocus = document.activeElement;
    $("#artwork-editor-form").reset();
    $("#artwork-editor-id").value = concept?.id || "";
    $("#artwork-title").value = concept?.title || "";
    $("#artwork-status").value = concept?.status || "concept";
    $("#artwork-franchise").value = concept?.franchise || "";
    $("#artwork-character").value = concept?.character || "";
    $("#artwork-mood").value = concept?.mood || "";
    $("#artwork-performance").value = concept?.performance || "";
    $("#artwork-tags").value = concept?.tags || "";
    $("#artwork-notes").value = concept?.notes || "";
    $("#artwork-notes-count").textContent = String((concept?.notes || "").length);
    state.editorCover = concept?.coverBlob || null;
    state.editorCoverName = concept?.coverName || "";
    state.editorCoverType = concept?.coverType || "";
    state.editorCoverWidth = Number(concept?.coverWidth) || 0;
    state.editorCoverHeight = Number(concept?.coverHeight) || 0;
    setEditorPreview(state.editorCover);
    $("#artwork-cover-status").textContent = concept
      ? `${concept.coverWidth || "?"} × ${concept.coverHeight || "?"} · ${formatBytes(concept.coverBlob.size)} · Tap the cover to replace it.`
      : "A cover is required for a new concept.";
    $("#artwork-editor-title").textContent = concept ? "Edit artwork concept" : "New artwork concept";
    $("#artwork-delete").hidden = !concept;
    $("#artwork-editor-layer").hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => $("#artwork-title").focus());
  };

  const persistEditor = async ({ close = true } = {}) => {
    const record = validateEditorRecord(editorRecord());
    await saveConceptRecord(record);
    navigator.storage?.persist?.().catch(() => undefined);
    state.selectedId = record.id;
    await loadConcepts();
    if (close) closeEditor();
    admin.showToast(`${record.title} saved in Artwork Vault.`);
    return record;
  };

  const assignValue = (selector, value) => {
    const element = $(selector);
    if (!element || value === undefined || value === null) return;
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const setReleaseStep = (step) => {
    const next = RELEASE_STEPS.includes(step) ? step : "artwork";
    state.releaseStep = next;
    document.body.dataset.releaseStep = next;
    const index = RELEASE_STEPS.indexOf(next);
    $$('[data-release-step-button]').forEach((button) => {
      const active = button.dataset.releaseStepButton === next;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    const names = { artwork: "Artwork", audio: "Audio", details: "Details", review: "Review" };
    $("#release-step-status").textContent = `Step ${index + 1} of ${RELEASE_STEPS.length} · ${names[next]}`;
    $("#release-step-back").disabled = index === 0;
    const nextLabel = $("#release-step-next span:first-child");
    nextLabel.textContent = next === "review" ? "Review release" : "Continue";
    if (matchMedia("(max-width: 720px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const attachCoverToRelease = (concept) => {
    const coverInput = $("#cover-file");
    const filename = concept.coverName || `${concept.id}.webp`;
    const file = new File([concept.coverBlob], filename, { type: concept.coverType || concept.coverBlob.type || "image/webp", lastModified: Date.now() });
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      coverInput.files = transfer.files;
      coverInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      admin.showToast("The details were loaded. This browser requires you to choose the cover again.", "error");
      return false;
    }
  };

  const useConcept = (conceptOrId, { openAudio = true } = {}) => {
    const concept = typeof conceptOrId === "string"
      ? state.concepts.find((entry) => entry.id === conceptOrId)
      : conceptOrId;
    if (!concept) return;
    state.suppressReleaseReset = true;
    admin.resetReleaseForm();
    assignValue("#release-title", concept.title);
    assignValue("#release-franchise", concept.franchise);
    assignValue("#release-character", concept.character);
    assignValue("#release-mood", concept.mood);
    assignValue("#release-performance", concept.performance);
    assignValue("#release-tags", concept.tags);
    if (concept.notes) assignValue("#release-description", concept.notes.slice(0, 280));
    attachCoverToRelease(concept);
    admin.selectPanel("upload");
    setReleaseStep("audio");
    closeEditor();
    if (openAudio) {
      $("#audio-file").click();
      admin.showToast(`${concept.title} is loaded. Choose the final MP3.`);
    } else {
      admin.showToast(`${concept.title} is loaded in New release.`);
    }
  };

  const removeConcept = async (id) => {
    const concept = state.concepts.find((entry) => entry.id === id);
    if (!concept) return;
    if (!confirm(`Delete “${concept.title}” from this device? This cannot be undone unless it is in an Artwork Vault backup.`)) return;
    await deleteConceptRecord(concept.id);
    if (state.selectedId === concept.id) state.selectedId = "";
    closeEditor();
    await loadConcepts();
    admin.showToast(`${concept.title} was removed from Artwork Vault.`);
  };

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("A cover could not be added to the backup."));
    reader.readAsDataURL(blob);
  });

  const dataUrlToBlob = (value) => {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i.exec(String(value || ""));
    if (!match) throw new Error("A restored concept contains an invalid cover.");
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1].toLowerCase() });
  };

  const downloadFile = (file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportVault = async () => {
    if (!state.concepts.length) {
      admin.showToast("Artwork Vault is empty.", "error");
      return;
    }
    $("#artwork-export").disabled = true;
    try {
      const concepts = [];
      for (const concept of state.concepts) {
        concepts.push({
          ...concept,
          coverBlob: undefined,
          coverDataUrl: await blobToDataUrl(concept.coverBlob),
        });
      }
      const payload = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), concepts };
      const file = new File([JSON.stringify(payload)], `xotiicduck-artwork-vault-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ title: "XotiicDuck Artwork Vault backup", files: [file] });
          admin.showToast("Artwork Vault backup shared.");
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      downloadFile(file);
      admin.showToast("Artwork Vault backup downloaded.");
    } catch (error) {
      admin.showToast(error.message || "The Artwork Vault backup failed.", "error");
    } finally {
      $("#artwork-export").disabled = false;
    }
  };

  const importVault = async (file) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      admin.showToast("That Artwork Vault backup is too large.", "error");
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.app !== BACKUP_APP || payload.version !== BACKUP_VERSION || !Array.isArray(payload.concepts)) {
        throw new Error("That is not a valid XotiicDuck Artwork Vault backup.");
      }
      const entries = payload.concepts.slice(0, 500);
      if (!entries.length) throw new Error("That Artwork Vault backup contains no concepts.");
      if (!confirm(`Restore ${entries.length} artwork concept${entries.length === 1 ? "" : "s"}? Existing concepts with the same IDs will be replaced.`)) return;
      let restored = 0;
      for (const entry of entries) {
        const source = dataUrlToBlob(entry.coverDataUrl);
        const prepared = await prepareCover(source, cleanText(entry.coverName, 180) || "cover.webp");
        const now = Date.now();
        const record = {
          id: /^[a-z0-9-]{8,100}$/i.test(String(entry.id || "")) ? entry.id : createId(),
          title: cleanText(entry.title, 100),
          status: cleanStatus(entry.status),
          franchise: cleanText(entry.franchise, 80),
          character: cleanText(entry.character, 80),
          mood: cleanText(entry.mood, 60),
          performance: cleanText(entry.performance, 30),
          tags: cleanText(entry.tags, 240),
          notes: cleanText(entry.notes, 2000),
          coverBlob: prepared.blob,
          coverName: prepared.name,
          coverType: prepared.type,
          coverWidth: prepared.width,
          coverHeight: prepared.height,
          createdAt: Number(entry.createdAt) || now,
          updatedAt: Number(entry.updatedAt) || now,
        };
        if (!record.title) continue;
        await saveConceptRecord(record);
        restored += 1;
      }
      await loadConcepts();
      admin.showToast(`${restored} artwork concept${restored === 1 ? "" : "s"} restored.`);
    } catch (error) {
      admin.showToast(error.message || "The Artwork Vault backup could not be restored.", "error");
    } finally {
      $("#artwork-import-file").value = "";
    }
  };

  const validateWizardStep = () => {
    if (state.releaseStep === "artwork" && !$("#cover-file").files?.length) {
      admin.showToast("Choose or load a square cover first.", "error");
      $("#cover-file").click();
      return false;
    }
    if (state.releaseStep === "audio" && !$("#audio-file").files?.length) {
      admin.showToast("Choose the final MP3 first.", "error");
      $("#audio-file").click();
      return false;
    }
    if (state.releaseStep === "details" && !$("#release-form").reportValidity()) return false;
    return true;
  };

  $("#artwork-new").addEventListener("click", () => openEditor());
  $$('[data-artwork-new]').forEach((button) => button.addEventListener("click", () => openEditor()));
  $$('[data-artwork-editor-close]').forEach((button) => button.addEventListener("click", closeEditor));
  $("#artwork-search").addEventListener("input", scheduleRender);
  $("#artwork-filter").addEventListener("change", render);
  $("#artwork-sort").addEventListener("change", render);
  $("#artwork-import").addEventListener("click", () => $("#artwork-import-file").click());
  $("#artwork-import-file").addEventListener("change", (event) => importVault(event.target.files?.[0]));
  $("#artwork-export").addEventListener("click", exportVault);
  $("#artwork-notes").addEventListener("input", (event) => { $("#artwork-notes-count").textContent = String(event.target.value.length); });

  $("#artwork-cover-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $("#artwork-cover-status").textContent = "Checking square artwork…";
    try {
      const prepared = await prepareCover(file, file.name);
      state.editorCover = prepared.blob;
      state.editorCoverName = prepared.name;
      state.editorCoverType = prepared.type;
      state.editorCoverWidth = prepared.width;
      state.editorCoverHeight = prepared.height;
      setEditorPreview(prepared.blob);
      $("#artwork-cover-status").textContent = `${prepared.width} × ${prepared.height} · ${formatBytes(prepared.blob.size)} · ${prepared.optimized ? "Optimized WebP" : "Square verified"}`;
    } catch (error) {
      event.target.value = "";
      $("#artwork-cover-status").textContent = error.message;
      admin.showToast(error.message, "error");
    }
  });

  $("#artwork-editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#artwork-save").disabled = true;
    try {
      await persistEditor();
    } catch (error) {
      admin.showToast(error.message || "The concept could not be saved.", "error");
    } finally {
      $("#artwork-save").disabled = false;
    }
  });

  $("#artwork-delete").addEventListener("click", () => removeConcept($("#artwork-editor-id").value));
  $("#artwork-continue").addEventListener("click", () => {
    try {
      const record = validateEditorRecord(editorRecord());
      useConcept(record);
      saveConceptRecord(record).then(() => loadConcepts()).catch(() => admin.showToast("The release is loaded, but the concept could not be saved.", "error"));
    } catch (error) {
      admin.showToast(error.message, "error");
    }
  });

  $("#artwork-grid").addEventListener("click", (event) => {
    const target = event.target.closest("[data-artwork-select], [data-artwork-use], [data-artwork-edit]");
    if (!target) return;
    if (target.dataset.artworkUse) useConcept(target.dataset.artworkUse);
    else if (target.dataset.artworkEdit) openEditor(target.dataset.artworkEdit);
    else if (target.dataset.artworkSelect) {
      state.selectedId = target.dataset.artworkSelect;
      if (matchMedia("(max-width: 720px)").matches) openEditor(state.selectedId);
      else render();
    }
  });

  $("#artwork-inspector").addEventListener("click", (event) => {
    const target = event.target.closest("[data-artwork-use], [data-artwork-edit], [data-artwork-delete]");
    if (!target) return;
    if (target.dataset.artworkUse) useConcept(target.dataset.artworkUse);
    else if (target.dataset.artworkEdit) openEditor(target.dataset.artworkEdit);
    else if (target.dataset.artworkDelete) removeConcept(target.dataset.artworkDelete);
  });

  $$('[data-release-step-button]').forEach((button) => button.addEventListener("click", () => setReleaseStep(button.dataset.releaseStepButton)));
  $("#release-step-back").addEventListener("click", () => {
    const index = RELEASE_STEPS.indexOf(state.releaseStep);
    setReleaseStep(RELEASE_STEPS[Math.max(0, index - 1)]);
  });
  $("#release-step-next").addEventListener("click", () => {
    if (!validateWizardStep()) return;
    const index = RELEASE_STEPS.indexOf(state.releaseStep);
    if (state.releaseStep === "review") $("#release-form").requestSubmit();
    else setReleaseStep(RELEASE_STEPS[index + 1]);
  });

  $("#release-form").addEventListener("reset", () => {
    if (state.suppressReleaseReset) {
      state.suppressReleaseReset = false;
      return;
    }
    setTimeout(() => setReleaseStep("artwork"), 0);
  });
  document.addEventListener("xotiic:adminpanel", (event) => {
    if (event.detail?.panel === "artwork") render();
    if (event.detail?.panel === "upload") setReleaseStep(state.releaseStep);
  });
  document.addEventListener("keydown", (event) => {
    if ($("#artwork-editor-layer").hidden) return;
    if (event.key === "Escape") {
      closeEditor();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...$("#artwork-editor-form").querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener("beforeunload", () => {
    clearTimeout(state.renderTimer);
    clearEditorPreview();
    clearRenderUrls();
  });

  globalThis.XotiicArtworkVault = Object.freeze({
    version: "1.0.0",
    database: DB_NAME,
    list: () => state.concepts.map((entry) => ({ ...entry, coverBlob: undefined })),
    open: (id = "") => openEditor(id),
    refresh: () => loadConcepts(),
    use: (id) => useConcept(id, { openAudio: false }),
  });

  setReleaseStep("artwork");
  loadConcepts({ announceError: false });
})();

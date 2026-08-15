(() => {
  "use strict";

  const config = window.XOTIIC_ADMIN_CONFIG;
  const vaultApi = window.XotiicVault;
  const { GitHubPublisher, GitHubError } = window.XotiicGitHub || {};
  if (!config || !vaultApi || !GitHubPublisher) {
    document.body.textContent = "Xotiic Upload could not start. Required files are missing.";
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const RELEASE_DRAFT_KEY = "xotiic-upload-release-draft-v1";
  const setIcon = (target, name) => {
    const use = target?.matches?.("use") ? target : target?.querySelector?.("use");
    if (use) use.setAttribute("href", `#admin-icon-${name}`);
  };
  const state = {
    token: "",
    publisher: null,
    releases: [],
    audioFile: null,
    coverFile: null,
    audioDuration: 0,
    coverWidth: 0,
    coverHeight: 0,
    coverObjectUrl: "",
    idTouched: false,
    pendingRelease: null,
    installPrompt: null,
    installAccepted: false,
    toastTimer: null,
    idleTimer: null,
    hiddenAt: 0,
    busy: false,
    editReleaseId: null,
    editAudioFile: null,
    editAudioDuration: 0,
    editCoverFile: null,
    serviceWorkerRegistration: null,
    reloadingForUpdate: false,
    releaseFilter: "all",
    draftTimer: null,
    suppressDraftSave: false,
    previewReleaseId: "",
    previewSourceKind: "",
    previewObjectUrl: "",
    previewTrack: null,
  };

  const views = {
    setup: $("#setup-view"),
    login: $("#login-view"),
    dashboard: $("#dashboard-view"),
  };

  const text = (value) => String(value ?? "");
  const parseTags = (value) => [...new Set(text(value).split(",").map((entry) => entry.trim()).filter(Boolean))].slice(0, 16);
  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  };
  const formatDuration = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  };
  const slugify = (value) => text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safeAssetUrl = (path) => {
    const clean = text(path).trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!/^(music|covers)\/[a-zA-Z0-9._/-]+$/.test(clean) || clean.includes("..")) return "";
    return `../${clean.split("/").map(encodeURIComponent).join("/")}`;
  };
  const releaseAssetUrl = (release, path) => {
    const safe = safeAssetUrl(path);
    if (!safe) return "";
    const revision = Date.parse(text(release?.updatedAt || release?.publishedAt || release?.releaseAt));
    return Number.isFinite(revision) ? `${safe}?v=${revision}` : safe;
  };
  const safeYouTubeUrl = (value) => {
    if (!text(value).trim()) return "";
    try {
      const url = new URL(text(value).trim());
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      return url.protocol === "https:" && (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") ? url.href : "";
    } catch {
      return "";
    }
  };
  const localDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  };
  const localDateTime = (date = new Date()) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const isoToLocalDateTime = (value) => {
    const date = new Date(text(value));
    return Number.isNaN(date.getTime()) ? "" : localDateTime(date);
  };
  const selectedReleaseMode = () => $("input[name='release-mode']:checked")?.value || "published";
  const releaseTimestamp = (release, index = 0) => Date.parse(text(release.publishedAt))
    || Date.parse(text(release.releaseAt))
    || (/^\d{4}-\d{2}-\d{2}$/.test(text(release.releaseDate)) ? Date.parse(`${release.releaseDate}T00:00:00`) : 0)
    || index;
  const effectiveStatus = (release, now = Date.now()) => release?.status === "scheduled" && Date.parse(text(release.releaseAt)) <= now
    ? "published"
    : ["published", "scheduled", "draft", "archived"].includes(release?.status) ? release.status : "draft";
  const formatReleaseMoment = (release) => {
    if (release?.status === "scheduled" && Number.isFinite(Date.parse(text(release.releaseAt)))) {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(release.releaseAt));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text(release?.releaseDate))) {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${release.releaseDate}T00:00:00`));
    }
    return "No release date";
  };

  const previewAudio = () => $("#admin-preview-audio");
  const previewQueue = () => state.releases
    .map((release, index) => ({ release, timestamp: releaseTimestamp(release, index) }))
    .filter(({ release }) => Boolean(safeAssetUrl(release.audio)))
    .sort((left, right) => right.timestamp - left.timestamp)
    .map(({ release }) => release);
  const previewStatus = (release) => {
    const status = effectiveStatus(release);
    if (release.status === "scheduled" && status === "published") return "AUTO-LIVE PREVIEW";
    return `${status.toUpperCase()} PREVIEW`;
  };

  const updatePreviewPositionState = () => {
    const audio = previewAudio();
    if (!navigator.mediaSession?.setPositionState || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, audio.duration),
      });
    } catch { /* Position metadata is optional. */ }
  };

  const syncPreviewUi = () => {
    const audio = previewAudio();
    const playing = Boolean(audio.src && !audio.paused && !audio.ended);
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number(state.previewTrack?.duration) || 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const progress = $("#admin-preview-progress");
    progress.max = String(Math.max(0, duration));
    if (!progress.matches(":active")) progress.value = String(Math.min(current, duration || current));
    progress.style.setProperty("--preview-fill", `${duration > 0 ? Math.min(100, (current / duration) * 100) : 0}%`);
    $("#admin-preview-current").textContent = formatDuration(current);
    $("#admin-preview-duration").textContent = formatDuration(duration);
    setIcon($("#admin-preview-toggle"), playing ? "pause" : "play");
    $("#admin-preview-toggle").setAttribute("aria-label", playing ? "Pause preview" : "Play preview");

    const queueAvailable = state.previewSourceKind === "catalog" && previewQueue().length > 1;
    $("#admin-preview-previous").disabled = !queueAvailable;
    $("#admin-preview-next").disabled = !queueAvailable;

    $$('[data-release-preview]').forEach((button) => {
      const active = state.previewSourceKind === "catalog" && state.previewReleaseId === button.dataset.releasePreview;
      button.classList.toggle("is-previewing", active);
      button.textContent = active ? playing ? "Pause" : "Resume" : "Preview";
    });

    const selectedButton = $("#preview-selected-audio");
    if (selectedButton) {
      const active = state.previewSourceKind === "local";
      selectedButton.disabled = !state.audioFile;
      selectedButton.classList.toggle("is-previewing", active);
      setIcon(selectedButton, active && playing ? "pause" : "play");
      const label = selectedButton.querySelector("span:last-child");
      if (label) label.textContent = active ? playing ? "Pause selected MP3" : "Resume selected MP3" : "Test selected MP3";
    }

    if (navigator.mediaSession) {
      try { navigator.mediaSession.playbackState = playing ? "playing" : audio.src ? "paused" : "none"; } catch { /* Optional browser integration. */ }
    }
    updatePreviewPositionState();
  };

  const releasePreviewObjectUrl = () => {
    if (!state.previewObjectUrl) return;
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = "";
  };

  const closeAdminPreview = () => {
    const audio = previewAudio();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    releasePreviewObjectUrl();
    state.previewReleaseId = "";
    state.previewSourceKind = "";
    state.previewTrack = null;
    $("#admin-preview-player").hidden = true;
    document.body.classList.remove("admin-preview-active");
    if (navigator.mediaSession) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
      } catch { /* Optional browser integration. */ }
    }
    syncPreviewUi();
  };

  const configurePreviewMediaSession = (track) => {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    const artwork = track.coverUrl && !track.coverUrl.startsWith("blob:")
      ? [{ src: new URL(track.coverUrl, location.href).href, sizes: "512x512" }]
      : [];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: "Xotiic Upload private preview", artwork });
      navigator.mediaSession.setActionHandler("play", () => previewAudio().play().catch(() => undefined));
      navigator.mediaSession.setActionHandler("pause", () => previewAudio().pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => skipAdminPreview(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => skipAdminPreview(1));
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (!Number.isFinite(details.seekTime)) return;
        previewAudio().currentTime = Math.max(0, Math.min(details.seekTime, previewAudio().duration || details.seekTime));
      });
    } catch { /* Browser lock-screen controls are optional. */ }
  };

  const openAdminPreview = async ({ src, title, artist, coverUrl = "", status, duration = 0, releaseId = "", sourceKind, objectUrl = "" }) => {
    const audio = previewAudio();
    audio.pause();
    releasePreviewObjectUrl();
    state.previewObjectUrl = objectUrl;
    state.previewReleaseId = releaseId;
    state.previewSourceKind = sourceKind;
    state.previewTrack = { title, artist, coverUrl, status, duration };

    $("#admin-preview-title").textContent = title;
    $("#admin-preview-meta").textContent = `${artist} · Full-song playback`;
    $("#admin-preview-status").textContent = status;
    const art = $("#admin-preview-art");
    art.style.backgroundImage = coverUrl ? `url(${JSON.stringify(coverUrl)})` : "";
    art.textContent = coverUrl ? "" : "XD";
    $("#admin-preview-player").hidden = false;
    document.body.classList.add("admin-preview-active");

    audio.src = src;
    audio.load();
    configurePreviewMediaSession(state.previewTrack);
    syncPreviewUi();
    try {
      await audio.play();
    } catch {
      showToast("The preview is ready. Tap Play to start it.");
    }
    syncPreviewUi();
  };

  const playCatalogPreview = (id) => {
    const release = state.releases.find((entry) => entry.id === id);
    const src = releaseAssetUrl(release, release?.audio);
    if (!release || !src) {
      showToast("That release does not have a playable MP3 path.", "error");
      return;
    }
    openAdminPreview({
      src,
      title: text(release.title || "Untitled release"),
      artist: text(release.artist || "XotiicDuck"),
      coverUrl: releaseAssetUrl(release, release.cover),
      status: previewStatus(release),
      duration: Number(release.duration) || 0,
      releaseId: release.id,
      sourceKind: "catalog",
    });
  };

  const playSelectedPreview = () => {
    if (!state.audioFile) {
      showToast("Choose an MP3 before testing it.", "error");
      return;
    }
    const objectUrl = URL.createObjectURL(state.audioFile);
    openAdminPreview({
      src: objectUrl,
      title: $("#release-title").value.trim() || state.audioFile.name.replace(/\.mp3$/i, ""),
      artist: $("#release-artist").value.trim() || "XotiicDuck",
      coverUrl: state.coverObjectUrl,
      status: "LOCAL MP3 CHECK",
      duration: state.audioDuration,
      sourceKind: "local",
      objectUrl,
    });
  };

  const toggleAdminPreview = () => {
    const audio = previewAudio();
    if (!audio.src) return;
    if (audio.paused) audio.play().catch(() => showToast("This MP3 could not start in the browser.", "error"));
    else audio.pause();
  };

  function skipAdminPreview(direction) {
    if (state.previewSourceKind !== "catalog") return;
    const queue = previewQueue();
    if (queue.length < 2) return;
    const index = Math.max(0, queue.findIndex((release) => release.id === state.previewReleaseId));
    const next = queue[(index + direction + queue.length) % queue.length];
    if (next) playCatalogPreview(next.id);
  }

  const setView = (name) => {
    Object.entries(views).forEach(([key, element]) => { element.hidden = key !== name; });
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const setConnection = (online, label = online ? "OWNER VERIFIED" : "LOCKED") => {
    const pill = $("#connection-pill");
    pill.classList.toggle("online", online);
    pill.querySelector("span").textContent = label;
  };

  const setFormError = (selector, message = "") => {
    const element = $(selector);
    element.textContent = message;
    element.hidden = !message;
  };

  const friendlyError = (error) => {
    if (error instanceof GitHubError) {
      const messages = {
        TOKEN_INVALID: "GitHub rejected this token. Create a new fine-grained token and try again.",
        TOKEN_FORBIDDEN: "GitHub blocked this request. Check that the token has Contents: Read and write permission.",
        OWNER_MISMATCH: error.message,
        NO_WRITE_PERMISSION: "The token needs read and write access to the Xotiic-Songs repository.",
        BRANCH_MISSING: "The main branch is not online yet. Push this complete website to GitHub before opening the admin app.",
        BRANCH_CHANGED: "The repository changed during publishing. Refresh the catalog and publish again.",
        DUPLICATE_RELEASE: "That release ID is already used. Choose a different release ID.",
        CATALOG_FORMAT: "The GitHub catalog format has changed. Restore catalog.js before publishing.",
        CATALOG_PARSE: "GitHub's catalog.js contains invalid data and needs to be repaired.",
        RELEASE_MISSING: "That release changed or was removed. Refresh the catalog and try again.",
        RELEASE_ID_CHANGED: "A published release ID cannot be changed.",
        RELEASE_STATUS: "Choose Published, Scheduled, Draft, or Archived.",
      };
      return messages[error.code] || `GitHub error: ${error.message}`;
    }
    return error?.message || "Something went wrong. Please try again.";
  };

  const showToast = (message, type = "success") => {
    clearTimeout(state.toastTimer);
    const toast = $("#toast");
    setIcon($("#toast-icon"), type === "error" ? "alert" : "check");
    $("#toast-copy").textContent = message;
    toast.classList.toggle("error", type === "error");
    toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  };

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
    || document.referrer.startsWith("android-app://");

  const installDevice = (() => {
    const ua = navigator.userAgent || "";
    const ipad = /iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return {
      ios: /iPhone|iPod/i.test(ua) || ipad,
      ipad,
      android: /Android/i.test(ua),
      samsung: /SamsungBrowser/i.test(ua),
    };
  })();

  state.installAccepted = isStandalone();

  const updateInstallButton = () => {
    const installed = isStandalone() || state.installAccepted;
    const button = $("[data-install]");
    const label = button?.querySelector("[data-install-label]");
    const icon = button?.querySelector("[data-install-icon]");
    if (label) label.textContent = installed ? "Installed" : "Install";
    if (icon) setIcon(icon, installed ? "check" : "download");
    if (button) {
      button.classList.toggle("is-installed", installed);
      button.setAttribute("aria-label", installed ? "Xotiic Upload is installed" : "Install Xotiic Upload");
      button.title = installed ? "Already installed. Tap for details" : "Install Xotiic Upload";
    }
  };

  const installHelp = (status = "manual") => {
    if (isStandalone() || state.installAccepted || status === "accepted" || status === "installed") {
      return {
        label: "CONSOLE READY",
        title: status === "accepted" ? "Installation accepted" : "Xotiic Upload is installed",
        steps: ["Leave the browser and search your Home screen or app list for <strong>Xotiic Upload</strong>.", "Open it from that icon whenever you need to publish a song."],
        note: "The encrypted owner setup is stored separately in each browser/app installation. Complete setup once inside the installed console if it asks again.",
      };
    }
    if (installDevice.ios) {
      return {
        label: installDevice.ipad ? "INSTALL ON IPAD" : "INSTALL ON IPHONE",
        title: "Add the console from Safari",
        steps: ["Open this page in <strong>Safari</strong>.", "Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.", "Turn on <strong>Open as Web App</strong> and tap <strong>Add</strong>."],
        note: "Apple does not show the same automatic web-app prompt as Chrome, so the Safari steps are required.",
      };
    }
    if (installDevice.samsung) {
      return {
        label: "INSTALL ON SAMSUNG INTERNET",
        title: "Add the console to your Galaxy",
        steps: ["Open the Samsung Internet menu <strong>☰</strong>.", "Tap <strong>Add page to</strong>.", "Choose <strong>Home screen</strong> or <strong>Install app</strong>, then confirm."],
        note: "After it is added, search the Home screen or app list for Xotiic Upload.",
      };
    }
    if (installDevice.android) {
      return {
        label: "INSTALL ON ANDROID",
        title: "Add the console from your browser",
        steps: ["Open the browser menu <strong>⋮</strong>.", "Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.", "Confirm, then open Xotiic Upload from the new icon."],
        note: "If the option is missing, refresh once and wait a few seconds for the console files to finish saving.",
      };
    }
    return {
      label: "INSTALL ARTIST CONSOLE",
      title: "Add Xotiic Upload to this device",
      steps: ["Open this page in Chrome or Microsoft Edge.", "Use the install icon in the address bar or choose <strong>Install Xotiic Upload</strong> from the browser menu.", "Confirm and launch it from your apps."],
      note: "Safari on Mac uses File → Add to Dock. The console still works in browsers without installation support.",
    };
  };

  const openInstallHelp = (status = "manual") => {
    const content = installHelp(status);
    $("#install-help-label").textContent = content.label;
    $("#install-help-title").textContent = content.title;
    $("#install-help-copy").innerHTML = `<ol>${content.steps.map((step) => `<li><span class="install-step-copy">${step}</span></li>`).join("")}</ol><p>${content.note}</p>`;
    $("#install-help-layer").hidden = false;
    document.body.classList.add("modal-open");
  };

  const closeInstallHelp = () => {
    $("#install-help-layer").hidden = true;
    document.body.classList.remove("modal-open");
  };

  const requestInstall = async () => {
    if (isStandalone() || state.installAccepted) {
      openInstallHelp("installed");
      return;
    }
    if (!state.installPrompt) {
      openInstallHelp("manual");
      return;
    }
    const prompt = state.installPrompt;
    state.installPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        state.installAccepted = true;
        updateInstallButton();
        openInstallHelp("accepted");
      } else {
        openInstallHelp("manual");
      }
    } catch {
      openInstallHelp("manual");
    }
  };

  const makePublisher = (token) => new GitHubPublisher({
    token,
    owner: config.owner,
    repository: config.repository,
    branch: config.branch,
    requiredLogin: config.requiredGitHubLogin,
    apiVersion: config.githubApiVersion,
  });

  const setButtonBusy = (button, busy, label) => {
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.querySelector("span")?.textContent || button.textContent;
    button.disabled = busy;
    const target = button.querySelector("span") || button;
    target.textContent = busy ? label : button.dataset.defaultLabel;
  };

  const resetIdleTimer = () => {
    if (!state.token) return;
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => lockConsole("Console locked after being idle."), config.sessionMinutes * 60 * 1000);
  };

  const lockConsole = (message = "") => {
    closeAdminPreview();
    state.token = "";
    state.publisher = null;
    state.pendingRelease = null;
    state.busy = false;
    clearTimeout(state.idleTimer);
    $("#progress-modal").hidden = true;
    $("#review-modal").hidden = true;
    $("#edit-release-modal").hidden = true;
    document.body.classList.remove("modal-open");
    setConnection(false);
    const vault = vaultApi.readVault();
    if (vault) {
      $("#login-username").value = vault.username || "";
      $("#login-password").value = "";
      setView("login");
      if (message) showToast(message);
    } else {
      setView("setup");
    }
  };

  const enterDashboard = async (username) => {
    $("#owner-name").textContent = username;
    setConnection(true);
    setView("dashboard");
    resetIdleTimer();
    await loadCatalog({ silent: false }).catch(() => undefined);
    const requestedPanel = new URLSearchParams(location.search).get("panel");
    selectAdminPanel(["overview", "upload", "releases", "security"].includes(requestedPanel) ? requestedPanel : "overview");
  };

  const loadCatalog = async ({ silent = false } = {}) => {
    const loading = $("#catalog-loading");
    const list = $("#release-list");
    const empty = $("#manage-empty");
    if (!silent) {
      loading.hidden = false;
      list.hidden = true;
      empty.hidden = true;
      $("#catalog-health").textContent = "Checking catalog...";
    }
    try {
      const result = await state.publisher.getCatalog();
      state.releases = result.releases;
      renderReleases();
      $("#catalog-health").textContent = `${state.releases.length} release${state.releases.length === 1 ? "" : "s"} connected`;
      return state.releases;
    } catch (error) {
      loading.hidden = true;
      $("#catalog-health").textContent = "Catalog unavailable";
      if (!silent) showToast(friendlyError(error), "error");
      throw error;
    }
  };

  const refreshDiagnostics = async () => {
    $("#diagnostics-catalog").textContent = `Version ${window.XotiicGitHub?.CATALOG_VERSION || 1} ready`;
    $("#diagnostics-network").textContent = navigator.onLine ? "Online" : "Offline";
    let storage = "Available";
    try {
      if (navigator.storage?.persisted) storage = await navigator.storage.persisted() ? "Persistent" : "Browser managed";
    } catch { /* Storage status is informational only. */ }
    $("#diagnostics-storage").textContent = storage;
    $("#diagnostics-state").textContent = navigator.onLine ? "READY" : "OFFLINE";
    $("#diagnostics-state").classList.toggle("warning", !navigator.onLine);
  };

  const renderOverview = () => {
    const statuses = state.releases.map((release) => effectiveStatus(release));
    $("#overview-live").textContent = String(statuses.filter((status) => status === "published").length);
    $("#overview-scheduled").textContent = String(statuses.filter((status) => status === "scheduled").length);
    $("#overview-drafts").textContent = String(statuses.filter((status) => status === "draft").length);
    $("#overview-archived").textContent = String(statuses.filter((status) => status === "archived").length);

    const next = state.releases
      .filter((release) => effectiveStatus(release) === "scheduled")
      .sort((left, right) => Date.parse(left.releaseAt) - Date.parse(right.releaseAt))[0];
    const target = $("#overview-next-release");
    target.replaceChildren();
    if (next) {
      const coverUrl = releaseAssetUrl(next, next.cover);
      const cover = coverUrl ? document.createElement("img") : document.createElement("span");
      if (coverUrl) { cover.src = coverUrl; cover.alt = ""; }
      else { cover.className = "overview-empty-icon"; cover.textContent = "XD"; }
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = text(next.title || "Untitled release");
      const time = document.createElement("p");
      time.textContent = `Goes live ${formatReleaseMoment(next)}`;
      copy.append(title, time);
      target.append(cover, copy);
    } else {
      const icon = document.createElement("span");
      icon.className = "overview-empty-icon";
      icon.textContent = "–";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = "No release is scheduled";
      const note = document.createElement("p");
      note.textContent = "Choose Schedule when preparing the next song.";
      copy.append(title, note);
      target.append(icon, copy);
    }
    refreshDiagnostics().catch(() => undefined);
  };

  const renderReleases = () => {
    const loading = $("#catalog-loading");
    const list = $("#release-list");
    const empty = $("#manage-empty");
    loading.hidden = true;
    $("#release-count-badge").textContent = String(state.releases.filter((release) => effectiveStatus(release) !== "archived").length);
    renderOverview();
    $$('[data-release-filter]').forEach((button) => button.classList.toggle("active", button.dataset.releaseFilter === state.releaseFilter));
    const filtered = state.releases
      .map((release, index) => ({ release, timestamp: releaseTimestamp(release, index) }))
      .filter(({ release }) => state.releaseFilter === "all" || effectiveStatus(release) === state.releaseFilter)
      .sort((left, right) => right.timestamp - left.timestamp)
      .map(({ release }) => release);
    list.replaceChildren();
    if (!filtered.length) {
      list.hidden = true;
      empty.hidden = false;
      $("#manage-empty h3").textContent = state.releases.length ? `No ${state.releaseFilter === "all" ? "matching" : state.releaseFilter} releases` : "No releases yet";
      $("#manage-empty p").textContent = state.releases.length ? "Choose another filter to see the rest of your catalog." : "Your first published song will appear here.";
      $("#manage-empty button").hidden = state.releases.length > 0;
      return;
    }
    $("#manage-empty button").hidden = false;
    empty.hidden = true;
    list.hidden = false;

    filtered.forEach((release) => {
      const row = document.createElement("article");
      row.className = "managed-release";
      const coverUrl = releaseAssetUrl(release, release.cover);
      const cover = coverUrl ? document.createElement("img") : document.createElement("span");
      if (coverUrl) {
        cover.src = coverUrl;
        cover.alt = `${text(release.title)} cover`;
        cover.loading = "lazy";
      } else {
        cover.className = "managed-cover-fallback";
        cover.textContent = "XD";
      }

      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = text(release.title || "Untitled release");
      const metadata = document.createElement("p");
      const releaseType = text(release.releaseType || release.album || "Single");
      const collection = text(release.collection).trim();
      metadata.textContent = `${text(release.artist || "XotiicDuck")} · ${collection || releaseType} · ${formatDuration(Number(release.duration))}`;
      const id = document.createElement("small");
      id.textContent = `${formatReleaseMoment(release)} · ${text(release.id)}`;
      copy.append(title, metadata, id);

      const actions = document.createElement("div");
      actions.className = "managed-release-actions";
      const status = document.createElement("span");
      const sourceStatus = ["published", "scheduled", "draft", "archived"].includes(release.status) ? release.status : "draft";
      const displayStatus = effectiveStatus(release);
      const autoLive = sourceStatus === "scheduled" && displayStatus === "published";
      status.className = `status-chip ${displayStatus}`;
      status.textContent = autoLive ? "LIVE · AUTO" : displayStatus === "published" ? "LIVE" : displayStatus.toUpperCase();
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.releaseToggle = text(release.id);
      toggle.dataset.nextStatus = displayStatus === "published" ? "draft" : "published";
      toggle.textContent = displayStatus === "published" ? "Hide" : sourceStatus === "scheduled" ? "Publish now" : "Publish";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.dataset.releaseEdit = text(release.id);
      edit.textContent = "Edit";
      const preview = document.createElement("button");
      preview.type = "button";
      preview.dataset.releasePreview = text(release.id);
      preview.textContent = "Preview";
      preview.title = `Play the complete ${sourceStatus} MP3 in the private console`;
      const archive = document.createElement("button");
      archive.type = "button";
      archive.className = sourceStatus === "archived" ? "" : "danger";
      if (sourceStatus === "archived") archive.dataset.releaseRestore = text(release.id);
      else archive.dataset.releaseArchive = text(release.id);
      archive.textContent = sourceStatus === "archived" ? "Restore draft" : "Archive";
      actions.append(status, preview, edit, toggle, archive);
      row.append(cover, copy, actions);
      list.append(row);
    });
    syncPreviewUi();
  };

  const selectAdminPanel = (name) => {
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
    $$('[data-admin-panel]').forEach((button) => button.classList.toggle("active", button.dataset.adminPanel === name));
    const headings = {
      overview: ["Release overview", "See what is live, scheduled, drafted, and ready for your next move."],
      upload: ["Publish a new release", "Upload the final MP3 and square artwork from this device."],
      releases: ["Manage your catalog", "Publish, schedule, edit, hide, or archive releases connected to GitHub."],
      security: ["Security and access", "Maintain the encrypted owner vault on this device."],
    };
    $("#dashboard-title").textContent = headings[name][0];
    $("#dashboard-subtitle").textContent = headings[name][1];
    if (name === "overview") renderOverview();
    if (name === "releases") loadCatalog().catch(() => undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const readAudioDuration = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("audio");
    const cleanup = () => { URL.revokeObjectURL(url); probe.remove(); };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const duration = Number(probe.duration);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error("The MP3 duration could not be detected."));
      else resolve(Math.round(duration));
    };
    probe.onerror = () => { cleanup(); reject(new Error("This MP3 could not be read by the browser.")); };
    probe.src = url;
  });

  const readImageSize = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight, url };
      resolve(dimensions);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This cover image could not be read.")); };
    image.src = url;
  });

  const prepareCoverFile = async (file) => {
    const dimensions = await readImageSize(file);
    const ratio = dimensions.width / dimensions.height;
    if (ratio < 0.97 || ratio > 1.03) {
      URL.revokeObjectURL(dimensions.url);
      throw new Error(`The cover must be square. This image is ${dimensions.width} × ${dimensions.height}.`);
    }
    if (dimensions.width <= 1600 && dimensions.height <= 1600 && file.size <= 2 * 1024 * 1024) {
      return { file, width: dimensions.width, height: dimensions.height, url: dimensions.url, optimized: false };
    }

    try {
      const image = new Image();
      image.src = dimensions.url;
      await image.decode();
      const size = Math.min(1400, dimensions.width, dimensions.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, size, size);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The optimized cover could not be created.")), "image/webp", 0.9));
      URL.revokeObjectURL(dimensions.url);
      const name = `${file.name.replace(/\.[^.]+$/, "") || "cover"}.webp`;
      const optimized = new File([blob], name, { type: "image/webp", lastModified: Date.now() });
      return { file: optimized, width: size, height: size, url: URL.createObjectURL(optimized), optimized: true };
    } catch {
      return { file, width: dimensions.width, height: dimensions.height, url: dimensions.url, optimized: false };
    }
  };

  const updateReleaseSummary = () => {
    const title = $("#release-title").value.trim();
    const audioReady = Boolean(state.audioFile && state.audioDuration);
    const coverReady = Boolean(state.coverFile && state.coverObjectUrl);
    const mode = selectedReleaseMode();
    const visibility = mode === "published" ? "Publishes now" : mode === "scheduled" ? "Scheduled release" : "Hidden draft";
    $("#summary-title").textContent = title || "Waiting for release details";
    $("#summary-meta").textContent = audioReady && coverReady
      ? `${formatDuration(state.audioDuration)} · ${visibility}`
      : "MP3 and cover required";
    const summaryArt = $("#summary-art");
    summaryArt.style.backgroundImage = coverReady ? `url(${JSON.stringify(state.coverObjectUrl).slice(1, -1)})` : "";
    summaryArt.textContent = coverReady ? "" : "XD";
  };

  const defaultScheduleValue = () => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
    return localDateTime(date);
  };

  const updateReleaseMode = () => {
    const scheduled = selectedReleaseMode() === "scheduled";
    $$(".release-mode-selector label").forEach((label) => label.classList.toggle("is-selected", Boolean(label.querySelector("input")?.checked)));
    $("#schedule-fields").hidden = !scheduled;
    $("#release-schedule").required = scheduled;
    if (scheduled && !$("#release-schedule").value) $("#release-schedule").value = defaultScheduleValue();
    $("#release-date").value = scheduled ? $("#release-schedule").value.slice(0, 10) : localDate();
    updateReleaseSummary();
  };

  const updateEditScheduleVisibility = () => {
    const scheduled = $("#edit-status").value === "scheduled";
    $("#edit-schedule-field").hidden = !scheduled;
    $("#edit-schedule").required = scheduled;
    if (scheduled && !$("#edit-schedule").value) $("#edit-schedule").value = defaultScheduleValue();
  };

  const draftValue = (selector, maximum) => $(selector).value.trim().slice(0, maximum);

  const clearReleaseDraft = ({ quiet = false } = {}) => {
    clearTimeout(state.draftTimer);
    try { localStorage.removeItem(RELEASE_DRAFT_KEY); } catch { /* Draft storage may be unavailable in private mode. */ }
    $("#release-draft-banner").hidden = true;
    $("#metadata-save-state").textContent = "LOCAL DRAFT READY";
    if (!quiet) showToast("Local release draft discarded.");
  };

  const saveReleaseDraft = () => {
    if (state.suppressDraftSave) return;
    const mode = selectedReleaseMode();
    const draft = {
      version: 2,
      updatedAt: Date.now(),
      title: draftValue("#release-title", 100),
      artist: draftValue("#release-artist", 80),
      album: $("#release-album").value,
      collection: draftValue("#release-collection", 100),
      trackNumber: Math.max(0, Math.floor(Number($("#release-track-number").value) || 0)),
      genre: draftValue("#release-genre", 60),
      franchise: draftValue("#release-franchise", 80),
      mood: draftValue("#release-mood", 60),
      tags: draftValue("#release-tags", 240),
      credits: draftValue("#release-credits", 500),
      explicit: $("#release-explicit").checked,
      id: draftValue("#release-id", 80),
      youtube: draftValue("#release-youtube", 500),
      description: $("#release-description").value.slice(0, 280),
      lyrics: $("#release-lyrics").value.slice(0, 30000),
      mode,
      schedule: mode === "scheduled" ? $("#release-schedule").value : "",
    };
    const meaningful = draft.title || draft.id || draft.youtube || draft.description || draft.lyrics || draft.collection || draft.trackNumber || draft.franchise || draft.mood || draft.tags || draft.credits || draft.explicit
      || draft.artist !== "XotiicDuck" || draft.genre !== "Anime J-Rock" || draft.album !== "Single" || draft.mode !== "published";
    if (!meaningful) {
      clearReleaseDraft({ quiet: true });
      return;
    }
    try {
      localStorage.setItem(RELEASE_DRAFT_KEY, JSON.stringify(draft));
      $("#metadata-save-state").textContent = "SAVED LOCALLY";
    } catch {
      $("#metadata-save-state").textContent = "DRAFT NOT SAVED";
    }
  };

  const scheduleReleaseDraftSave = (event) => {
    if (state.suppressDraftSave || event?.target?.matches?.('input[type="file"], #release-duration, #release-date')) return;
    clearTimeout(state.draftTimer);
    $("#metadata-save-state").textContent = "SAVING...";
    state.draftTimer = setTimeout(saveReleaseDraft, 420);
  };

  const restoreReleaseDraft = () => {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(RELEASE_DRAFT_KEY) || "null"); } catch { draft = null; }
    if (!draft || ![1, 2].includes(draft.version) || !Number.isFinite(draft.updatedAt)) return false;
    const albums = ["Single", "EP", "Album", "Soundtrack"];
    const modes = ["published", "scheduled", "draft"];
    state.suppressDraftSave = true;
    $("#release-title").value = text(draft.title).slice(0, 100);
    $("#release-artist").value = text(draft.artist).slice(0, 80) || "XotiicDuck";
    $("#release-album").value = albums.includes(draft.album) ? draft.album : "Single";
    $("#release-collection").value = text(draft.collection).slice(0, 100);
    $("#release-track-number").value = Number(draft.trackNumber) > 0 ? String(Math.min(999, Math.floor(Number(draft.trackNumber)))) : "";
    $("#release-genre").value = text(draft.genre).slice(0, 60) || "Anime J-Rock";
    $("#release-franchise").value = text(draft.franchise).slice(0, 80);
    $("#release-mood").value = text(draft.mood).slice(0, 60);
    $("#release-tags").value = text(draft.tags).slice(0, 240);
    $("#release-credits").value = text(draft.credits).slice(0, 500);
    $("#release-explicit").checked = draft.explicit === true;
    $("#release-id").value = slugify(text(draft.id));
    $("#release-youtube").value = text(draft.youtube).slice(0, 500);
    $("#release-description").value = text(draft.description).slice(0, 280);
    $("#release-lyrics").value = text(draft.lyrics).slice(0, 30000);
    const mode = modes.includes(draft.mode) ? draft.mode : "published";
    const modeInput = $(`input[name='release-mode'][value='${mode}']`);
    if (modeInput) modeInput.checked = true;
    const scheduledAt = Date.parse(text(draft.schedule));
    $("#release-schedule").value = mode === "scheduled" && Number.isFinite(scheduledAt) && scheduledAt > Date.now() + 60000
      ? text(draft.schedule).slice(0, 16)
      : defaultScheduleValue();
    state.idTouched = Boolean($("#release-id").value);
    $("#description-count").textContent = String($("#release-description").value.length);
    $("#lyrics-count").textContent = String($("#release-lyrics").value.length);
    state.suppressDraftSave = false;
    updateReleaseMode();
    updateReleaseSummary();
    $("#release-draft-banner").hidden = false;
    $("#metadata-save-state").textContent = "RESTORED LOCALLY";
    return true;
  };

  const resetReleaseForm = ({ clearDraft = false } = {}) => {
    if (state.previewSourceKind === "local") closeAdminPreview();
    state.suppressDraftSave = true;
    $("#release-form").reset();
    $("#release-artist").value = "XotiicDuck";
    $("#release-genre").value = "Anime J-Rock";
    $("#release-date").value = localDate();
    $("input[name='release-mode'][value='published']").checked = true;
    $("#release-schedule").value = defaultScheduleValue();
    $("#audio-file-name").textContent = "Choose the final MP3";
    $("#audio-file-meta").textContent = `Tap to open Files · Maximum ${formatBytes(config.maxAudioBytes)}`;
    $("#cover-file-name").textContent = "Choose cover artwork";
    $("#cover-file-meta").textContent = "JPG, PNG or WebP · Square image";
    $("#audio-drop").classList.remove("has-file");
    $("#cover-drop").classList.remove("has-file");
    if (state.coverObjectUrl) URL.revokeObjectURL(state.coverObjectUrl);
    state.audioFile = null;
    state.coverFile = null;
    state.audioDuration = 0;
    state.coverWidth = 0;
    state.coverHeight = 0;
    state.coverObjectUrl = "";
    state.pendingRelease = null;
    state.idTouched = false;
    const preview = $("#cover-preview");
    preview.style.backgroundImage = "";
    preview.classList.remove("has-image");
    $("#summary-art").style.backgroundImage = "";
    $("#review-cover").style.backgroundImage = "";
    $("#description-count").textContent = "0";
    $("#lyrics-count").textContent = "0";
    $("#release-draft-banner").hidden = true;
    state.suppressDraftSave = false;
    if (clearDraft) clearReleaseDraft({ quiet: true });
    updateReleaseMode();
    updateReleaseSummary();
    syncPreviewUi();
  };

  const coverExtension = (file) => {
    const fileExtension = file.name.toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1];
    if (fileExtension) return fileExtension === "jpeg" ? "jpg" : fileExtension;
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    return "jpg";
  };

  const buildPendingRelease = () => {
    const id = $("#release-id").value.trim();
    const description = $("#release-description").value.trim();
    const lyrics = $("#release-lyrics").value.trim();
    const youtubeUrl = safeYouTubeUrl($("#release-youtube").value);
    const mode = selectedReleaseMode();
    const now = new Date().toISOString();
    const scheduleValue = $("#release-schedule").value;
    const releaseType = $("#release-album").value;
    const collection = $("#release-collection").value.trim();
    const trackNumber = Math.max(0, Math.floor(Number($("#release-track-number").value) || 0));
    const franchise = $("#release-franchise").value.trim();
    const mood = $("#release-mood").value.trim();
    const tags = parseTags($("#release-tags").value);
    const credits = $("#release-credits").value.trim();
    const release = {
      id,
      title: $("#release-title").value.trim(),
      artist: $("#release-artist").value.trim(),
      album: releaseType,
      releaseType,
      genre: $("#release-genre").value.trim(),
      releaseDate: mode === "scheduled" ? scheduleValue.slice(0, 10) : localDate(),
      duration: state.audioDuration,
      audio: `music/${id}.mp3`,
      cover: `covers/${id}.${coverExtension(state.coverFile)}`,
      status: mode,
      createdAt: now,
      updatedAt: now,
    };
    if (mode === "published") release.publishedAt = now;
    if (mode === "scheduled") release.releaseAt = new Date(scheduleValue).toISOString();
    if (description) release.description = description;
    if (lyrics) release.lyrics = lyrics;
    if (youtubeUrl) release.youtubeUrl = youtubeUrl;
    if (collection) release.collection = collection;
    if (trackNumber) release.trackNumber = trackNumber;
    if (franchise) release.franchise = franchise;
    if (mood) release.mood = mood;
    if (tags.length) release.tags = tags;
    if (credits) release.credits = credits;
    if ($("#release-explicit").checked) release.explicit = true;
    return release;
  };

  const validateReleaseForm = () => {
    const form = $("#release-form");
    if (!form.reportValidity()) return false;
    if (!state.audioFile || !state.audioDuration) {
      showToast("Choose a valid MP3 first.", "error");
      return false;
    }
    if (!state.coverFile || !state.coverObjectUrl) {
      showToast("Choose a valid square cover first.", "error");
      return false;
    }
    const id = $("#release-id").value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      showToast("The release ID can use lowercase letters, numbers, and hyphens.", "error");
      return false;
    }
    if (state.releases.some((entry) => entry.id === id)) {
      showToast("That release ID is already in your catalog.", "error");
      return false;
    }
    if ($("#release-youtube").value.trim() && !safeYouTubeUrl($("#release-youtube").value)) {
      showToast("Use a valid HTTPS youtube.com or youtu.be link.", "error");
      return false;
    }
    if (selectedReleaseMode() === "scheduled") {
      const scheduledAt = new Date($("#release-schedule").value).getTime();
      if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now() + 60 * 1000) {
        showToast("Choose a scheduled time at least one minute in the future.", "error");
        return false;
      }
    }
    return true;
  };

  const openReview = () => {
    if (!validateReleaseForm()) return;
    state.pendingRelease = buildPendingRelease();
    $("#review-song-title").textContent = state.pendingRelease.title;
    $("#review-song-meta").textContent = `${state.pendingRelease.artist} · ${state.pendingRelease.collection || state.pendingRelease.releaseType || state.pendingRelease.album} · ${formatDuration(state.pendingRelease.duration)}`;
    $("#review-file-meta").textContent = `${state.audioFile.name} · ${formatBytes(state.audioFile.size)}`;
    $("#review-visibility").textContent = state.pendingRelease.status === "published"
      ? "This release will become public after GitHub Pages finishes its deployment."
      : state.pendingRelease.status === "scheduled"
        ? `This release stays hidden until ${formatReleaseMoment(state.pendingRelease)}, then appears automatically.`
        : "This release will be uploaded as a hidden draft and will not appear in the public player.";
    $("#publish-release").querySelector("span").textContent = state.pendingRelease.status === "published" ? "Publish to GitHub" : state.pendingRelease.status === "scheduled" ? "Schedule on GitHub" : "Save draft to GitHub";
    const cover = $("#review-cover");
    cover.style.backgroundImage = `url(${JSON.stringify(state.coverObjectUrl).slice(1, -1)})`;
    cover.textContent = "";
    $("#review-modal").hidden = false;
  };

  const closeReview = () => {
    if (!state.busy) $("#review-modal").hidden = true;
  };

  const updateProgress = (_step, ratio, message) => {
    const percentage = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    $("#progress-title").textContent = message;
    $("#progress-copy").textContent = percentage < 100 ? "Securely writing to x-s-m-x/Xotiic-Songs..." : "The GitHub commit completed successfully.";
    $("#progress-bar").style.width = `${percentage}%`;
    $("#progress-percent").textContent = `${percentage}%`;
  };

  const publishPendingRelease = async () => {
    if (!state.pendingRelease || state.busy) return;
    const pendingStatus = state.pendingRelease.status;
    state.busy = true;
    $("#review-modal").hidden = true;
    $("#progress-modal").hidden = false;
    updateProgress("start", 0, "Starting secure publish");
    try {
      const result = await state.publisher.publishRelease({
        release: state.pendingRelease,
        audioFile: state.audioFile,
        coverFile: state.coverFile,
        onStep: updateProgress,
      });
      state.releases = result.releases;
      renderReleases();
      $("#catalog-health").textContent = `${state.releases.length} release${state.releases.length === 1 ? "" : "s"} connected`;
      await new Promise((resolve) => setTimeout(resolve, 650));
      $("#progress-modal").hidden = true;
      resetReleaseForm({ clearDraft: true });
      showToast(pendingStatus === "scheduled" ? "Release scheduled. It will appear automatically at the chosen time." : pendingStatus === "draft" ? "Draft saved privately in the catalog." : "Release committed. GitHub Pages will update the player shortly.");
    } catch (error) {
      $("#progress-modal").hidden = true;
      showToast(friendlyError(error), "error");
    } finally {
      state.busy = false;
      resetIdleTimer();
    }
  };

  const closeReleaseEditor = () => {
    if (state.busy) return;
    $("#edit-release-modal").hidden = true;
    document.body.classList.remove("modal-open");
    state.editReleaseId = null;
    state.editAudioFile = null;
    state.editAudioDuration = 0;
    state.editCoverFile = null;
    $("#edit-release-form").reset();
    $("#edit-audio-copy").textContent = "Keep current MP3";
    $("#edit-cover-copy").textContent = "Keep current cover";
  };

  const openReleaseEditor = (id) => {
    const release = state.releases.find((entry) => entry.id === id);
    if (!release) return;
    state.editReleaseId = release.id;
    state.editAudioFile = null;
    state.editAudioDuration = 0;
    state.editCoverFile = null;
    $("#edit-release-id").textContent = `Release ID: ${release.id} · ID cannot be changed`;
    $("#edit-title").value = text(release.title);
    $("#edit-artist").value = text(release.artist || "XotiicDuck");
    const album = $("#edit-album");
    const releaseType = text(release.releaseType || release.album || "Single");
    if (![...album.options].some((option) => option.value === releaseType)) album.add(new Option(releaseType, releaseType));
    album.value = releaseType;
    $("#edit-collection").value = text(release.collection);
    $("#edit-track-number").value = Number(release.trackNumber) > 0 ? String(Math.min(999, Math.floor(Number(release.trackNumber)))) : "";
    $("#edit-genre").value = text(release.genre || "Music");
    $("#edit-franchise").value = text(release.franchise);
    $("#edit-mood").value = text(release.mood);
    $("#edit-tags").value = Array.isArray(release.tags) ? release.tags.join(", ") : text(release.tags);
    $("#edit-credits").value = text(release.credits);
    $("#edit-explicit").checked = release.explicit === true;
    const editorStatus = effectiveStatus(release);
    $("#edit-status").value = editorStatus;
    $("#edit-schedule").value = release.status === "scheduled" && isoToLocalDateTime(release.releaseAt) ? isoToLocalDateTime(release.releaseAt) : defaultScheduleValue();
    $("#edit-date").value = /^\d{4}-\d{2}-\d{2}$/.test(text(release.releaseDate)) ? release.releaseDate : localDate();
    updateEditScheduleVisibility();
    $("#edit-youtube").value = text(release.youtubeUrl || release.youtube);
    $("#edit-description").value = text(release.description);
    $("#edit-lyrics").value = text(release.lyrics);
    $("#edit-audio-file").value = "";
    $("#edit-cover-file").value = "";
    $("#edit-audio-copy").textContent = `Current: ${text(release.audio)} · ${formatDuration(Number(release.duration))}`;
    $("#edit-cover-copy").textContent = `Current: ${text(release.cover)}`;
    $("#edit-release-modal").hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => $("#edit-title").focus());
  };

  const saveReleaseEdit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (state.busy || !state.editReleaseId || !form.reportValidity()) return;
    const previous = state.releases.find((entry) => entry.id === state.editReleaseId);
    if (!previous) { showToast("That release is no longer in the catalog.", "error"); return; }
    const youtubeInput = $("#edit-youtube").value.trim();
    const youtubeUrl = safeYouTubeUrl(youtubeInput);
    if (youtubeInput && !youtubeUrl) { showToast("Use a valid HTTPS youtube.com or youtu.be link.", "error"); return; }

    const nextStatus = $("#edit-status").value;
    const now = new Date().toISOString();
    const scheduleValue = $("#edit-schedule").value;
    if (nextStatus === "scheduled") {
      const scheduledAt = new Date(scheduleValue).getTime();
      if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now() + 60 * 1000) {
        showToast("Choose a scheduled time at least one minute in the future.", "error");
        return;
      }
    }

    const previousEffectiveStatus = effectiveStatus(previous);
    const releaseType = $("#edit-album").value;
    const collection = $("#edit-collection").value.trim();
    const trackNumber = Math.max(0, Math.floor(Number($("#edit-track-number").value) || 0));
    const franchise = $("#edit-franchise").value.trim();
    const mood = $("#edit-mood").value.trim();
    const tags = parseTags($("#edit-tags").value);
    const credits = $("#edit-credits").value.trim();
    const next = {
      ...previous,
      title: $("#edit-title").value.trim(),
      artist: $("#edit-artist").value.trim(),
      album: releaseType,
      releaseType,
      genre: $("#edit-genre").value.trim(),
      releaseDate: nextStatus === "scheduled"
        ? scheduleValue.slice(0, 10)
        : nextStatus === "published" && previousEffectiveStatus !== "published"
          ? localDate()
          : /^\d{4}-\d{2}-\d{2}$/.test(text(previous.releaseDate)) ? previous.releaseDate : localDate(),
      duration: state.editAudioFile ? state.editAudioDuration : Number(previous.duration),
      audio: state.editAudioFile ? `music/${previous.id}.mp3` : previous.audio,
      cover: state.editCoverFile ? `covers/${previous.id}.${coverExtension(state.editCoverFile)}` : previous.cover,
      status: nextStatus,
      createdAt: previous.createdAt || now,
      updatedAt: now,
    };
    if (nextStatus === "published") {
      next.publishedAt = previousEffectiveStatus === "published" ? previous.publishedAt || now : now;
      delete next.releaseAt;
      delete next.archivedAt;
    } else if (nextStatus === "scheduled") {
      next.releaseAt = new Date(scheduleValue).toISOString();
      delete next.publishedAt;
      delete next.archivedAt;
    } else if (nextStatus === "archived") {
      next.archivedAt = previous.archivedAt || now;
      delete next.publishedAt;
      delete next.releaseAt;
    } else {
      delete next.publishedAt;
      delete next.releaseAt;
      delete next.archivedAt;
    }
    const description = $("#edit-description").value.trim();
    const lyrics = $("#edit-lyrics").value.trim();
    if (description) next.description = description; else delete next.description;
    if (lyrics) next.lyrics = lyrics; else delete next.lyrics;
    if (collection) next.collection = collection; else delete next.collection;
    if (trackNumber) next.trackNumber = trackNumber; else delete next.trackNumber;
    if (franchise) next.franchise = franchise; else delete next.franchise;
    if (mood) next.mood = mood; else delete next.mood;
    if (tags.length) next.tags = tags; else delete next.tags;
    if (credits) next.credits = credits; else delete next.credits;
    if ($("#edit-explicit").checked) next.explicit = true; else delete next.explicit;
    delete next.youtube;
    if (youtubeUrl) next.youtubeUrl = youtubeUrl; else delete next.youtubeUrl;

    state.busy = true;
    $("#edit-release-modal").hidden = true;
    document.body.classList.remove("modal-open");
    $("#progress-modal").hidden = false;
    updateProgress("start", 0, "Starting secure release update");
    try {
      const result = await state.publisher.updateRelease({
        id: previous.id,
        release: next,
        audioFile: state.editAudioFile,
        coverFile: state.editCoverFile,
        onStep: updateProgress,
      });
      state.releases = result.releases;
      renderReleases();
      $("#catalog-health").textContent = `${state.releases.length} release${state.releases.length === 1 ? "" : "s"} connected`;
      await new Promise((resolve) => setTimeout(resolve, 450));
      $("#progress-modal").hidden = true;
      state.editReleaseId = null;
      state.editAudioFile = null;
      state.editAudioDuration = 0;
      state.editCoverFile = null;
      form.reset();
      showToast("Release update committed. The player will refresh after GitHub Pages deploys.");
    } catch (error) {
      $("#progress-modal").hidden = true;
      $("#edit-release-modal").hidden = false;
      document.body.classList.add("modal-open");
      showToast(friendlyError(error), "error");
    } finally {
      state.busy = false;
      resetIdleTimer();
    }
  };

  const setup = async (event) => {
    event.preventDefault();
    if (state.busy) return;
    const username = $("#setup-username").value.trim();
    const password = $("#setup-password").value;
    const confirm = $("#setup-confirm").value;
    const token = $("#setup-token").value.trim();
    setFormError("#setup-error");
    if (password !== confirm) {
      setFormError("#setup-error", "The two passwords do not match.");
      return;
    }
    state.busy = true;
    const button = $("#setup-submit");
    setButtonBusy(button, true, "Verifying GitHub owner...");
    try {
      const publisher = makePublisher(token);
      await publisher.verifyOwner();
      const vault = await vaultApi.createVault({ username, password, token, owner: config.owner, repository: config.repository });
      vaultApi.saveVault(vault);
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);
      state.token = token;
      state.publisher = publisher;
      $("#setup-form").reset();
      await enterDashboard(username);
      showToast("Owner vault created and GitHub connected.");
    } catch (error) {
      setFormError("#setup-error", friendlyError(error));
    } finally {
      state.busy = false;
      setButtonBusy(button, false, "");
    }
  };

  const login = async (event) => {
    event.preventDefault();
    if (state.busy) return;
    setFormError("#login-error");
    const vault = vaultApi.readVault();
    if (!vault) {
      setView("setup");
      return;
    }
    const username = $("#login-username").value.trim();
    const password = $("#login-password").value;
    state.busy = true;
    const button = $("#login-submit");
    setButtonBusy(button, true, "Unlocking...");
    try {
      const token = await vaultApi.unlockVault({ vault, username, password, owner: config.owner, repository: config.repository });
      const publisher = makePublisher(token);
      await publisher.verifyOwner();
      state.token = token;
      state.publisher = publisher;
      $("#login-password").value = "";
      await enterDashboard(vault.username);
    } catch (error) {
      setFormError("#login-error", friendlyError(error));
    } finally {
      state.busy = false;
      setButtonBusy(button, false, "");
    }
  };

  const replaceToken = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (state.busy) return;
    const vault = vaultApi.readVault();
    const password = $("#replace-password").value;
    const newToken = $("#replace-token").value.trim();
    state.busy = true;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Verifying token...";
    try {
      await vaultApi.unlockVault({ vault, username: vault.username, password, owner: config.owner, repository: config.repository });
      const publisher = makePublisher(newToken);
      await publisher.verifyOwner();
      const updatedVault = await vaultApi.createVault({ username: vault.username, password, token: newToken, owner: config.owner, repository: config.repository });
      vaultApi.saveVault(updatedVault);
      state.token = newToken;
      state.publisher = publisher;
      form.reset();
      showToast("GitHub token replaced successfully.");
    } catch (error) {
      showToast(friendlyError(error), "error");
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = "Verify and replace token";
      resetIdleTimer();
    }
  };

  const resetVault = () => {
    const confirmed = window.confirm("Reset owner access on this device? Published music will stay online.");
    if (!confirmed) return;
    vaultApi.clearVault();
    resetReleaseForm({ clearDraft: true });
    lockConsole();
    showToast("This device was reset. Published music was not changed.");
  };

  const exportVault = () => {
    const vault = vaultApi.readVault();
    if (!vault) { showToast("There is no encrypted vault to back up.", "error"); return; }
    const payload = { app: "Xotiic Upload", version: 1, exportedAt: new Date().toISOString(), vault };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xotiic-upload-vault-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Encrypted vault backup downloaded.");
  };

  const importVault = async (file) => {
    if (!file) return;
    if (file.size > 128 * 1024) { showToast("That vault backup is too large to be valid.", "error"); return; }
    try {
      const payload = JSON.parse(await file.text());
      const vault = payload?.app === "Xotiic Upload" && payload.version === 1 ? payload.vault : null;
      const valid = vault?.version === 1
        && vault.owner === config.owner
        && vault.repository === config.repository
        && typeof vault.username === "string"
        && typeof vault.salt === "string"
        && typeof vault.iv === "string"
        && typeof vault.ciphertext === "string";
      if (!valid) throw new Error("Invalid vault backup");
      if (!window.confirm(`Restore the encrypted owner vault for “${vault.username}” on this device? You will need its existing password to unlock it.`)) return;
      vaultApi.saveVault(vault);
      $("#login-username").value = vault.username;
      lockConsole("Encrypted vault restored. Enter its username and password to verify it.");
    } catch {
      showToast("That file is not a valid Xotiic Upload vault backup.", "error");
    } finally {
      $("#import-vault-file").value = "";
    }
  };

  const adminPreviewAudio = previewAudio();
  adminPreviewAudio.addEventListener("loadedmetadata", syncPreviewUi);
  adminPreviewAudio.addEventListener("durationchange", syncPreviewUi);
  adminPreviewAudio.addEventListener("timeupdate", syncPreviewUi);
  adminPreviewAudio.addEventListener("play", () => {
    if (state.previewTrack) $("#admin-preview-status").textContent = state.previewTrack.status;
    syncPreviewUi();
  });
  adminPreviewAudio.addEventListener("pause", syncPreviewUi);
  adminPreviewAudio.addEventListener("waiting", () => {
    if (adminPreviewAudio.src) $("#admin-preview-status").textContent = "BUFFERING PREVIEW";
  });
  adminPreviewAudio.addEventListener("playing", () => {
    if (state.previewTrack) $("#admin-preview-status").textContent = state.previewTrack.status;
    syncPreviewUi();
  });
  adminPreviewAudio.addEventListener("ended", () => {
    if (state.previewSourceKind === "catalog" && previewQueue().length > 1) skipAdminPreview(1);
    else syncPreviewUi();
  });
  adminPreviewAudio.addEventListener("error", () => {
    if (!adminPreviewAudio.getAttribute("src")) return;
    $("#admin-preview-status").textContent = "PREVIEW ERROR";
    showToast("The full MP3 could not be loaded. Check the file path and connection.", "error");
    syncPreviewUi();
  });
  $("#admin-preview-progress").addEventListener("input", (event) => {
    const nextTime = Number(event.target.value);
    if (Number.isFinite(nextTime)) adminPreviewAudio.currentTime = nextTime;
  });
  $("#admin-preview-toggle").addEventListener("click", toggleAdminPreview);
  $("#admin-preview-previous").addEventListener("click", () => skipAdminPreview(-1));
  $("#admin-preview-next").addEventListener("click", () => skipAdminPreview(1));
  $("#admin-preview-close").addEventListener("click", closeAdminPreview);
  $("#preview-selected-audio").addEventListener("click", () => {
    if (state.previewSourceKind === "local" && adminPreviewAudio.src) toggleAdminPreview();
    else playSelectedPreview();
  });

  $("#setup-form").addEventListener("submit", setup);
  $("#login-form").addEventListener("submit", login);
  $("#replace-token-form").addEventListener("submit", replaceToken);
  $("#release-form").addEventListener("submit", (event) => { event.preventDefault(); openReview(); });
  $("#release-form").addEventListener("input", scheduleReleaseDraftSave);
  $("#release-form").addEventListener("change", scheduleReleaseDraftSave);
  $("#edit-release-form").addEventListener("submit", saveReleaseEdit);
  $("#publish-release").addEventListener("click", publishPendingRelease);
  $("#logout-button").addEventListener("click", () => lockConsole("Console locked."));
  $("#reset-from-login").addEventListener("click", resetVault);
  $("#reset-vault-button").addEventListener("click", resetVault);
  $("#export-vault").addEventListener("click", exportVault);
  $("#import-vault").addEventListener("click", () => $("#import-vault-file").click());
  $("#import-vault-file").addEventListener("change", (event) => importVault(event.target.files?.[0]));
  $("#discard-release-draft").addEventListener("click", () => resetReleaseForm({ clearDraft: true }));
  $("#refresh-catalog").addEventListener("click", () => loadCatalog().then(() => showToast("Catalog refreshed.")).catch(() => undefined));
  $("#token-help-link").href = config.tokenHelpUrl;

  $("#audio-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (state.previewSourceKind === "local") closeAdminPreview();
    state.audioFile = null;
    state.audioDuration = 0;
    syncPreviewUi();
    if (!file) return updateReleaseSummary();
    const validType = file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3");
    if (!validType) {
      event.target.value = "";
      showToast("Choose an MP3 audio file.", "error");
      return;
    }
    if (file.size > config.maxAudioBytes) {
      event.target.value = "";
      showToast(`The MP3 must be below ${formatBytes(config.maxAudioBytes)}.`, "error");
      return;
    }
    try {
      const duration = await readAudioDuration(file);
      state.audioFile = file;
      state.audioDuration = duration;
      $("#release-duration").value = formatDuration(duration);
      $("#audio-file-name").textContent = file.name;
      $("#audio-file-meta").textContent = `${formatBytes(file.size)} · ${formatDuration(duration)} · MP3 ready`;
      $("#audio-drop").classList.add("has-file");
      if (!$("#release-title").value.trim()) {
        const guessedTitle = file.name.replace(/\.mp3$/i, "").replaceAll(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
        $("#release-title").value = guessedTitle;
        if (!state.idTouched) $("#release-id").value = slugify(guessedTitle);
      }
      updateReleaseSummary();
      scheduleReleaseDraftSave();
      syncPreviewUi();
    } catch (error) {
      event.target.value = "";
      showToast(error.message, "error");
      syncPreviewUi();
    }
  });

  $("#cover-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    state.coverFile = null;
    if (!file) return updateReleaseSummary();
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      event.target.value = "";
      showToast("Choose a JPG, PNG, or WebP cover.", "error");
      return;
    }
    if (file.size > config.maxCoverBytes) {
      event.target.value = "";
      showToast(`The cover must be below ${formatBytes(config.maxCoverBytes)}.`, "error");
      return;
    }
    try {
      const prepared = await prepareCoverFile(file);
      if (state.coverObjectUrl) URL.revokeObjectURL(state.coverObjectUrl);
      state.coverFile = prepared.file;
      state.coverWidth = prepared.width;
      state.coverHeight = prepared.height;
      state.coverObjectUrl = prepared.url;
      const preview = $("#cover-preview");
      preview.style.backgroundImage = `url(${JSON.stringify(prepared.url).slice(1, -1)})`;
      preview.classList.add("has-image");
      $("#cover-file-name").textContent = prepared.file.name;
      $("#cover-file-meta").textContent = `${prepared.width} × ${prepared.height} · ${formatBytes(prepared.file.size)} · ${prepared.optimized ? "Optimized WebP" : "Square verified"}`;
      $("#cover-drop").classList.add("has-file");
      updateReleaseSummary();
    } catch (error) {
      event.target.value = "";
      showToast(error.message, "error");
    }
  });

  $("#edit-audio-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    state.editAudioFile = null;
    state.editAudioDuration = 0;
    if (!file) { $("#edit-audio-copy").textContent = "Keep current MP3"; return; }
    if (!(file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3")) || file.size > config.maxAudioBytes) {
      event.target.value = "";
      showToast(`Choose an MP3 below ${formatBytes(config.maxAudioBytes)}.`, "error");
      return;
    }
    try {
      state.editAudioDuration = await readAudioDuration(file);
      state.editAudioFile = file;
      $("#edit-audio-copy").textContent = `${file.name} · ${formatBytes(file.size)} · ${formatDuration(state.editAudioDuration)}`;
    } catch (error) {
      event.target.value = "";
      showToast(error.message, "error");
    }
  });

  $("#edit-cover-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    state.editCoverFile = null;
    if (!file) { $("#edit-cover-copy").textContent = "Keep current cover"; return; }
    if ((!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) || file.size > config.maxCoverBytes) {
      event.target.value = "";
      showToast(`Choose a JPG, PNG, or WebP cover below ${formatBytes(config.maxCoverBytes)}.`, "error");
      return;
    }
    try {
      const prepared = await prepareCoverFile(file);
      state.editCoverFile = prepared.file;
      URL.revokeObjectURL(prepared.url);
      $("#edit-cover-copy").textContent = `${prepared.file.name} · ${prepared.width} × ${prepared.height} · ${formatBytes(prepared.file.size)}${prepared.optimized ? " · Optimized" : ""}`;
    } catch (error) {
      event.target.value = "";
      showToast(error.message, "error");
    }
  });

  $("#release-title").addEventListener("input", (event) => {
    if (!state.idTouched) $("#release-id").value = slugify(event.target.value);
    updateReleaseSummary();
  });
  $("#release-id").addEventListener("input", (event) => {
    state.idTouched = Boolean(event.target.value);
    event.target.value = slugify(event.target.value);
  });
  $("#release-description").addEventListener("input", (event) => { $("#description-count").textContent = String(event.target.value.length); });
  $("#release-lyrics").addEventListener("input", (event) => { $("#lyrics-count").textContent = String(event.target.value.length); });
  $$('input[name="release-mode"]').forEach((input) => input.addEventListener("change", updateReleaseMode));
  $("#release-schedule").addEventListener("input", updateReleaseMode);
  $("#edit-status").addEventListener("change", updateEditScheduleVisibility);
  $("#copy-diagnostics").addEventListener("click", async () => {
    const diagnostics = [
      "Xotiic Upload diagnostics",
      `Generated: ${new Date().toISOString()}`,
      `Catalog format: ${$("#diagnostics-catalog").textContent}`,
      `Releases: ${state.releases.length}`,
      `Live: ${$("#overview-live").textContent}`,
      `Scheduled: ${$("#overview-scheduled").textContent}`,
      `Drafts: ${$("#overview-drafts").textContent}`,
      `Archived: ${$("#overview-archived").textContent}`,
      `Network: ${$("#diagnostics-network").textContent}`,
      `Storage: ${$("#diagnostics-storage").textContent}`,
      `Browser: ${navigator.userAgent}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(diagnostics);
      showToast("Diagnostics copied.");
    } catch {
      showToast("Diagnostics could not be copied in this browser.", "error");
    }
  });

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.dataset.passwordToggle) {
      const input = document.getElementById(target.dataset.passwordToggle);
      input.type = input.type === "password" ? "text" : "password";
      setIcon(target, input.type === "password" ? "eye" : "eye-off");
      target.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
    }
    if (target.dataset.adminPanel) selectAdminPanel(target.dataset.adminPanel);
    if (target.dataset.releaseFilter) {
      state.releaseFilter = target.dataset.releaseFilter;
      renderReleases();
    }
    if (target.dataset.releasePreview) {
      event.preventDefault();
      if (state.previewSourceKind === "catalog" && state.previewReleaseId === target.dataset.releasePreview && adminPreviewAudio.src) toggleAdminPreview();
      else playCatalogPreview(target.dataset.releasePreview);
    }
    if (target.hasAttribute("data-review-close")) closeReview();
    if (target.hasAttribute("data-edit-close")) closeReleaseEditor();
    if (target.hasAttribute("data-install-close")) closeInstallHelp();
    if (target.hasAttribute("data-install")) {
      event.preventDefault();
      await requestInstall();
    }
    if (target.dataset.releaseEdit) openReleaseEditor(target.dataset.releaseEdit);
    if (target.dataset.releaseToggle) {
      if (state.busy) return;
      const release = state.releases.find((entry) => entry.id === target.dataset.releaseToggle);
      if (!release) return;
      const action = target.dataset.nextStatus === "published" ? "publish" : "hide";
      if (!window.confirm(`${action === "publish" ? "Publish" : "Hide"} “${release.title}”?`)) return;
      state.busy = true;
      target.disabled = true;
      try {
        const metadata = target.dataset.nextStatus === "published" ? { releaseDate: localDate(), publishedAt: new Date().toISOString() } : {};
        const result = await state.publisher.setReleaseStatus(release.id, target.dataset.nextStatus, metadata);
        state.releases = result.releases;
        renderReleases();
        showToast(`${release.title} was ${action === "publish" ? "published" : "hidden"}.`);
      } catch (error) {
        showToast(friendlyError(error), "error");
      } finally {
        state.busy = false;
        resetIdleTimer();
      }
    }
    if (target.dataset.releaseArchive || target.dataset.releaseRestore) {
      if (state.busy) return;
      const id = target.dataset.releaseArchive || target.dataset.releaseRestore;
      const release = state.releases.find((entry) => entry.id === id);
      if (!release) return;
      const restoring = Boolean(target.dataset.releaseRestore);
      if (!window.confirm(restoring ? `Restore “${release.title}” as a hidden draft?` : `Archive “${release.title}”? Its MP3 and cover will remain safely in the repository.`)) return;
      state.busy = true;
      target.disabled = true;
      try {
        const result = await state.publisher.setReleaseStatus(release.id, restoring ? "draft" : "archived", restoring ? {} : { archivedAt: new Date().toISOString() });
        state.releases = result.releases;
        renderReleases();
        showToast(restoring ? `${release.title} was restored as a draft.` : `${release.title} was archived without deleting its files.`);
      } catch (error) {
        showToast(friendlyError(error), "error");
      } finally {
        state.busy = false;
        resetIdleTimer();
      }
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    state.installAccepted = false;
    updateInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    state.installAccepted = true;
    updateInstallButton();
    showToast("Installed. Open Xotiic Upload from your Home screen or apps.");
  });
  window.addEventListener("pageshow", updateInstallButton);
  window.addEventListener("beforeunload", releasePreviewObjectUrl);
  window.addEventListener("online", () => { if (state.token) setConnection(true); refreshDiagnostics().catch(() => undefined); });
  window.addEventListener("offline", () => { if (state.token) setConnection(false, "OFFLINE"); refreshDiagnostics().catch(() => undefined); });
  for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(eventName, resetIdleTimer, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) state.hiddenAt = Date.now();
    else if (state.token && state.hiddenAt && Date.now() - state.hiddenAt > config.sessionMinutes * 60 * 1000) lockConsole("Console locked while away.");
    state.hiddenAt = 0;
  });

  const showAdminUpdate = (registration) => {
    state.serviceWorkerRegistration = registration;
    if (registration.waiting && navigator.serviceWorker.controller) $("#admin-update-banner").hidden = false;
  };

  $("#admin-apply-update").addEventListener("click", () => {
    const waiting = state.serviceWorkerRegistration?.waiting;
    if (!waiting) { location.reload(); return; }
    $("#admin-apply-update").disabled = true;
    $("#admin-apply-update").textContent = "Refreshing…";
    waiting.postMessage({ type: "SKIP_WAITING" });
  });
  $("#admin-dismiss-update").addEventListener("click", () => { $("#admin-update-banner").hidden = true; });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (state.reloadingForUpdate) return;
      state.reloadingForUpdate = true;
      location.reload();
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then((registration) => {
        state.serviceWorkerRegistration = registration;
        showAdminUpdate(registration);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") showAdminUpdate(registration);
          });
        });
        return registration.update();
      })
      .catch(() => undefined);
  }

  $("#release-date").value = localDate();
  $("#audio-file-meta").textContent = `Tap to open Files · Maximum ${formatBytes(config.maxAudioBytes)}`;
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "your device timezone";
  $("#release-timezone-copy").textContent = `Times use ${deviceTimezone}. The public date updates automatically.`;
  $("#edit-timezone-copy").textContent = `Times use ${deviceTimezone}. The public date updates automatically.`;
  resetReleaseForm();
  restoreReleaseDraft();
  const existingVault = vaultApi.readVault();
  if (existingVault) {
    $("#login-username").value = existingVault.username || "";
    setView("login");
  } else {
    setView("setup");
  }
  updateInstallButton();
})();

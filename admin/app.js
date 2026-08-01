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
    toastTimer: null,
    idleTimer: null,
    hiddenAt: 0,
    busy: false,
  };

  const views = {
    setup: $("#setup-view"),
    login: $("#login-view"),
    dashboard: $("#dashboard-view"),
  };

  const text = (value) => String(value ?? "");
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
  const localDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  };

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
      };
      return messages[error.code] || `GitHub error: ${error.message}`;
    }
    return error?.message || "Something went wrong. Please try again.";
  };

  const showToast = (message, type = "success") => {
    clearTimeout(state.toastTimer);
    const toast = $("#toast");
    $("#toast-icon").textContent = type === "error" ? "!" : "✓";
    $("#toast-copy").textContent = message;
    toast.classList.toggle("error", type === "error");
    toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
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
    state.token = "";
    state.publisher = null;
    state.pendingRelease = null;
    state.busy = false;
    clearTimeout(state.idleTimer);
    $("#progress-modal").hidden = true;
    $("#review-modal").hidden = true;
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

  const renderReleases = () => {
    const loading = $("#catalog-loading");
    const list = $("#release-list");
    const empty = $("#manage-empty");
    loading.hidden = true;
    $("#release-count-badge").textContent = String(state.releases.length);
    list.replaceChildren();
    if (!state.releases.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.hidden = false;

    [...state.releases].reverse().forEach((release) => {
      const row = document.createElement("article");
      row.className = "managed-release";
      const coverUrl = safeAssetUrl(release.cover);
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
      metadata.textContent = `${text(release.artist || "XotiicDuck")} · ${text(release.album || "Single")} · ${formatDuration(Number(release.duration))}`;
      const id = document.createElement("small");
      id.textContent = `${text(release.releaseDate || "No date")} · ${text(release.id)}`;
      copy.append(title, metadata, id);

      const actions = document.createElement("div");
      actions.className = "managed-release-actions";
      const status = document.createElement("span");
      const published = release.status === "published";
      status.className = `status-chip${published ? " published" : ""}`;
      status.textContent = published ? "LIVE" : "DRAFT";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.releaseToggle = text(release.id);
      toggle.dataset.nextStatus = published ? "draft" : "published";
      toggle.textContent = published ? "Hide" : "Publish";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.dataset.releaseDelete = text(release.id);
      remove.textContent = "Delete";
      actions.append(status, toggle, remove);
      row.append(cover, copy, actions);
      list.append(row);
    });
  };

  const selectAdminPanel = (name) => {
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
    $$('[data-admin-panel]').forEach((button) => button.classList.toggle("active", button.dataset.adminPanel === name));
    const headings = {
      upload: ["Publish a new release", "Upload the final MP3 and square artwork from this device."],
      releases: ["Manage your catalog", "Publish, hide, or remove releases already connected to GitHub."],
      security: ["Security and access", "Maintain the encrypted owner vault on this device."],
    };
    $("#dashboard-title").textContent = headings[name][0];
    $("#dashboard-subtitle").textContent = headings[name][1];
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

  const updateReleaseSummary = () => {
    const title = $("#release-title").value.trim();
    const audioReady = Boolean(state.audioFile && state.audioDuration);
    const coverReady = Boolean(state.coverFile && state.coverObjectUrl);
    $("#summary-title").textContent = title || "Waiting for release details";
    $("#summary-meta").textContent = audioReady && coverReady
      ? `${formatDuration(state.audioDuration)} · ${$("#publish-now").checked ? "Publishes live" : "Hidden draft"}`
      : "MP3 and cover required";
    const summaryArt = $("#summary-art");
    summaryArt.style.backgroundImage = coverReady ? `url(${JSON.stringify(state.coverObjectUrl).slice(1, -1)})` : "";
    summaryArt.textContent = coverReady ? "" : "XD";
  };

  const resetReleaseForm = () => {
    $("#release-form").reset();
    $("#release-artist").value = "XotiicDuck";
    $("#release-genre").value = "Anime J-Rock";
    $("#release-date").value = localDate();
    $("#publish-now").checked = true;
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
    updateReleaseSummary();
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
    const release = {
      id,
      title: $("#release-title").value.trim(),
      artist: $("#release-artist").value.trim(),
      album: $("#release-album").value,
      genre: $("#release-genre").value.trim(),
      releaseDate: $("#release-date").value,
      duration: state.audioDuration,
      audio: `music/${id}.mp3`,
      cover: `covers/${id}.${coverExtension(state.coverFile)}`,
      status: $("#publish-now").checked ? "published" : "draft",
    };
    if (description) release.description = description;
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
    return true;
  };

  const openReview = () => {
    if (!validateReleaseForm()) return;
    state.pendingRelease = buildPendingRelease();
    $("#review-song-title").textContent = state.pendingRelease.title;
    $("#review-song-meta").textContent = `${state.pendingRelease.artist} · ${state.pendingRelease.album} · ${formatDuration(state.pendingRelease.duration)}`;
    $("#review-file-meta").textContent = `${state.audioFile.name} · ${formatBytes(state.audioFile.size)}`;
    $("#review-visibility").textContent = state.pendingRelease.status === "published"
      ? "This release will become public after GitHub Pages finishes its deployment."
      : "This release will be uploaded as a hidden draft and will not appear in the public player.";
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
      resetReleaseForm();
      showToast("Release committed. GitHub Pages will update the player shortly.");
    } catch (error) {
      $("#progress-modal").hidden = true;
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
    if (state.busy) return;
    const vault = vaultApi.readVault();
    const password = $("#replace-password").value;
    const newToken = $("#replace-token").value.trim();
    state.busy = true;
    const button = event.currentTarget.querySelector("button[type='submit']");
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
      event.currentTarget.reset();
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
    resetReleaseForm();
    lockConsole();
    showToast("This device was reset. Published music was not changed.");
  };

  $("#setup-form").addEventListener("submit", setup);
  $("#login-form").addEventListener("submit", login);
  $("#replace-token-form").addEventListener("submit", replaceToken);
  $("#release-form").addEventListener("submit", (event) => { event.preventDefault(); openReview(); });
  $("#publish-release").addEventListener("click", publishPendingRelease);
  $("#logout-button").addEventListener("click", () => lockConsole("Console locked."));
  $("#reset-from-login").addEventListener("click", resetVault);
  $("#reset-vault-button").addEventListener("click", resetVault);
  $("#refresh-catalog").addEventListener("click", () => loadCatalog().then(() => showToast("Catalog refreshed.")).catch(() => undefined));
  $("#token-help-link").href = config.tokenHelpUrl;

  $("#audio-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    state.audioFile = null;
    state.audioDuration = 0;
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
    } catch (error) {
      event.target.value = "";
      showToast(error.message, "error");
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
      const dimensions = await readImageSize(file);
      const ratio = dimensions.width / dimensions.height;
      if (ratio < 0.97 || ratio > 1.03) {
        URL.revokeObjectURL(dimensions.url);
        event.target.value = "";
        throw new Error(`The cover must be square. This image is ${dimensions.width} × ${dimensions.height}.`);
      }
      if (state.coverObjectUrl) URL.revokeObjectURL(state.coverObjectUrl);
      state.coverFile = file;
      state.coverWidth = dimensions.width;
      state.coverHeight = dimensions.height;
      state.coverObjectUrl = dimensions.url;
      const preview = $("#cover-preview");
      preview.style.backgroundImage = `url(${JSON.stringify(dimensions.url).slice(1, -1)})`;
      preview.classList.add("has-image");
      $("#cover-file-name").textContent = file.name;
      $("#cover-file-meta").textContent = `${dimensions.width} × ${dimensions.height} · ${formatBytes(file.size)} · Square verified`;
      $("#cover-drop").classList.add("has-file");
      updateReleaseSummary();
    } catch (error) {
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
  $("#publish-now").addEventListener("change", updateReleaseSummary);

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.dataset.passwordToggle) {
      const input = document.getElementById(target.dataset.passwordToggle);
      input.type = input.type === "password" ? "text" : "password";
      target.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
    }
    if (target.dataset.adminPanel) selectAdminPanel(target.dataset.adminPanel);
    if (target.hasAttribute("data-review-close")) closeReview();
    if (target.hasAttribute("data-install")) {
      event.preventDefault();
      if (state.installPrompt) {
        await state.installPrompt.prompt();
        await state.installPrompt.userChoice;
        state.installPrompt = null;
      } else {
        showToast("Open the browser menu and choose Install app or Add to Home screen.");
      }
    }
    if (target.dataset.releaseToggle) {
      if (state.busy) return;
      const release = state.releases.find((entry) => entry.id === target.dataset.releaseToggle);
      if (!release) return;
      const action = target.dataset.nextStatus === "published" ? "publish" : "hide";
      if (!window.confirm(`${action === "publish" ? "Publish" : "Hide"} “${release.title}”?`)) return;
      state.busy = true;
      target.disabled = true;
      try {
        const result = await state.publisher.setReleaseStatus(release.id, target.dataset.nextStatus);
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
    if (target.dataset.releaseDelete) {
      if (state.busy) return;
      const release = state.releases.find((entry) => entry.id === target.dataset.releaseDelete);
      if (!release) return;
      if (!window.confirm(`Delete “${release.title}” from the public repository? The old file will remain in Git history.`)) return;
      state.busy = true;
      target.disabled = true;
      try {
        const result = await state.publisher.deleteRelease(release.id);
        state.releases = result.releases;
        renderReleases();
        showToast(`${release.title} was removed from the current catalog.`);
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
  });
  window.addEventListener("online", () => state.token && setConnection(true));
  window.addEventListener("offline", () => state.token && setConnection(false, "OFFLINE"));
  for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(eventName, resetIdleTimer, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) state.hiddenAt = Date.now();
    else if (state.token && state.hiddenAt && Date.now() - state.hiddenAt > config.sessionMinutes * 60 * 1000) lockConsole("Console locked while away.");
    state.hiddenAt = 0;
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  }

  $("#release-date").value = localDate();
  $("#audio-file-meta").textContent = `Tap to open Files · Maximum ${formatBytes(config.maxAudioBytes)}`;
  resetReleaseForm();
  const existingVault = vaultApi.readVault();
  if (existingVault) {
    $("#login-username").value = existingVault.username || "";
    setView("login");
  } else {
    setView("setup");
  }
})();

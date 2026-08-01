(() => {
  "use strict";

  const rawCatalog = Array.isArray(window.XOTIICDUCK_RELEASES)
    ? window.XOTIICDUCK_RELEASES
    : [];

  const safePath = (value) => {
    if (typeof value !== "string") return "";
    const cleaned = value.trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!cleaned || cleaned.includes("..") || /^(?:data|javascript|https?):/i.test(cleaned)) return "";
    return `./${cleaned.split("/").map(encodeURIComponent).join("/")}`;
  };

  const text = (value) => String(value ?? "");
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const seenIds = new Set();
  const tracks = rawCatalog
    .filter((entry) => {
      const validId = typeof entry?.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id);
      const complete = entry?.status === "published" && safePath(entry.audio) && safePath(entry.cover);
      const validDuration = Number.isFinite(entry?.duration) && entry.duration > 0;
      const unique = validId && !seenIds.has(entry.id);
      if (unique) seenIds.add(entry.id);
      return Boolean(unique && complete && validDuration && entry.title && entry.artist);
    })
    .map((entry) => ({
      id: entry.id,
      title: text(entry.title),
      artist: text(entry.artist),
      album: text(entry.album || entry.release || "Single"),
      genre: text(entry.genre || "Music"),
      year: /^\d{4}/.test(text(entry.releaseDate)) ? text(entry.releaseDate).slice(0, 4) : "",
      duration: Number(entry.duration),
      audio: safePath(entry.audio),
      cover: safePath(entry.cover),
    }));

  const byId = (id) => tracks.find((track) => track.id === id);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const audio = $("#audio");
  const app = $("#app");
  let currentTrack = tracks[0] || null;
  let currentView = "home";
  let selectedGenre = "All tracks";
  let shuffleEnabled = false;
  let repeatMode = "off";
  let installPrompt = null;
  let installAccepted = false;
  let toastTimer = null;
  let favorites = new Set();

  try {
    favorites = new Set(JSON.parse(localStorage.getItem("xotiicduck-favorites") || "[]"));
  } catch {
    favorites = new Set();
  }

  const saveFavorites = () => {
    localStorage.setItem("xotiicduck-favorites", JSON.stringify([...favorites]));
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  };

  const artwork = (track, compact = false) => `
    <div class="artwork uploaded-artwork${compact ? " artwork-compact" : ""}">
      <img src="${escapeHtml(track.cover)}" alt="${escapeHtml(track.title)} cover" />
    </div>`;

  const emptyCatalog = () => `
    <div class="empty-state catalog-empty-state">
      <span>♫</span>
      <h2>Official releases are being prepared.</h2>
      <p>Tracks appear here only after the final MP3 and square cover have been published.</p>
      <a class="primary-button" href="https://www.youtube.com/@XotiicDuck" target="_blank" rel="noreferrer">▶ Visit XotiicDuck on YouTube</a>
    </div>`;

  const emptyFavorites = () => `
    <div class="empty-state">
      <span>♥</span>
      <h2>Your favorites will live here.</h2>
      <p>Save a released track and it will appear in this library on the same device.</p>
    </div>`;

  const releaseCard = (track) => `
    <article class="release-card">
      <button class="release-art-button" data-play="${escapeHtml(track.id)}" aria-label="Play ${escapeHtml(track.title)}">
        ${artwork(track)}
        <span class="card-play">${currentTrack?.id === track.id && !audio.paused ? "Ⅱ" : "▶"}</span>
      </button>
      <div class="release-meta">
        <div><h3>${escapeHtml(track.title)}</h3><p>${escapeHtml(track.album)}${track.year ? ` · ${escapeHtml(track.year)}` : ""}</p></div>
        <button class="icon-button${favorites.has(track.id) ? " is-favorite" : ""}" data-favorite="${escapeHtml(track.id)}" aria-label="${favorites.has(track.id) ? "Remove from" : "Save to"} favorites">${favorites.has(track.id) ? "♥" : "♡"}</button>
      </div>
    </article>`;

  const renderHome = () => {
    $("#live-count").textContent = String(tracks.length).padStart(2, "0");
    $("#catalog-heading").textContent = tracks.length ? "Latest releases" : "The catalog opens with the first release";
    $("#view-all").hidden = tracks.length === 0;
    $("#home-catalog").innerHTML = tracks.length
      ? `<div class="release-grid">${tracks.slice(0, 4).map(releaseCard).join("")}</div>`
      : emptyCatalog();

    const primary = $("#hero-primary");
    if (tracks.length) {
      primary.removeAttribute("href");
      primary.removeAttribute("target");
      primary.removeAttribute("rel");
      primary.dataset.play = tracks[0].id;
      primary.textContent = "▶ Play latest";
    }
  };

  const renderDiscover = () => {
    const genres = ["All tracks", ...new Set(tracks.map((track) => track.genre))];
    $("#genre-row").hidden = tracks.length === 0;
    $("#genre-row").innerHTML = genres.map((genre) => `<button data-genre="${escapeHtml(genre)}" class="${genre === selectedGenre ? "active" : ""}">${escapeHtml(genre)}</button>`).join("");
    const visible = selectedGenre === "All tracks" ? tracks : tracks.filter((track) => track.genre === selectedGenre);
    $("#discover-catalog").innerHTML = tracks.length
      ? `<div class="release-grid expanded">${visible.map(releaseCard).join("")}</div>`
      : emptyCatalog();
  };

  const renderLibrary = () => {
    const liked = tracks.filter((track) => favorites.has(track.id));
    $("#library-catalog").innerHTML = liked.length
      ? `<div class="track-table">
          <div class="track-table-head"><span>#</span><span>TITLE</span><span>ALBUM</span><span>◷</span></div>
          ${liked.map((track, index) => `<button class="track-row" data-play="${escapeHtml(track.id)}"><span class="track-number">${index + 1}</span><span class="track-name">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span></span><span class="track-album">${escapeHtml(track.album)}</span><span class="track-duration">${formatTime(track.duration)}</span></button>`).join("")}
        </div>`
      : emptyFavorites();
  };

  const renderSideQueue = () => {
    if (!currentTrack) return;
    $("#side-queue").innerHTML = tracks
      .filter((track) => track.id !== currentTrack.id)
      .slice(0, 3)
      .map((track) => `<button data-play="${escapeHtml(track.id)}">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}</small></span><span>▶</span></button>`)
      .join("");
  };

  const renderCurrent = () => {
    const hasTrack = Boolean(currentTrack);
    app.classList.toggle("catalog-empty", !hasTrack);
    app.classList.toggle("has-player", hasTrack);
    $("#now-panel").hidden = !hasTrack;
    $("#player").hidden = !hasTrack;
    if (!currentTrack) return;

    $("#now-art").innerHTML = artwork(currentTrack);
    $("#now-title").textContent = currentTrack.title;
    $("#now-artist").textContent = currentTrack.artist;
    $("#now-album").textContent = currentTrack.album;
    $("#now-year").textContent = `${currentTrack.year || "RELEASED"} · PUBLISHED`;
    $("#player-art").innerHTML = artwork(currentTrack, true);
    $("#player-title").textContent = currentTrack.title;
    $("#player-artist").textContent = currentTrack.artist;
    $("#duration").textContent = formatTime(currentTrack.duration);
    for (const button of [$("#now-favorite"), $("#player-favorite")]) {
      button.textContent = favorites.has(currentTrack.id) ? "♥" : "♡";
      button.classList.toggle("is-favorite", favorites.has(currentTrack.id));
    }
    renderSideQueue();
  };

  const renderQueue = () => {
    $("#queue-list").innerHTML = tracks.map((track, index) => `
      <button data-play="${escapeHtml(track.id)}" class="${track.id === currentTrack?.id ? "active" : ""}">
        <span class="queue-position">${index + 1}</span>${artwork(track, true)}
        <span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}</small></span><span>▶</span>
      </button>`).join("");
  };

  const renderSearch = (query = "") => {
    const normalized = query.trim().toLowerCase();
    const matches = tracks.filter((track) => `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase().includes(normalized));
    $("#search-label").textContent = normalized ? `${matches.length} RESULTS` : "OFFICIAL RELEASES";
    $("#search-results").innerHTML = matches.length
      ? matches.map((track) => `<button data-play="${escapeHtml(track.id)}">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.album)}${track.year ? ` · ${escapeHtml(track.year)}` : ""}</small></span><span>▶</span></button>`).join("")
      : `<p class="search-empty">${tracks.length ? "No tracks match that search." : "No official releases are live yet."}</p>`;
  };

  const renderAll = () => {
    renderHome();
    renderDiscover();
    renderLibrary();
    renderCurrent();
  };

  const showToast = (message) => {
    clearTimeout(toastTimer);
    $("#toast-copy").textContent = message;
    $("#toast").hidden = false;
    toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 2800);
  };

  const switchView = (view) => {
    currentView = view;
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
    $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    if (view === "discover") renderDiscover();
    if (view === "library") renderLibrary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateMediaSession = () => {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window) || !currentTrack) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: [{ src: currentTrack.cover, sizes: "1200x1200" }],
      });
    } catch {
      // Playback still works in browsers with partial Media Session support.
    }
  };

  const setTrack = async (track, autoplay = true) => {
    if (!track) return;
    const changed = currentTrack?.id !== track.id || audio.src !== new URL(track.audio, location.href).href;
    currentTrack = track;
    if (changed) {
      audio.src = track.audio;
      audio.load();
    }
    renderAll();
    updateMediaSession();
    if (autoplay) {
      try {
        await audio.play();
      } catch {
        showToast("Tap play again to start the audio.");
      }
    }
  };

  const skip = (direction) => {
    if (!tracks.length) return;
    if (shuffleEnabled && tracks.length > 1) {
      const choices = tracks.filter((track) => track.id !== currentTrack?.id);
      setTrack(choices[Math.floor(Math.random() * choices.length)]);
      return;
    }
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.id === currentTrack?.id));
    setTrack(tracks[(currentIndex + direction + tracks.length) % tracks.length]);
  };

  const toggleFavorite = (id) => {
    if (!byId(id)) return;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    saveFavorites();
    renderAll();
  };

  const closeModals = () => {
    for (const layer of [$("#search-layer"), $("#queue-layer"), $("#info-layer")]) layer.hidden = true;
    document.body.classList.remove("modal-open");
  };

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
    || document.referrer.startsWith("android-app://");

  const device = (() => {
    const ua = navigator.userAgent || "";
    const ipad = /iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const ios = /iPhone|iPod/i.test(ua) || ipad;
    return {
      ios,
      ipad,
      android: /Android/i.test(ua),
      samsung: /SamsungBrowser/i.test(ua),
      firefox: /Firefox|FxiOS/i.test(ua),
      edge: /EdgA|EdgiOS|Edg/i.test(ua),
    };
  })();

  installAccepted = isStandalone();

  const installSteps = (steps) => `<ol class="install-steps">${steps.map((step) => `<li>${step}</li>`).join("")}</ol>`;

  const installGuide = (status = "manual") => {
    if (isStandalone() || installAccepted || status === "installed" || status === "accepted") {
      return {
        eyebrow: "PLAYER READY",
        title: status === "accepted" ? "Installation accepted." : "XotiicDuck Music is installed.",
        copy: `<div class="install-result success"><span aria-hidden="true">✓</span><div><h3>${status === "accepted" ? "Check your Home screen or app list" : "Open it like any other app"}</h3><p>${status === "accepted" ? "Your browser accepted the install. Leave the browser and look for XotiicDuck Music on your Home screen or in your apps. Some devices take a few seconds to place the icon." : "You are currently using the installed player, or this browser completed the installation during this visit."}</p></div></div><section><h3>If you cannot find the icon</h3><p>Use your device search for “XotiicDuck.” If it is still missing, return to the website in your browser and follow the install guide again.</p></section>`,
      };
    }

    const cancelled = status === "dismissed"
      ? `<div class="install-result notice"><span aria-hidden="true">!</span><div><h3>Nothing was installed</h3><p>The browser prompt was closed. You can try the Install button again whenever you are ready.</p></div></div>`
      : "";

    if (device.ios) {
      return {
        eyebrow: device.ipad ? "INSTALL ON IPAD" : "INSTALL ON IPHONE",
        title: "Add the player from Safari.",
        copy: `${cancelled}${installSteps([
          "Open this page in <strong>Safari</strong>.",
          "Tap the <strong>Share</strong> button.",
          "Choose <strong>Add to Home Screen</strong>.",
          "Turn on <strong>Open as Web App</strong>, then tap <strong>Add</strong>.",
        ])}<p class="install-note">Apple devices do not give websites the same automatic install prompt as Chrome. These steps are the real installation route on iPhone and iPad.</p>`,
      };
    }

    if (device.samsung) {
      return {
        eyebrow: "INSTALL ON SAMSUNG INTERNET",
        title: "Add the player to your Galaxy.",
        copy: `${cancelled}${installSteps([
          "Open the Samsung Internet menu <strong>☰</strong>.",
          "Tap <strong>Add page to</strong>.",
          "Choose <strong>Home screen</strong>. If Samsung shows <strong>Install app</strong>, choose that instead.",
          "Confirm, then open XotiicDuck Music from the new icon.",
        ])}<p class="install-note">If the browser has already added it, search your Home screen and app list for “XotiicDuck.”</p>`,
      };
    }

    if (device.android) {
      const browserName = device.firefox ? "Firefox" : device.edge ? "Microsoft Edge" : "Chrome";
      return {
        eyebrow: "INSTALL ON ANDROID",
        title: `Install from ${browserName}.`,
        copy: `${cancelled}${installSteps([
          `Open the ${browserName} browser menu <strong>⋮</strong>.`,
          "Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.",
          "Tap <strong>Install</strong> or <strong>Add</strong> to confirm.",
          "Open XotiicDuck Music from your Home screen or app list.",
        ])}<p class="install-note">If your browser does not show an install option yet, refresh once and wait a few seconds for the player files to finish saving.</p>`,
      };
    }

    return {
      eyebrow: "INSTALL THE PLAYER",
      title: "Keep XotiicDuck Music one click away.",
      copy: `${cancelled}${installSteps([
        "Open this page in Chrome or Microsoft Edge.",
        "Use the install icon in the address bar, or open the browser menu and choose <strong>Install XotiicDuck Music</strong>.",
        "Confirm the installation, then launch it from your apps or desktop.",
      ])}<p class="install-note">Safari on Mac uses <strong>File → Add to Dock</strong>. Browsers that do not support web-app installation can still use the full website normally.</p>`,
    };
  };

  const updateInstallButtons = () => {
    const installed = isStandalone() || installAccepted;
    app.classList.toggle("app-installed", installed);
    for (const button of $$('[data-install]')) {
      const label = button.querySelector("[data-install-label]");
      const icon = button.querySelector("[data-install-icon]");
      if (label && !button.dataset.installLabel) button.dataset.installLabel = label.textContent.trim();
      if (label) label.textContent = installed ? "Installed" : button.dataset.installLabel;
      if (icon) icon.textContent = installed ? "✓" : "⇩";
      button.classList.toggle("is-installed", installed);
      button.setAttribute("aria-label", installed ? "XotiicDuck Music is installed" : "Install XotiicDuck Music");
      button.title = installed ? "Already installed — tap for details" : "Install XotiicDuck Music";
    }
  };

  const infoContent = {
    about: {
      eyebrow: "ABOUT THE SIGNAL",
      title: "Music built from anime-sized moments.",
      copy: `<section><h3>Direct from XotiicDuck</h3><p>This player keeps the catalog focused on one artist, with no unrelated recommendation feed and no audio pulled from somebody else’s channel.</p></section><section><h3>Complete releases only</h3><p>Every public track is paired with its final master, square cover, title, release date, and credits before it becomes playable.</p></section>`,
    },
    install: installGuide(),
    privacy: {
      eyebrow: "PRIVACY",
      title: "A small player should collect very little.",
      copy: `<section><h3>Local favorites</h3><p>Listener favorites are stored in this browser on this device. The public player includes no listener account, advertising tracker, or product analytics.</p></section><section><h3>Separate artist access</h3><p>The owner publishing console stores its GitHub connection in an encrypted device vault. Public listeners cannot publish releases without the verified repository owner’s GitHub access.</p></section><section><h3>External links</h3><p>YouTube links open an external service governed by its own privacy terms. This player does not embed a YouTube video.</p></section>`,
    },
    terms: {
      eyebrow: "TERMS",
      title: "Listen. Don’t re-upload.",
      copy: `<section><h3>Personal listening</h3><p>Published audio, artwork, branding, and written material remain the property of their respective rights holders. Access does not grant permission to redistribute the files.</p></section><section><h3>Availability</h3><p>The catalog may change as releases are corrected, updated, or withdrawn.</p></section>`,
    },
  };

  const openInfo = (name, installStatus = "manual") => {
    const content = name === "install" ? installGuide(installStatus) : infoContent[name];
    if (!content) return;
    $("#info-eyebrow").textContent = content.eyebrow;
    $("#info-title").textContent = content.title;
    $("#info-copy").innerHTML = content.copy;
    $("#info-layer").hidden = false;
    document.body.classList.add("modal-open");
  };

  const requestInstall = async () => {
    if (isStandalone() || installAccepted) {
      openInfo("install", "installed");
      return;
    }

    if (!installPrompt) {
      openInfo("install", "manual");
      return;
    }

    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        installAccepted = true;
        updateInstallButtons();
        openInfo("install", "accepted");
      } else {
        openInfo("install", "dismissed");
      }
    } catch {
      openInfo("install", "manual");
    }
  };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.dataset.view) { event.preventDefault(); switchView(target.dataset.view); }
    if (target.dataset.play) { event.preventDefault(); setTrack(byId(target.dataset.play)); closeModals(); }
    if (target.dataset.favorite) { event.preventDefault(); toggleFavorite(target.dataset.favorite); }
    if (target.hasAttribute("data-install")) { event.preventDefault(); requestInstall(); }
    if (target.hasAttribute("data-search-open")) { event.preventDefault(); renderSearch(); $("#search-layer").hidden = false; document.body.classList.add("modal-open"); setTimeout(() => $("#search-input").focus(), 0); }
    if (target.hasAttribute("data-modal-close")) { event.preventDefault(); closeModals(); }
    if (target.dataset.info) { event.preventDefault(); openInfo(target.dataset.info); }
    if (target.dataset.genre) { selectedGenre = target.dataset.genre; renderDiscover(); }
  });

  $("#play").addEventListener("click", () => {
    if (!currentTrack) return;
    if (audio.paused) audio.play().catch(() => showToast("Tap play again to start the audio."));
    else audio.pause();
  });
  $("#previous").addEventListener("click", () => skip(-1));
  $("#next").addEventListener("click", () => skip(1));
  $("#shuffle").addEventListener("click", () => {
    shuffleEnabled = !shuffleEnabled;
    $("#shuffle").classList.toggle("control-active", shuffleEnabled);
    $("#shuffle").setAttribute("aria-label", shuffleEnabled ? "Disable shuffle" : "Enable shuffle");
  });
  $("#repeat").addEventListener("click", () => {
    repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    $("#repeat").classList.toggle("control-active", repeatMode !== "off");
    $("#repeat").textContent = repeatMode === "one" ? "↻¹" : "↻";
    $("#repeat").setAttribute("aria-label", `Repeat mode: ${repeatMode}`);
  });
  $("#queue-open").addEventListener("click", () => { renderQueue(); $("#queue-layer").hidden = false; document.body.classList.add("modal-open"); });
  $("#now-favorite").addEventListener("click", () => currentTrack && toggleFavorite(currentTrack.id));
  $("#player-favorite").addEventListener("click", () => currentTrack && toggleFavorite(currentTrack.id));
  $("#volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value); });
  $("#progress").addEventListener("input", (event) => { audio.currentTime = Number(event.target.value); });
  $("#search-input").addEventListener("input", (event) => renderSearch(event.target.value));

  audio.addEventListener("play", () => { $("#play").textContent = "Ⅱ"; $("#play").setAttribute("aria-label", "Pause"); renderHome(); if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "playing"; } catch { /* Partial support. */ } } });
  audio.addEventListener("pause", () => { $("#play").textContent = "▶"; $("#play").setAttribute("aria-label", "Play"); renderHome(); if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "paused"; } catch { /* Partial support. */ } } });
  audio.addEventListener("timeupdate", () => { $("#elapsed").textContent = formatTime(audio.currentTime); $("#progress").value = String(audio.currentTime); });
  audio.addEventListener("loadedmetadata", () => { const duration = Number.isFinite(audio.duration) ? audio.duration : currentTrack?.duration || 0; $("#progress").max = String(duration || 1); $("#duration").textContent = formatTime(duration); });
  audio.addEventListener("ended", () => {
    if (repeatMode === "one") { audio.currentTime = 0; audio.play(); return; }
    const isLast = tracks.findIndex((track) => track.id === currentTrack?.id) === tracks.length - 1;
    if (isLast && repeatMode === "off" && !shuffleEnabled) { audio.currentTime = 0; return; }
    skip(1);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installAccepted = false;
    updateInstallButtons();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installAccepted = true;
    updateInstallButtons();
    showToast("Installed — open XotiicDuck Music from your Home screen or apps.");
  });
  window.addEventListener("pageshow", updateInstallButtons);
  window.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (event.key === "/" && !typing) { event.preventDefault(); renderSearch(); $("#search-layer").hidden = false; document.body.classList.add("modal-open"); setTimeout(() => $("#search-input").focus(), 0); }
    if (event.key === "Escape") closeModals();
  });

  if ("mediaSession" in navigator) {
    const mediaActions = [
      ["play", () => audio.play()],
      ["pause", () => audio.pause()],
      ["nexttrack", () => skip(1)],
      ["previoustrack", () => skip(-1)],
    ];
    for (const [action, handler] of mediaActions) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Partial support. */ }
    }
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }

  $("#year").textContent = String(new Date().getFullYear());
  audio.volume = Number($("#volume").value);
  if (currentTrack) {
    audio.src = currentTrack.audio;
    audio.load();
    updateMediaSession();
  }
  renderAll();
  switchView(currentView);
  updateInstallButtons();
})();

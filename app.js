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
    if (!("mediaSession" in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: [{ src: currentTrack.cover, sizes: "1200x1200" }],
    });
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
  };

  const infoContent = {
    about: {
      eyebrow: "ABOUT THE SIGNAL",
      title: "Music built from anime-sized moments.",
      copy: `<section><h3>Direct from XotiicDuck</h3><p>This player keeps the catalog focused on one artist, with no unrelated recommendation feed and no audio pulled from somebody else’s channel.</p></section><section><h3>Complete releases only</h3><p>Every public track is paired with its final master, square cover, title, release date, and credits before it becomes playable.</p></section>`,
    },
    install: {
      eyebrow: "INSTALL THE PLAYER",
      title: "Keep XotiicDuck Music one tap away.",
      copy: `<section><h3>Android</h3><p>Open this site in Chrome, open the browser menu, and choose Install app or Add to Home screen.</p></section><section><h3>Desktop</h3><p>Chrome and Microsoft Edge can install the player from the address bar.</p></section><section><h3>APK safety</h3><p>A direct APK should be offered only after release signing, checksum publication, background-playback testing, and a physical-phone safety test.</p></section>`,
    },
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

  const openInfo = (name) => {
    const content = infoContent[name];
    if (!content) return;
    $("#info-eyebrow").textContent = content.eyebrow;
    $("#info-title").textContent = content.title;
    $("#info-copy").innerHTML = content.copy;
    $("#info-layer").hidden = false;
  };

  const requestInstall = async () => {
    if (!installPrompt) {
      showToast("Open your browser menu and choose ‘Install app’ or ‘Add to Home screen’.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") showToast("XotiicDuck Music installed.");
    installPrompt = null;
  };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.dataset.view) { event.preventDefault(); switchView(target.dataset.view); }
    if (target.dataset.play) { event.preventDefault(); setTrack(byId(target.dataset.play)); closeModals(); }
    if (target.dataset.favorite) { event.preventDefault(); toggleFavorite(target.dataset.favorite); }
    if (target.hasAttribute("data-install")) { event.preventDefault(); requestInstall(); }
    if (target.hasAttribute("data-search-open")) { event.preventDefault(); renderSearch(); $("#search-layer").hidden = false; setTimeout(() => $("#search-input").focus(), 0); }
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
  $("#queue-open").addEventListener("click", () => { renderQueue(); $("#queue-layer").hidden = false; });
  $("#now-favorite").addEventListener("click", () => currentTrack && toggleFavorite(currentTrack.id));
  $("#player-favorite").addEventListener("click", () => currentTrack && toggleFavorite(currentTrack.id));
  $("#volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value); });
  $("#progress").addEventListener("input", (event) => { audio.currentTime = Number(event.target.value); });
  $("#search-input").addEventListener("input", (event) => renderSearch(event.target.value));

  audio.addEventListener("play", () => { $("#play").textContent = "Ⅱ"; $("#play").setAttribute("aria-label", "Pause"); renderHome(); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; });
  audio.addEventListener("pause", () => { $("#play").textContent = "▶"; $("#play").setAttribute("aria-label", "Play"); renderHome(); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; });
  audio.addEventListener("timeupdate", () => { $("#elapsed").textContent = formatTime(audio.currentTime); $("#progress").value = String(audio.currentTime); });
  audio.addEventListener("loadedmetadata", () => { const duration = Number.isFinite(audio.duration) ? audio.duration : currentTrack?.duration || 0; $("#progress").max = String(duration || 1); $("#duration").textContent = formatTime(duration); });
  audio.addEventListener("ended", () => {
    if (repeatMode === "one") { audio.currentTime = 0; audio.play(); return; }
    const isLast = tracks.findIndex((track) => track.id === currentTrack?.id) === tracks.length - 1;
    if (isLast && repeatMode === "off" && !shuffleEnabled) { audio.currentTime = 0; return; }
    skip(1);
  });

  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; });
  window.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (event.key === "/" && !typing) { event.preventDefault(); renderSearch(); $("#search-layer").hidden = false; setTimeout(() => $("#search-input").focus(), 0); }
    if (event.key === "Escape") closeModals();
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => skip(1));
    navigator.mediaSession.setActionHandler("previoustrack", () => skip(-1));
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
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
})();

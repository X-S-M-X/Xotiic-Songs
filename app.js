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
      description: text(entry.description).trim(),
      lyrics: typeof entry.lyrics === "string" ? entry.lyrics.trim().slice(0, 30000) : "",
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
  let activeQueueIds = tracks.map((track) => track.id);
  let playbackContextLabel = "All tracks";
  let activeQueuePlaylistId = null;
  let shuffleBag = [];
  let shuffleHistory = [];
  let playlists = [];
  let activePlaylistId = null;
  let playlistEditorTargetId = null;
  let playlistEditorTrackId = null;
  let lyricsExpanded = false;
  let installPrompt = null;
  let installAccepted = false;
  let toastTimer = null;
  let favorites = new Set();

  const FAVORITES_KEY = "xotiicduck-favorites";
  const PLAYLISTS_KEY = "xotiicduck-playlists-v1";
  const PLAYBACK_KEY = "xotiicduck-playback-v1";

  try {
    favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
  } catch {
    favorites = new Set();
  }

  try {
    const stored = JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || "[]");
    playlists = Array.isArray(stored)
      ? stored.filter((playlist) => playlist && typeof playlist.id === "string" && typeof playlist.name === "string").map((playlist) => ({
          id: playlist.id,
          name: playlist.name.trim().slice(0, 60) || "Untitled playlist",
          trackIds: [...new Set(Array.isArray(playlist.trackIds) ? playlist.trackIds.filter((id) => byId(id)) : [])],
          createdAt: Number(playlist.createdAt) || Date.now(),
          updatedAt: Number(playlist.updatedAt) || Date.now(),
        }))
      : [];
  } catch {
    playlists = [];
  }

  try {
    const playback = JSON.parse(localStorage.getItem(PLAYBACK_KEY) || "{}");
    shuffleEnabled = playback.shuffle === true;
    repeatMode = ["off", "all", "one"].includes(playback.repeat) ? playback.repeat : "off";
  } catch {
    shuffleEnabled = false;
    repeatMode = "off";
  }

  const saveFavorites = () => {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch { /* Listening still works when storage is unavailable. */ }
  };

  const savePlaylists = () => {
    try { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists)); } catch { /* Listening still works when storage is unavailable. */ }
  };

  const savePlaybackPreferences = () => {
    try { localStorage.setItem(PLAYBACK_KEY, JSON.stringify({ shuffle: shuffleEnabled, repeat: repeatMode })); } catch { /* Listening still works when storage is unavailable. */ }
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

  const playlistTracks = (playlist) => (playlist?.trackIds || []).map(byId).filter(Boolean);

  const playlistArtwork = (playlist) => {
    const entries = playlistTracks(playlist).slice(0, 4);
    if (!entries.length) return `<span class="playlist-cover-empty" aria-hidden="true">♫</span>`;
    return `<span class="playlist-cover-grid count-${entries.length}">${entries.map((track) => `<img src="${escapeHtml(track.cover)}" alt="" />`).join("")}</span>`;
  };

  const playlistCard = (playlist) => {
    const count = playlistTracks(playlist).length;
    return `<article class="playlist-card">
      <button class="playlist-card-main" data-playlist-open="${escapeHtml(playlist.id)}" aria-label="Open ${escapeHtml(playlist.name)}">
        ${playlistArtwork(playlist)}
        <span class="playlist-card-copy"><strong>${escapeHtml(playlist.name)}</strong><small>${count} song${count === 1 ? "" : "s"} · saved on this device</small></span>
      </button>
      <button class="playlist-card-play" data-playlist-play="${escapeHtml(playlist.id)}" aria-label="Play ${escapeHtml(playlist.name)}" ${count ? "" : "disabled"}>▶</button>
    </article>`;
  };

  const releaseCard = (track) => `
    <article class="release-card">
      <button class="release-art-button" data-play="${escapeHtml(track.id)}" data-play-context="all" aria-label="Play ${escapeHtml(track.title)}">
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
    $("#playlist-library").innerHTML = playlists.length
      ? `<div class="playlist-grid">${playlists.map(playlistCard).join("")}</div>`
      : `<div class="playlist-empty"><span aria-hidden="true">＋</span><div><strong>Create your first playlist</strong><p>Build your own listening order from the XotiicDuck catalog.</p></div><button data-playlist-create>Create playlist</button></div>`;
    $("#library-catalog").innerHTML = liked.length
      ? `<div class="track-table">
          <div class="track-table-head"><span>#</span><span>TITLE</span><span>ALBUM</span><span>◷</span></div>
          ${liked.map((track, index) => `<button class="track-row" data-play="${escapeHtml(track.id)}" data-play-context="favorites"><span class="track-number">${index + 1}</span><span class="track-name">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span></span><span class="track-album">${escapeHtml(track.album)}</span><span class="track-duration">${formatTime(track.duration)}</span></button>`).join("")}
        </div>`
      : emptyFavorites();
  };

  const currentQueue = () => activeQueueIds.map(byId).filter(Boolean);

  const setPlaybackQueue = (ids, label = "All tracks", playlistId = null) => {
    const validIds = [...new Set(ids.filter((id) => byId(id)))];
    activeQueueIds = validIds.length ? validIds : tracks.map((track) => track.id);
    playbackContextLabel = label;
    activeQueuePlaylistId = playlistId;
    shuffleBag = [];
    shuffleHistory = [];
    $("#now-playing-context").textContent = playbackContextLabel;
  };

  const renderSideQueue = () => {
    if (!currentTrack) return;
    const queue = currentQueue();
    const currentIndex = Math.max(0, queue.findIndex((track) => track.id === currentTrack.id));
    if (shuffleEnabled && !shuffleBag.length && !shuffleHistory.length && queue.length > 1) buildShuffleBag();
    const upcoming = (shuffleEnabled
      ? shuffleBag.slice().reverse().map(byId).filter(Boolean)
      : [...queue.slice(currentIndex + 1), ...queue.slice(0, currentIndex)]).slice(0, 3);
    $("#side-queue").innerHTML = upcoming
      .map((track) => `<button data-queue-play="${escapeHtml(track.id)}">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}</small></span><span>▶</span></button>`)
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
    $("#player-open").setAttribute("aria-label", `Open Now Playing for ${currentTrack.title}`);
    $("#now-playing-art").innerHTML = artwork(currentTrack);
    $("#now-playing-title").textContent = currentTrack.title;
    $("#now-playing-artist").textContent = currentTrack.artist;
    $("#now-playing-album").textContent = `${currentTrack.album}${currentTrack.year ? ` · ${currentTrack.year}` : ""}`;
    $("#now-playing-context").textContent = playbackContextLabel;
    $("#duration").textContent = formatTime(currentTrack.duration);
    for (const button of [$("#now-favorite"), $("#player-favorite"), $("#now-playing-favorite")]) {
      button.textContent = favorites.has(currentTrack.id) ? "♥" : "♡";
      button.classList.toggle("is-favorite", favorites.has(currentTrack.id));
      button.setAttribute("aria-label", favorites.has(currentTrack.id) ? `Remove ${currentTrack.title} from favorites` : `Save ${currentTrack.title} to favorites`);
    }
    const hasLyrics = Boolean(currentTrack.lyrics);
    $("#now-playing-lyrics-toggle").hidden = !hasLyrics;
    $("#lyrics-panel").hidden = !hasLyrics || !lyricsExpanded;
    $("#lyrics-copy").textContent = hasLyrics ? currentTrack.lyrics : "";
    $("#now-playing-lyrics-toggle").classList.toggle("active", hasLyrics && lyricsExpanded);
    $("#now-playing-lyrics-toggle").setAttribute("aria-expanded", String(hasLyrics && lyricsExpanded));
    updatePlaybackControls();
    updateProgressUI();
    renderSideQueue();
  };

  const renderQueue = () => {
    const naturalQueue = currentQueue();
    if (shuffleEnabled && !shuffleBag.length && !shuffleHistory.length && naturalQueue.length > 1) buildShuffleBag();
    const queue = shuffleEnabled
      ? [currentTrack, ...shuffleBag.slice().reverse().map(byId)].filter((track, index, list) => track && list.findIndex((entry) => entry.id === track.id) === index)
      : naturalQueue;
    $("#queue-context").textContent = playbackContextLabel;
    $("#queue-list").innerHTML = queue.map((track, index) => `
      <button data-queue-play="${escapeHtml(track.id)}" class="${track.id === currentTrack?.id ? "active" : ""}">
        <span class="queue-position">${index + 1}</span>${artwork(track, true)}
        <span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}</small></span><span>▶</span>
      </button>`).join("") || `<div class="queue-empty"><strong>The queue is empty</strong><span>Add music to a playlist or play from the catalog.</span></div>`;
  };

  const renderSearch = (query = "") => {
    const normalized = query.trim().toLowerCase();
    const matches = tracks.filter((track) => `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase().includes(normalized));
    $("#search-label").textContent = normalized ? `${matches.length} RESULTS` : "OFFICIAL RELEASES";
    $("#search-results").innerHTML = matches.length
      ? matches.map((track) => `<button data-play="${escapeHtml(track.id)}">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.album)}${track.year ? ` · ${escapeHtml(track.year)}` : ""}</small></span><span>▶</span></button>`).join("")
      : `<p class="search-empty">${tracks.length ? "No tracks match that search." : "No official releases are live yet."}</p>`;
  };

  const renderPlaylistDetail = () => {
    const playlist = playlists.find((entry) => entry.id === activePlaylistId);
    if (!playlist) return;
    const entries = playlistTracks(playlist);
    $("#playlist-detail-cover").innerHTML = playlistArtwork(playlist);
    $("#playlist-detail-title").textContent = playlist.name;
    $("#playlist-detail-count").textContent = `${entries.length} song${entries.length === 1 ? "" : "s"} · saved on this device`;
    $("#playlist-detail-play").disabled = entries.length === 0;
    $("#playlist-detail-shuffle").disabled = entries.length === 0;
    $("#playlist-detail-list").innerHTML = entries.length
      ? entries.map((track, index) => `<div class="playlist-detail-row">
          <button data-playlist-track="${escapeHtml(track.id)}" data-playlist-id="${escapeHtml(playlist.id)}">
            <span class="queue-position">${index + 1}</span>${artwork(track, true)}
            <span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}</small></span><span>▶</span>
          </button>
          <button class="playlist-remove" data-playlist-remove="${escapeHtml(track.id)}" data-playlist-id="${escapeHtml(playlist.id)}" aria-label="Remove ${escapeHtml(track.title)} from ${escapeHtml(playlist.name)}">×</button>
        </div>`).join("")
      : `<div class="playlist-detail-empty"><span>♫</span><strong>This playlist is empty</strong><p>Open a song and choose “Add to playlist.”</p></div>`;
  };

  const openPlaylist = (id) => {
    if (!playlists.some((playlist) => playlist.id === id)) return;
    activePlaylistId = id;
    renderPlaylistDetail();
    $("#playlist-layer").hidden = false;
    document.body.classList.add("modal-open");
  };

  const renderPlaylistPicker = () => {
    if (!currentTrack) return;
    $("#playlist-picker-track").textContent = currentTrack.title;
    $("#playlist-picker-list").innerHTML = playlists.length
      ? playlists.map((playlist) => {
          const added = playlist.trackIds.includes(currentTrack.id);
          const count = playlistTracks(playlist).length;
          return `<button data-playlist-toggle="${escapeHtml(playlist.id)}" class="${added ? "added" : ""}">
            ${playlistArtwork(playlist)}<span><strong>${escapeHtml(playlist.name)}</strong><small>${count} song${count === 1 ? "" : "s"}</small></span><b>${added ? "✓" : "＋"}</b>
          </button>`;
        }).join("")
      : `<div class="playlist-picker-empty"><span>＋</span><strong>No playlists yet</strong><p>Create one and this song will be added automatically.</p></div>`;
  };

  const openPlaylistPicker = () => {
    if (!currentTrack) return;
    renderPlaylistPicker();
    $("#playlist-picker-layer").hidden = false;
    document.body.classList.add("modal-open");
  };

  const openPlaylistEditor = ({ playlistId = null, trackId = null } = {}) => {
    const playlist = playlists.find((entry) => entry.id === playlistId);
    playlistEditorTargetId = playlist?.id || null;
    playlistEditorTrackId = byId(trackId)?.id || null;
    $("#playlist-editor-label").textContent = playlist ? "EDIT PLAYLIST" : "NEW PLAYLIST";
    $("#playlist-editor-title").textContent = playlist ? "Rename playlist" : "Create a playlist";
    $("#playlist-name").value = playlist?.name || "";
    $("#playlist-editor-submit").textContent = playlist ? "Save name" : "Create playlist";
    $("#playlist-editor-layer").hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(() => $("#playlist-name").focus(), 0);
  };

  const playPlaylist = (id, shuffled = false) => {
    const playlist = playlists.find((entry) => entry.id === id);
    const entries = playlistTracks(playlist);
    if (!playlist || !entries.length) return;
    setPlaybackQueue(entries.map((track) => track.id), playlist.name, playlist.id);
    shuffleEnabled = shuffled;
    savePlaybackPreferences();
    updatePlaybackControls();
    const first = shuffled ? entries[Math.floor(Math.random() * entries.length)] : entries[0];
    setTrack(first);
    closeModals();
  };

  const toggleTrackInPlaylist = (playlistId, trackId) => {
    const playlist = playlists.find((entry) => entry.id === playlistId);
    const track = byId(trackId);
    if (!playlist || !track) return;
    const exists = playlist.trackIds.includes(track.id);
    playlist.trackIds = exists ? playlist.trackIds.filter((id) => id !== track.id) : [...playlist.trackIds, track.id];
    playlist.updatedAt = Date.now();
    if (activeQueuePlaylistId === playlist.id) {
      activeQueueIds = playlist.trackIds.filter((id) => byId(id));
      if (!activeQueueIds.length) activeQueueIds = [currentTrack?.id].filter(Boolean);
      shuffleBag = [];
      shuffleHistory = [];
    }
    savePlaylists();
    renderLibrary();
    renderPlaylistPicker();
    if (activePlaylistId === playlist.id) renderPlaylistDetail();
    showToast(exists ? `Removed from ${playlist.name}.` : `Added to ${playlist.name}.`);
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

  const playbackDuration = () => Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : currentTrack?.duration || 0;

  const setRangeFill = (input, value, maximum) => {
    const percent = maximum > 0 ? Math.min(100, Math.max(0, (value / maximum) * 100)) : 0;
    input.style.setProperty("--fill", `${percent}%`);
  };

  const updatePositionState = () => {
    if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function") return;
    const duration = playbackDuration();
    if (!duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(duration, Math.max(0, audio.currentTime || 0)),
      });
    } catch {
      // Position controls are optional on browsers with partial Media Session support.
    }
  };

  const updateProgressUI = (requestedTime = audio.currentTime || 0) => {
    const duration = playbackDuration();
    const position = Math.min(duration || requestedTime, Math.max(0, requestedTime));
    for (const input of [$("#progress"), $("#now-playing-progress")]) {
      input.max = String(duration || 1);
      input.value = String(position);
      input.setAttribute("aria-valuetext", `${formatTime(position)} of ${formatTime(duration)}`);
      setRangeFill(input, position, duration);
    }
    $("#elapsed").textContent = formatTime(position);
    $("#duration").textContent = formatTime(duration);
    $("#now-playing-elapsed").textContent = formatTime(position);
    $("#now-playing-duration").textContent = formatTime(duration);
    $("#mini-progress").style.width = `${duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0}%`;
    updatePositionState();
  };

  const seekTo = (seconds) => {
    const duration = playbackDuration();
    const position = Math.min(duration || 0, Math.max(0, Number(seconds) || 0));
    audio.currentTime = position;
    updateProgressUI(position);
  };

  const updatePlaybackControls = () => {
    for (const button of [$("#shuffle"), $("#now-playing-shuffle")]) {
      button.classList.toggle("control-active", shuffleEnabled);
      button.setAttribute("aria-pressed", String(shuffleEnabled));
      button.setAttribute("aria-label", shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on");
    }
    for (const button of [$("#repeat"), $("#now-playing-repeat")]) {
      button.classList.toggle("control-active", repeatMode !== "off");
      button.setAttribute("aria-pressed", String(repeatMode !== "off"));
      button.setAttribute("aria-label", `Repeat mode: ${repeatMode}`);
    }
    $("#repeat").textContent = repeatMode === "one" ? "↻¹" : "↻";
    $("#now-playing-repeat-icon").textContent = repeatMode === "one" ? "↻¹" : "↻";
    $("#now-playing-shuffle-state").textContent = shuffleEnabled ? "On" : "Off";
    $("#now-playing-repeat-state").textContent = repeatMode === "one" ? "One" : repeatMode === "all" ? "All" : "Off";
  };

  const updatePlayButtons = () => {
    const playing = !audio.paused && !audio.ended;
    for (const button of [$("#play"), $("#now-playing-play")]) {
      button.textContent = playing ? "Ⅱ" : "▶";
      button.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
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
    updatePositionState();
  };

  const setTrack = async (track, autoplay = true) => {
    if (!track) return;
    const changed = currentTrack?.id !== track.id || audio.src !== new URL(track.audio, location.href).href;
    currentTrack = track;
    if (changed) {
      lyricsExpanded = false;
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

  const buildShuffleBag = () => {
    const candidates = currentQueue().map((track) => track.id).filter((id) => id !== currentTrack?.id);
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }
    shuffleBag = candidates;
  };

  const skip = (direction) => {
    const queue = currentQueue();
    if (!queue.length) return;
    if (shuffleEnabled && queue.length > 1) {
      if (direction < 0 && shuffleHistory.length) {
        const previousId = shuffleHistory.pop();
        if (currentTrack?.id && !shuffleBag.includes(currentTrack.id)) shuffleBag.push(currentTrack.id);
        setTrack(byId(previousId));
        return;
      }
      if (!shuffleBag.length) buildShuffleBag();
      const nextId = shuffleBag.pop();
      if (nextId) {
        if (currentTrack?.id) shuffleHistory.push(currentTrack.id);
        setTrack(byId(nextId));
      }
      return;
    }
    const currentIndex = Math.max(0, queue.findIndex((track) => track.id === currentTrack?.id));
    setTrack(queue[(currentIndex + direction + queue.length) % queue.length]);
  };

  const previousOrRestart = () => {
    if (audio.currentTime > 3) {
      seekTo(0);
      showToast("Restarted the current song.");
      return;
    }
    skip(-1);
  };

  const toggleFavorite = (id) => {
    if (!byId(id)) return;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    saveFavorites();
    renderAll();
  };

  const closeModals = () => {
    for (const layer of [$("#search-layer"), $("#queue-layer"), $("#info-layer"), $("#playlist-layer"), $("#playlist-picker-layer"), $("#playlist-editor-layer")]) layer.hidden = true;
    document.body.classList.remove("modal-open");
  };

  const openNowPlaying = () => {
    if (!currentTrack) return;
    renderCurrent();
    $("#now-playing-layer").hidden = false;
    document.body.classList.add("now-playing-open");
    $("#now-playing-close").focus();
  };

  const closeNowPlaying = () => {
    $("#now-playing-layer").hidden = true;
    document.body.classList.remove("now-playing-open");
    $("#player-open").focus({ preventScroll: true });
  };

  const toggleLyrics = () => {
    if (!currentTrack?.lyrics) return;
    lyricsExpanded = !lyricsExpanded;
    $("#lyrics-panel").hidden = !lyricsExpanded;
    $("#now-playing-lyrics-toggle").classList.toggle("active", lyricsExpanded);
    $("#now-playing-lyrics-toggle").setAttribute("aria-expanded", String(lyricsExpanded));
    if (lyricsExpanded) setTimeout(() => $("#lyrics-panel").scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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

  const installSteps = (steps) => `<ol class="install-steps">${steps.map((step) => `<li><span class="install-step-copy">${step}</span></li>`).join("")}</ol>`;

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

  const togglePlay = () => {
    if (!currentTrack) return;
    if (audio.paused) audio.play().catch(() => showToast("Tap play again to start the audio."));
    else audio.pause();
  };

  const toggleShuffle = () => {
    shuffleEnabled = !shuffleEnabled;
    shuffleBag = [];
    shuffleHistory = [];
    if (shuffleEnabled) buildShuffleBag();
    savePlaybackPreferences();
    updatePlaybackControls();
    renderSideQueue();
    showToast(shuffleEnabled ? "Shuffle is on." : "Shuffle is off.");
  };

  const cycleRepeat = () => {
    repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    savePlaybackPreferences();
    updatePlaybackControls();
    showToast(repeatMode === "one" ? "Repeating this song." : repeatMode === "all" ? "Repeating the queue." : "Repeat is off.");
  };

  const openQueue = () => {
    renderQueue();
    $("#queue-layer").hidden = false;
    document.body.classList.add("modal-open");
  };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.dataset.view) { event.preventDefault(); switchView(target.dataset.view); }
    if (target.dataset.play) {
      event.preventDefault();
      const favoriteIds = tracks.filter((track) => favorites.has(track.id)).map((track) => track.id);
      if (target.dataset.playContext === "favorites" && favoriteIds.length) setPlaybackQueue(favoriteIds, "Liked songs");
      else setPlaybackQueue(tracks.map((track) => track.id), "All tracks");
      setTrack(byId(target.dataset.play));
      closeModals();
    }
    if (target.dataset.queuePlay) { event.preventDefault(); setTrack(byId(target.dataset.queuePlay)); closeModals(); }
    if (target.dataset.playlistOpen) { event.preventDefault(); openPlaylist(target.dataset.playlistOpen); }
    if (target.dataset.playlistPlay) { event.preventDefault(); playPlaylist(target.dataset.playlistPlay); }
    if (target.dataset.playlistTrack) {
      event.preventDefault();
      const playlist = playlists.find((entry) => entry.id === target.dataset.playlistId);
      if (playlist) {
        setPlaybackQueue(playlist.trackIds, playlist.name, playlist.id);
        setTrack(byId(target.dataset.playlistTrack));
        closeModals();
      }
    }
    if (target.dataset.playlistRemove) { event.preventDefault(); toggleTrackInPlaylist(target.dataset.playlistId, target.dataset.playlistRemove); }
    if (target.dataset.playlistToggle) { event.preventDefault(); toggleTrackInPlaylist(target.dataset.playlistToggle, currentTrack?.id); }
    if (target.hasAttribute("data-playlist-create")) { event.preventDefault(); openPlaylistEditor(); }
    if (target.hasAttribute("data-playlist-create-current")) { event.preventDefault(); openPlaylistEditor({ trackId: currentTrack?.id }); }
    if (target.dataset.favorite) { event.preventDefault(); toggleFavorite(target.dataset.favorite); }
    if (target.hasAttribute("data-install")) { event.preventDefault(); requestInstall(); }
    if (target.hasAttribute("data-search-open")) { event.preventDefault(); renderSearch(); $("#search-layer").hidden = false; document.body.classList.add("modal-open"); setTimeout(() => $("#search-input").focus(), 0); }
    if (target.hasAttribute("data-modal-close")) { event.preventDefault(); closeModals(); }
    if (target.dataset.info) { event.preventDefault(); openInfo(target.dataset.info); }
    if (target.dataset.genre) { selectedGenre = target.dataset.genre; renderDiscover(); }
  });

  for (const button of [$("#play"), $("#now-playing-play")]) button.addEventListener("click", togglePlay);
  for (const button of [$("#previous"), $("#now-playing-previous")]) button.addEventListener("click", previousOrRestart);
  for (const button of [$("#next"), $("#now-playing-next")]) button.addEventListener("click", () => skip(1));
  for (const button of [$("#shuffle"), $("#now-playing-shuffle")]) button.addEventListener("click", toggleShuffle);
  for (const button of [$("#repeat"), $("#now-playing-repeat")]) button.addEventListener("click", cycleRepeat);
  for (const button of [$("#queue-open"), $("#now-playing-queue")]) button.addEventListener("click", openQueue);
  $("#now-favorite").addEventListener("click", () => currentTrack && toggleFavorite(currentTrack.id));
  $("#player-favorite").addEventListener("click", () => currentTrack && toggleFavorite(currentTrack.id));
  $("#now-playing-favorite").addEventListener("click", () => currentTrack && toggleFavorite(currentTrack.id));
  $("#player-open").addEventListener("click", openNowPlaying);
  $("#now-playing-close").addEventListener("click", closeNowPlaying);
  $("#now-playing-add-playlist").addEventListener("click", openPlaylistPicker);
  $("#now-playing-lyrics-toggle").addEventListener("click", toggleLyrics);
  $("#volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value); });
  for (const input of [$("#progress"), $("#now-playing-progress")]) input.addEventListener("input", (event) => seekTo(event.target.value));
  $("#search-input").addEventListener("input", (event) => renderSearch(event.target.value));

  $("#playlist-detail-play").addEventListener("click", () => playPlaylist(activePlaylistId));
  $("#playlist-detail-shuffle").addEventListener("click", () => playPlaylist(activePlaylistId, true));
  $("#playlist-detail-rename").addEventListener("click", () => openPlaylistEditor({ playlistId: activePlaylistId }));
  $("#playlist-detail-delete").addEventListener("click", () => {
    const playlist = playlists.find((entry) => entry.id === activePlaylistId);
    if (!playlist || !window.confirm(`Delete “${playlist.name}”? The songs will remain in the main catalog.`)) return;
    playlists = playlists.filter((entry) => entry.id !== playlist.id);
    if (activeQueuePlaylistId === playlist.id) setPlaybackQueue(tracks.map((track) => track.id), "All tracks");
    savePlaylists();
    activePlaylistId = null;
    renderLibrary();
    closeModals();
    showToast("Playlist deleted.");
  });

  $("#playlist-editor-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#playlist-name").value.trim().slice(0, 60);
    if (!name) return;
    const existing = playlists.find((entry) => entry.id === playlistEditorTargetId);
    if (existing) {
      const previousName = existing.name;
      existing.name = name;
      existing.updatedAt = Date.now();
      if (activeQueuePlaylistId === existing.id || playbackContextLabel === previousName) playbackContextLabel = name;
      showToast("Playlist renamed.");
    } else {
      const id = `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      playlists.unshift({ id, name, trackIds: playlistEditorTrackId ? [playlistEditorTrackId] : [], createdAt: Date.now(), updatedAt: Date.now() });
      activePlaylistId = id;
      showToast(playlistEditorTrackId ? `Created ${name} and added the song.` : `Created ${name}.`);
    }
    savePlaylists();
    renderLibrary();
    renderPlaylistPicker();
    if (activePlaylistId) renderPlaylistDetail();
    closeModals();
  });

  audio.addEventListener("play", () => { updatePlayButtons(); renderHome(); if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "playing"; } catch { /* Partial support. */ } } });
  audio.addEventListener("pause", () => { updatePlayButtons(); renderHome(); if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "paused"; } catch { /* Partial support. */ } } });
  audio.addEventListener("timeupdate", () => updateProgressUI());
  audio.addEventListener("loadedmetadata", () => updateProgressUI());
  audio.addEventListener("durationchange", () => updateProgressUI());
  audio.addEventListener("ended", () => {
    if (repeatMode === "one") { seekTo(0); audio.play().catch(() => undefined); return; }
    const queue = currentQueue();
    if (queue.length <= 1) { seekTo(0); updatePlayButtons(); return; }
    if (shuffleEnabled && repeatMode === "off" && !shuffleBag.length && shuffleHistory.length >= queue.length - 1) { seekTo(0); updatePlayButtons(); return; }
    const isLast = queue.findIndex((track) => track.id === currentTrack?.id) === queue.length - 1;
    if (isLast && repeatMode === "off" && !shuffleEnabled) { seekTo(0); updatePlayButtons(); return; }
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
    if (event.key === "Escape") {
      const hasModal = [$("#search-layer"), $("#queue-layer"), $("#info-layer"), $("#playlist-layer"), $("#playlist-picker-layer"), $("#playlist-editor-layer")].some((layer) => !layer.hidden);
      if (hasModal) closeModals();
      else if (!$("#now-playing-layer").hidden) closeNowPlaying();
    }
    if (event.code === "Space" && !typing && !event.target.closest("button, a")) { event.preventDefault(); togglePlay(); }
  });

  let nowPlayingDragStart = 0;
  $("#now-playing-header").addEventListener("pointerdown", (event) => { nowPlayingDragStart = event.clientY; });
  $("#now-playing-header").addEventListener("pointerup", (event) => {
    if (event.clientY - nowPlayingDragStart > 72) closeNowPlaying();
    nowPlayingDragStart = 0;
  });

  if ("mediaSession" in navigator) {
    const mediaActions = [
      ["play", () => audio.play()],
      ["pause", () => audio.pause()],
      ["nexttrack", () => skip(1)],
      ["previoustrack", previousOrRestart],
      ["seekbackward", (details) => seekTo(audio.currentTime - (details.seekOffset || 10))],
      ["seekforward", (details) => seekTo(audio.currentTime + (details.seekOffset || 10))],
      ["seekto", (details) => { if (Number.isFinite(details.seekTime)) seekTo(details.seekTime); }],
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

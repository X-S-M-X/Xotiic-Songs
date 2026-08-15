(() => {
  "use strict";

  const APP_VERSION = "14.0.0";

  const rawCatalog = Array.isArray(window.XOTIICDUCK_RELEASES)
    ? window.XOTIICDUCK_RELEASES
    : [];

  const safePath = (value) => {
    if (typeof value !== "string") return "";
    const cleaned = value.trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!cleaned || cleaned.includes("..") || /^(?:data|javascript|https?):/i.test(cleaned)) return "";
    return `./${cleaned.split("/").map(encodeURIComponent).join("/")}`;
  };

  const safeYouTubeUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim());
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      return url.protocol === "https:" && (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") ? url.href : "";
    } catch {
      return "";
    }
  };

  const text = (value) => String(value ?? "");
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const iconMarkup = (name, className = "ui-icon") => `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;

  const setIcon = (target, name) => {
    const use = target?.matches?.("use") ? target : target?.querySelector?.("use");
    if (use) use.setAttribute("href", `#icon-${name}`);
  };

  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : "";
  const validIsoTime = (value) => {
    const timestamp = Date.parse(text(value));
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const releaseIsPublic = (entry, now = Date.now()) => {
    if (entry?.status === "published") return true;
    return entry?.status === "scheduled" && validIsoTime(entry.releaseAt) > 0 && validIsoTime(entry.releaseAt) <= now;
  };
  const catalogTimestamp = (entry, index = 0) => validIsoTime(entry.publishedAt)
    || validIsoTime(entry.releaseAt)
    || (validDate(entry.releaseDate) ? Date.parse(`${entry.releaseDate}T00:00:00`) : 0)
    || index;
  const cleanList = (value, maximum = 12) => {
    const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    return [...new Set(source.map((entry) => text(entry).trim()).filter(Boolean))].slice(0, maximum);
  };
  const versionedMediaPath = (path, entry, index) => {
    const safe = safePath(path);
    if (!safe) return "";
    const version = validIsoTime(entry?.updatedAt)
      || validIsoTime(entry?.publishedAt)
      || validIsoTime(entry?.releaseAt)
      || catalogTimestamp(entry, index);
    return version ? `${safe}?v=${version}` : safe;
  };
  const buildPublicTracks = (now = Date.now()) => {
    const seenIds = new Set();
    return rawCatalog
    .filter((entry) => {
      const validId = typeof entry?.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id);
      const complete = releaseIsPublic(entry, now) && safePath(entry.audio) && safePath(entry.cover);
      const validDuration = Number.isFinite(entry?.duration) && entry.duration > 0;
      const unique = validId && !seenIds.has(entry.id);
      if (unique) seenIds.add(entry.id);
      return Boolean(unique && complete && validDuration && entry.title && entry.artist);
    })
    .map((entry) => {
      const index = rawCatalog.indexOf(entry);
      const releaseTypes = ["Single", "EP", "Album", "Soundtrack"];
      const legacyAlbum = text(entry.album || entry.release).trim();
      const releaseType = releaseTypes.includes(text(entry.releaseType))
        ? text(entry.releaseType)
        : releaseTypes.includes(legacyAlbum) ? legacyAlbum : "Single";
      const collection = text(entry.collection || entry.collectionTitle || (entry.releaseType && !releaseTypes.includes(legacyAlbum) ? legacyAlbum : "")).trim().slice(0, 100);
      const tags = cleanList(entry.tags, 16);
      return {
        id: entry.id,
        title: text(entry.title),
        artist: text(entry.artist),
        album: collection || releaseType,
        releaseType,
        collection,
        trackNumber: Math.max(0, Math.floor(Number(entry.trackNumber) || 0)),
        discNumber: Math.max(0, Math.floor(Number(entry.discNumber) || 0)),
        genre: text(entry.genre || "Music"),
        franchise: text(entry.franchise).trim().slice(0, 80),
        mood: text(entry.mood).trim().slice(0, 60),
        tags,
        credits: text(entry.credits).trim().slice(0, 500),
        explicit: entry.explicit === true,
        releaseDate: validDate(entry.releaseDate),
        year: /^\d{4}/.test(text(entry.releaseDate)) ? text(entry.releaseDate).slice(0, 4) : "",
        duration: Number(entry.duration),
        audio: versionedMediaPath(entry.audio, entry, index),
        cover: versionedMediaPath(entry.cover, entry, index),
        description: text(entry.description).trim(),
        lyrics: typeof entry.lyrics === "string" ? entry.lyrics.trim().slice(0, 30000) : "",
        youtubeUrl: safeYouTubeUrl(entry.youtubeUrl || entry.youtube),
        catalogTimestamp: catalogTimestamp(entry, index),
        catalogOrder: index,
      };
    });
  };

  let tracks = buildPublicTracks();

  const byId = (id) => tracks.find((track) => track.id === id);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const audio = $("#audio");
  const app = $("#app");
  const FAVORITES_KEY = "xotiicduck-favorites";
  const PLAYLISTS_KEY = "xotiicduck-playlists-v1";
  const PLAYBACK_KEY = "xotiicduck-playback-v1";
  const SESSION_KEY = "xotiicduck-session-v1";
  const LISTENING_KEY = "xotiicduck-listening-v1";
  const LIBRARY_TAB_KEY = "xotiicduck-library-tab-v1";
  const SLEEP_KEY = "xotiicduck-sleep-v1";
  const LISTENING_INSIGHTS_ENABLED = false;
  const BACKUP_VERSION = 1;
  const offlineApi = globalThis.XotiicOffline;
  const appearanceApi = globalThis.XotiicAppearance;
  const params = new URLSearchParams(location.search);
  let restoredSession = {};
  try { restoredSession = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}"); } catch { restoredSession = {}; }
  const sharedTrack = byId(params.get("track"));
  const restoredTrack = byId(restoredSession.trackId);
  let currentTrack = sharedTrack || restoredTrack || tracks[0] || null;
  let currentView = ["home", "discover", "library"].includes(params.get("view")) ? params.get("view") : "home";
  let selectedGenre = "All tracks";
  let selectedReleaseType = "all";
  let discoverQuery = "";
  let discoverSort = "latest";
  let shuffleEnabled = false;
  let repeatMode = "off";
  let activeQueueIds = Array.isArray(restoredSession.queueIds)
    ? [...new Set(restoredSession.queueIds.filter((id) => byId(id)))]
    : tracks.map((track) => track.id);
  if (currentTrack && !activeQueueIds.includes(currentTrack.id)) activeQueueIds.unshift(currentTrack.id);
  let playbackContextLabel = typeof restoredSession.context === "string" && restoredSession.context.trim() ? restoredSession.context.slice(0, 80) : "All tracks";
  let activeQueuePlaylistId = typeof restoredSession.playlistId === "string" ? restoredSession.playlistId : null;
  let shuffleBag = [];
  let shuffleHistory = [];
  let playlists = [];
  let activePlaylistId = null;
  let playlistEditorTargetId = null;
  let playlistEditorTrackId = null;
  let playlistEditorQueueIds = [];
  let activeCollectionKey = "";
  let lyricsExpanded = false;
  let installPrompt = null;
  let installAccepted = false;
  let toastTimer = null;
  let favorites = new Set();
  let offlineIds = new Set(offlineApi?.readIndex?.() || []);
  let pendingRestorePosition = Number(restoredSession.position) > 0 ? Number(restoredSession.position) : 0;
  let lastSessionWrite = 0;
  let activeModal = null;
  let modalReturnFocus = null;
  let serviceWorkerRegistration = null;
  let reloadingForUpdate = false;
  let scheduleTimer = null;
  let listening = { recent: [], months: {} };
  let listenProgress = { trackId: null, seconds: 0, counted: false, lastPosition: 0 };
  let activeLibraryTab = "playlists";
  let miniPlayerGesture = null;
  let suppressPlayerOpenUntil = 0;
  let sleepEndsAt = 0;
  let stopAfterCurrent = false;
  let sleepTimer = null;
  const downloadingIds = new Set();

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

  try {
    const stored = JSON.parse(localStorage.getItem(LISTENING_KEY) || "{}");
    listening = {
      recent: Array.isArray(stored.recent) ? stored.recent.filter((entry) => byId(entry?.id) && Number.isFinite(entry?.playedAt)).slice(0, 20) : [],
      months: stored.months && typeof stored.months === "object" ? stored.months : {},
    };
  } catch {
    listening = { recent: [], months: {} };
  }

  try {
    const storedTab = localStorage.getItem(LIBRARY_TAB_KEY);
    activeLibraryTab = ["playlists", "liked", "offline"].includes(storedTab) ? storedTab : "playlists";
  } catch {
    activeLibraryTab = "playlists";
  }

  try {
    const storedSleep = JSON.parse(localStorage.getItem(SLEEP_KEY) || "{}");
    sleepEndsAt = Number(storedSleep.endsAt) > Date.now() ? Number(storedSleep.endsAt) : 0;
    stopAfterCurrent = storedSleep.afterTrack === true;
  } catch {
    sleepEndsAt = 0;
    stopAfterCurrent = false;
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

  const saveListening = () => {
    try { localStorage.setItem(LISTENING_KEY, JSON.stringify(listening)); } catch { /* Private mode may block local listening history. */ }
  };

  const saveSession = (force = false) => {
    const now = Date.now();
    if (!force && now - lastSessionWrite < 4000) return;
    lastSessionWrite = now;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        trackId: currentTrack?.id || null,
        position: Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime * 10) / 10 : 0,
        volume: Number.isFinite(audio.volume) ? audio.volume : 0.72,
        queueIds: activeQueueIds.filter((id) => byId(id)),
        context: playbackContextLabel,
        playlistId: activeQueuePlaylistId,
        updatedAt: now,
      }));
    } catch {
      // Playback remains available when private browser storage is blocked.
    }
  };

  const saveSleepState = () => {
    try { localStorage.setItem(SLEEP_KEY, JSON.stringify({ endsAt: sleepEndsAt, afterTrack: stopAfterCurrent })); } catch { /* The timer still works for this visit. */ }
  };

  const sleepRemainingLabel = () => {
    if (stopAfterCurrent) return "After this song";
    if (!sleepEndsAt) return "Sleep timer";
    const minutes = Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60000));
    return `${minutes} min left`;
  };

  const syncSleepUi = () => {
    const active = stopAfterCurrent || sleepEndsAt > Date.now();
    const label = sleepRemainingLabel();
    $("#now-playing-sleep-label").textContent = label;
    $("#now-playing-sleep").classList.toggle("is-active", active);
    $("#now-playing-sleep").setAttribute("aria-pressed", String(active));
    $("#sleep-status").textContent = active
      ? stopAfterCurrent ? "Playback will stop when this song finishes." : `Playback will stop automatically. ${label}.`
      : "Stop playback automatically without changing the sound.";
    $("[data-sleep-cancel]").disabled = !active;
  };

  const clearSleepTimer = ({ announce = true } = {}) => {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepEndsAt = 0;
    stopAfterCurrent = false;
    saveSleepState();
    syncSleepUi();
    if (announce) showToast("Sleep timer turned off.");
  };

  const checkSleepTimer = () => {
    if (!sleepEndsAt || Date.now() < sleepEndsAt) {
      syncSleepUi();
      return;
    }
    audio.pause();
    sleepEndsAt = 0;
    stopAfterCurrent = false;
    saveSleepState();
    syncSleepUi();
    showToast("Sleep timer finished. Playback stopped.");
  };

  const scheduleSleepTimer = () => {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    if (!sleepEndsAt) return;
    const delay = Math.max(0, sleepEndsAt - Date.now());
    sleepTimer = setTimeout(checkSleepTimer, Math.min(delay, 2147483647));
  };

  const startSleepTimer = (minutes) => {
    const amount = Math.max(1, Number(minutes) || 0);
    stopAfterCurrent = false;
    sleepEndsAt = Date.now() + amount * 60000;
    saveSleepState();
    scheduleSleepTimer();
    syncSleepUi();
    closeModals();
    showToast(`Playback will stop in ${amount} minutes.`);
  };

  const stopAfterThisTrack = () => {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepEndsAt = 0;
    stopAfterCurrent = true;
    saveSleepState();
    syncSleepUi();
    closeModals();
    showToast("Playback will stop after this song.");
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  };

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(date);
  };

  const formatBytes = (bytes) => {
    const amount = Number(bytes) || 0;
    if (amount < 1024) return `${amount} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = amount / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  };

  const artwork = (track, compact = false) => `
    <div class="artwork uploaded-artwork${compact ? " artwork-compact" : ""}">
      <img src="${escapeHtml(track.cover)}" alt="${escapeHtml(track.title)} cover" loading="lazy" decoding="async" />
    </div>`;

  const emptyCatalog = () => `
    <div class="empty-state catalog-empty-state">
      <span>${iconMarkup("music")}</span>
      <h2>Official releases are being prepared.</h2>
      <p>Tracks appear here only after the final MP3 and square cover have been published.</p>
      <a class="primary-button" href="https://www.youtube.com/@XotiicDuck" target="_blank" rel="noreferrer">${iconMarkup("play")}<span>Visit XotiicDuck on YouTube</span></a>
    </div>`;

  const emptyFavorites = () => `
    <div class="empty-state">
      <span>${iconMarkup("heart-filled")}</span>
      <h2>Your favorites will live here.</h2>
      <p>Save a released track and it will appear in this library on the same device.</p>
    </div>`;

  const playlistTracks = (playlist) => (playlist?.trackIds || []).map(byId).filter(Boolean);

  const isCurrentTrack = (trackId) => currentTrack?.id === trackId;
  const isTrackPlaying = (trackId) => isCurrentTrack(trackId) && !audio.paused && !audio.ended;
  const trackStateClass = (trackId) => isCurrentTrack(trackId) ? ` is-current-track${isTrackPlaying(trackId) ? " is-playing" : ""}` : "";
  const trackActionLabel = (track) => `${isTrackPlaying(track.id) ? "Pause" : "Play"} ${track.title}`;
  const trackActionIcon = (track, className = "trailing-icon") => `<span class="${className}" data-track-play-icon>${iconMarkup(isTrackPlaying(track.id) ? "pause" : "play")}</span>`;

  const playlistArtwork = (playlist) => {
    const entries = playlistTracks(playlist).slice(0, 4);
    if (!entries.length) return `<span class="playlist-cover-empty" aria-hidden="true">${iconMarkup("music")}</span>`;
    return `<span class="playlist-cover-grid count-${entries.length}">${entries.map((track) => `<img src="${escapeHtml(track.cover)}" alt="" loading="lazy" decoding="async" />`).join("")}</span>`;
  };

  const playlistCard = (playlist) => {
    const count = playlistTracks(playlist).length;
    const active = activeQueuePlaylistId === playlist.id && Boolean(currentTrack) && playlist.trackIds.includes(currentTrack.id);
    const playing = active && isTrackPlaying(currentTrack.id);
    const verb = playing ? "Pause" : active && !audio.ended ? "Resume" : "Play";
    return `<article class="playlist-card${active ? " is-current-playlist" : ""}${playing ? " is-playing" : ""}">
      <button class="playlist-card-main" data-playlist-open="${escapeHtml(playlist.id)}" aria-label="Open ${escapeHtml(playlist.name)}">
        ${playlistArtwork(playlist)}
        <span class="playlist-card-copy"><strong>${escapeHtml(playlist.name)}</strong><small>${count} song${count === 1 ? "" : "s"} · saved on this device</small></span>
      </button>
      <button class="playlist-card-play icon-only-button${active ? " is-current-playlist" : ""}${playing ? " is-playing" : ""}" data-playlist-play="${escapeHtml(playlist.id)}" data-playlist-action="${escapeHtml(playlist.id)}" aria-label="${verb} ${escapeHtml(playlist.name)}" ${count ? "" : "disabled"}><span data-playlist-play-icon>${iconMarkup(playing ? "pause" : "play")}</span></button>
    </article>`;
  };

  const releaseCard = (track) => `
    <article class="release-card${trackStateClass(track.id)}">
      <button class="release-art-button${trackStateClass(track.id)}" data-play="${escapeHtml(track.id)}" data-play-context="all" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}">
        ${artwork(track)}
        ${offlineIds.has(track.id) ? `<span class="offline-badge" title="Available offline">${iconMarkup("check")}<span>Offline</span></span>` : ""}
        ${trackActionIcon(track, "card-play")}
      </button>
      <div class="release-meta">
        <div><h3>${escapeHtml(track.title)}</h3><p>${escapeHtml(track.album)}${track.year ? ` · ${escapeHtml(track.year)}` : ""}</p></div>
        <button class="icon-button icon-only-button${favorites.has(track.id) ? " is-favorite" : ""}" data-favorite="${escapeHtml(track.id)}" aria-label="${favorites.has(track.id) ? "Remove from" : "Save to"} favorites">${iconMarkup(favorites.has(track.id) ? "heart-filled" : "heart")}</button>
      </div>
    </article>`;

  const latestTracks = () => [...tracks].sort((left, right) => right.catalogTimestamp - left.catalogTimestamp || right.catalogOrder - left.catalogOrder || right.id.localeCompare(left.id));
  const searchableTrackText = (track) => [
    track.title,
    track.artist,
    track.album,
    track.releaseType,
    track.collection,
    track.genre,
    track.franchise,
    track.mood,
    track.tags.join(" "),
    track.credits,
    track.description,
    track.lyrics,
  ].join(" ").toLowerCase();
  const collectionKey = (track) => `${track.collection.toLowerCase()}::${track.artist.toLowerCase()}`;
  const releaseCollections = () => {
    const groups = new Map();
    for (const track of tracks.filter((entry) => entry.collection)) {
      const key = collectionKey(track);
      if (!groups.has(key)) groups.set(key, { key, title: track.collection, artist: track.artist, releaseType: track.releaseType, year: track.year, cover: track.cover, tracks: [] });
      groups.get(key).tracks.push(track);
    }
    return [...groups.values()]
      .map((collection) => ({
        ...collection,
        tracks: collection.tracks.sort((left, right) => (left.discNumber || 1) - (right.discNumber || 1) || (left.trackNumber || 999) - (right.trackNumber || 999) || left.catalogTimestamp - right.catalogTimestamp),
      }))
      .sort((left, right) => Math.max(...right.tracks.map((track) => track.catalogTimestamp)) - Math.max(...left.tracks.map((track) => track.catalogTimestamp))
        || Math.max(...right.tracks.map((track) => track.catalogOrder)) - Math.max(...left.tracks.map((track) => track.catalogOrder)));
  };
  const findCollection = (key) => releaseCollections().find((collection) => collection.key === key);
  const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  const recentlyPlayedTracks = () => listening.recent
    .map((entry) => byId(entry.id))
    .filter(Boolean)
    .slice(0, 4);

  const currentMonthlyLeaders = () => {
    const month = listening.months[monthKey()];
    if (!month || typeof month !== "object") return [];
    return Object.entries(month)
      .map(([id, stats]) => ({ track: byId(id), plays: Math.max(0, Number(stats?.plays) || 0), lastPlayedAt: Number(stats?.lastPlayedAt) || 0 }))
      .filter((entry) => entry.track && entry.plays > 0)
      .sort((left, right) => right.plays - left.plays || right.lastPlayedAt - left.lastPlayedAt)
      .slice(0, 5);
  };

  const renderListeningSections = () => {
    if (!LISTENING_INSIGHTS_ENABLED) {
      $("#recently-played-section").hidden = true;
      $("#monthly-chart-section").hidden = true;
      $("#recently-played").replaceChildren();
      $("#monthly-chart").replaceChildren();
      return;
    }
    const recent = recentlyPlayedTracks();
    const recentSection = $("#recently-played-section");
    recentSection.hidden = recent.length === 0;
    $("#recently-played").innerHTML = recent.length
      ? `<div class="release-grid listening-grid">${recent.map(releaseCard).join("")}</div>`
      : "";

    const leaders = currentMonthlyLeaders();
    const chartSection = $("#monthly-chart-section");
    chartSection.hidden = leaders.length === 0;
    $("#monthly-chart").innerHTML = leaders.length
      ? `<div class="monthly-track-list">${leaders.map(({ track, plays }, index) => `<button class="monthly-track-row${trackStateClass(track.id)}" data-play="${escapeHtml(track.id)}" data-play-context="all" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}"><span class="monthly-rank">${String(index + 1).padStart(2, "0")}</span>${artwork(track, true)}<span class="monthly-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${plays} qualified play${plays === 1 ? "" : "s"}</small></span><span class="monthly-play" data-track-play-icon>${iconMarkup(isTrackPlaying(track.id) ? "pause" : "play")}</span></button>`).join("")}</div>`
      : "";
  };

  const markRecentlyPlayed = (track) => {
    if (!LISTENING_INSIGHTS_ENABLED) return;
    if (!track) return;
    listening.recent = [{ id: track.id, playedAt: Date.now() }, ...listening.recent.filter((entry) => entry.id !== track.id)].slice(0, 20);
    saveListening();
    renderListeningSections();
  };

  const recordQualifiedListen = (track) => {
    if (!track) return;
    const key = monthKey();
    if (!listening.months[key] || typeof listening.months[key] !== "object") listening.months[key] = {};
    const previous = listening.months[key][track.id] || {};
    listening.months[key][track.id] = {
      plays: Math.max(0, Number(previous.plays) || 0) + 1,
      lastPlayedAt: Date.now(),
    };
    const retainedMonths = Object.keys(listening.months).sort().slice(-13);
    listening.months = Object.fromEntries(retainedMonths.map((month) => [month, listening.months[month]]));
    saveListening();
    renderListeningSections();
  };

  const resetListenProgress = () => {
    listenProgress = { trackId: currentTrack?.id || null, seconds: 0, counted: false, lastPosition: Number(audio.currentTime) || 0 };
  };

  const updateListeningProgress = () => {
    if (!LISTENING_INSIGHTS_ENABLED) return;
    if (!currentTrack) return;
    if (listenProgress.trackId !== currentTrack.id) resetListenProgress();
    const position = Number(audio.currentTime) || 0;
    const delta = position - listenProgress.lastPosition;
    listenProgress.lastPosition = position;
    if (!audio.paused && delta > 0 && delta <= 3) listenProgress.seconds += delta;
    const threshold = Math.max(1, Math.min(30, playbackDuration() * 0.5));
    if (!listenProgress.counted && listenProgress.seconds >= threshold) {
      listenProgress.counted = true;
      recordQualifiedListen(currentTrack);
    }
  };

  const renderHome = () => {
    const latest = latestTracks();
    $("#live-count").textContent = String(tracks.length).padStart(2, "0");
    $("#catalog-heading").textContent = tracks.length ? "Latest releases" : "The catalog opens with the first release";
    $("#view-all").hidden = tracks.length === 0;
    $("#home-catalog").innerHTML = tracks.length
      ? `<div class="release-grid">${latest.slice(0, 4).map(releaseCard).join("")}</div>`
      : emptyCatalog();
    renderListeningSections();

    const primary = $("#hero-primary");
    if (tracks.length) {
      const latestTrack = latest[0];
      const heroCover = $("#hero-anime-cover");
      heroCover.src = latestTrack.cover;
      heroCover.hidden = false;
      $("#hero-track-label").textContent = "LATEST TRANSMISSION";
      $("#hero-track-title").textContent = latestTrack.title;
      $("#hero-track-meta").textContent = `${latestTrack.artist} · ${latestTrack.album}`;
      document.documentElement.style.setProperty("--hero-cover-image", `url(${JSON.stringify(latestTrack.cover)})`);
      const playing = isTrackPlaying(latestTrack.id);
      primary.removeAttribute("href");
      primary.removeAttribute("target");
      primary.removeAttribute("rel");
      primary.dataset.play = latestTrack.id;
      primary.dataset.trackAction = latestTrack.id;
      primary.classList.toggle("is-current-track", isCurrentTrack(latestTrack.id));
      primary.classList.toggle("is-playing", playing);
      primary.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${latestTrack.title}`);
      primary.innerHTML = `<span data-track-play-icon>${iconMarkup(playing ? "pause" : "play")}</span><span data-track-play-label data-track-play-label-suffix=" latest">${playing ? "Pause" : "Play"} latest</span>`;
    } else {
      $("#hero-anime-cover").hidden = true;
      document.documentElement.style.removeProperty("--hero-cover-image");
    }
  };

  const renderDiscover = () => {
    const genres = ["All tracks", ...new Set(tracks.map((track) => track.genre))];
    if (!genres.includes(selectedGenre)) selectedGenre = "All tracks";
    $("#genre-row").hidden = tracks.length === 0;
    $("#genre-row").innerHTML = genres.map((genre) => `<button data-genre="${escapeHtml(genre)}" class="${genre === selectedGenre ? "active" : ""}">${escapeHtml(genre)}</button>`).join("");
    const query = discoverQuery.trim().toLowerCase();
    let visible = tracks.filter((track) => selectedGenre === "All tracks" || track.genre === selectedGenre)
      .filter((track) => selectedReleaseType === "all" || track.releaseType === selectedReleaseType)
      .filter((track) => !query || searchableTrackText(track).includes(query));
    visible.sort((left, right) => {
      if (discoverSort === "oldest") return left.catalogTimestamp - right.catalogTimestamp || left.title.localeCompare(right.title);
      if (discoverSort === "title") return left.title.localeCompare(right.title);
      if (discoverSort === "duration") return right.duration - left.duration || left.title.localeCompare(right.title);
      return right.catalogTimestamp - left.catalogTimestamp || right.catalogOrder - left.catalogOrder || right.id.localeCompare(left.id);
    });
    $("#discover-count").textContent = `${visible.length} release${visible.length === 1 ? "" : "s"}`;
    $("#discover-catalog").innerHTML = tracks.length
      ? visible.length
        ? `<div class="release-grid expanded">${visible.map(releaseCard).join("")}</div>`
        : `<div class="empty-state"><span>${iconMarkup("search")}</span><h2>No matching releases</h2><p>Try a different title, release type, genre or keyword.</p></div>`
      : emptyCatalog();

    const collections = releaseCollections();
    $("#collection-section").hidden = collections.length === 0 || Boolean(query) || selectedReleaseType === "Single";
    $("#collection-grid").innerHTML = collections.map((collection) => `<button class="collection-card" data-collection-open="${escapeHtml(collection.key)}" aria-label="Open ${escapeHtml(collection.title)}">
      <span class="collection-card-art"><img src="${escapeHtml(collection.cover)}" alt="" loading="lazy" decoding="async" /></span>
      <span class="collection-card-copy"><strong>${escapeHtml(collection.title)}</strong><small>${escapeHtml(collection.releaseType)} · ${collection.tracks.length} track${collection.tracks.length === 1 ? "" : "s"}${collection.year ? ` · ${escapeHtml(collection.year)}` : ""}</small></span>
    </button>`).join("");
  };

  const updateStorageCopy = async () => {
    const copy = $("#offline-storage-copy");
    if (!copy) return;
    if (!offlineApi?.supported?.()) {
      copy.textContent = "Offline storage unavailable";
      return;
    }
    const { usage, quota } = await offlineApi.estimate();
    const count = offlineIds.size;
    copy.textContent = quota
      ? `${count} saved · ${formatBytes(usage)} of ${formatBytes(quota)} device storage used`
      : `${count} song${count === 1 ? "" : "s"} saved on this device`;
  };

  const updateOfflineButton = (progressValue = null) => {
    const button = $("#now-playing-offline");
    const label = $("#now-playing-offline-label");
    if (!button || !label || !currentTrack) return;
    const downloading = downloadingIds.has(currentTrack.id);
    const saved = offlineIds.has(currentTrack.id);
    button.disabled = downloading || !offlineApi?.supported?.();
    button.classList.toggle("active", saved);
    button.classList.toggle("downloading", downloading);
    button.setAttribute("aria-pressed", String(saved));
    setIcon(button, saved ? "check" : "download");
    if (downloading) label.textContent = `Saving ${Math.round((progressValue || 0) * 100)}%`;
    else if (!offlineApi?.supported?.()) label.textContent = "Unavailable";
    else label.textContent = saved ? "Remove offline" : "Save offline";
  };

  const refreshOfflineState = async () => {
    if (!offlineApi?.supported?.()) {
      offlineIds = new Set();
      renderLibrary();
      updateOfflineButton();
      return;
    }
    try { offlineIds = new Set(await offlineApi.reconcile(tracks)); } catch { offlineIds = new Set(offlineApi.readIndex?.() || []); }
    renderLibrary();
    updateOfflineButton();
    updateStorageCopy();
  };

  const toggleOffline = async (track) => {
    if (!track || downloadingIds.has(track.id)) return;
    if (!offlineApi?.supported?.()) {
      showToast("Offline saving is unavailable in this browser.");
      return;
    }
    if (offlineIds.has(track.id)) {
      if (!window.confirm(`Remove “${track.title}” from offline songs on this device?`)) return;
      try {
        await offlineApi.remove(track);
        offlineIds.delete(track.id);
        renderAll();
        updateStorageCopy();
        showToast(`${track.title} was removed from offline songs.`);
      } catch {
        showToast("The saved files could not be removed. Try again.");
      }
      return;
    }

    if (!navigator.onLine) {
      showToast("Connect to the internet once to save this song offline.");
      return;
    }
    downloadingIds.add(track.id);
    if (currentTrack?.id === track.id) updateOfflineButton(0);
    try {
      await offlineApi.save(track, ({ ratio }) => {
        if (currentTrack?.id === track.id) updateOfflineButton(ratio);
      });
      offlineIds.add(track.id);
      showToast(`${track.title} is ready offline.`);
    } catch (error) {
      showToast(error?.message || "This song could not be saved offline.");
    } finally {
      downloadingIds.delete(track.id);
      renderAll();
      updateStorageCopy();
    }
  };

  const setLibraryTab = (tab, { focus = false } = {}) => {
    if (!["playlists", "liked", "offline"].includes(tab)) return;
    activeLibraryTab = tab;
    try { localStorage.setItem(LIBRARY_TAB_KEY, tab); } catch { /* The switcher still works for this visit. */ }
    for (const button of $$('[data-library-tab]')) {
      const selected = button.dataset.libraryTab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle("active", selected);
      if (selected && focus) button.focus();
    }
    for (const panel of $$('[data-library-panel]')) panel.hidden = panel.dataset.libraryPanel !== tab;
  };

  const renderLibrary = () => {
    const liked = tracks.filter((track) => favorites.has(track.id));
    const saved = tracks.filter((track) => offlineIds.has(track.id));
    $("#library-playlist-count").textContent = String(playlists.length);
    $("#library-liked-count").textContent = String(liked.length);
    $("#library-offline-count").textContent = String(saved.length);
    $("#playlist-library").innerHTML = playlists.length
      ? `<div class="playlist-grid">${playlists.map(playlistCard).join("")}</div>`
      : `<div class="playlist-empty"><span aria-hidden="true">${iconMarkup("plus")}</span><div><strong>Create your first playlist</strong><p>Build your own listening order from the XotiicDuck catalog.</p></div><button data-playlist-create>Create playlist</button></div>`;
    $("#library-catalog").innerHTML = liked.length
      ? `<div class="track-table">
          <div class="track-table-head"><span>#</span><span>TITLE</span><span>ALBUM</span><span class="icon-frame">${iconMarkup("clock")}</span></div>
          ${liked.map((track, index) => `<button class="track-row${trackStateClass(track.id)}" data-play="${escapeHtml(track.id)}" data-play-context="favorites" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}"><span class="track-number"><span class="track-index">${index + 1}</span>${trackActionIcon(track, "track-index-action")}</span><span class="track-name">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span></span><span class="track-album">${escapeHtml(track.album)}</span><span class="track-duration">${formatTime(track.duration)}</span></button>`).join("")}
        </div>`
      : emptyFavorites();
    $("#offline-catalog").innerHTML = saved.length
      ? `<div class="offline-track-list">${saved.map((track) => `<article class="offline-track-row${trackStateClass(track.id)}">
          <button class="offline-track-main${trackStateClass(track.id)}" data-play="${escapeHtml(track.id)}" data-play-context="offline" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)} <span class="offline-saved-copy">${iconMarkup("check")} Saved</span></small></span><span class="offline-ready" data-track-play-icon>${iconMarkup(isTrackPlaying(track.id) ? "pause" : "play")}<span data-track-play-label>${isTrackPlaying(track.id) ? "Pause" : "Play"}</span></span></button>
          <button class="offline-remove" data-offline-toggle="${escapeHtml(track.id)}" aria-label="Remove offline download for ${escapeHtml(track.title)}">${iconMarkup("close")}<span>Remove</span></button>
        </article>`).join("")}</div>`
      : `<div class="offline-empty"><span>${iconMarkup("download")}</span><div><strong>No offline songs yet</strong><p>Open a song, then choose “Save offline.” Download it once and it can play without internet on this device.</p></div></div>`;
    setLibraryTab(activeLibraryTab);
    updateStorageCopy();
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
    saveSession(true);
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
      .map((track) => `<button class="${trackStateClass(track.id).trim()}" data-queue-play="${escapeHtml(track.id)}" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}</small></span>${trackActionIcon(track)}</button>`)
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
    document.documentElement.style.setProperty("--current-cover-image", `url(${JSON.stringify(currentTrack.cover)})`);
    $("#duration").textContent = formatTime(currentTrack.duration);
    for (const button of [$("#now-favorite"), $("#player-favorite"), $("#now-playing-favorite")]) {
      setIcon(button, favorites.has(currentTrack.id) ? "heart-filled" : "heart");
      button.classList.toggle("is-favorite", favorites.has(currentTrack.id));
      button.setAttribute("aria-label", favorites.has(currentTrack.id) ? `Remove ${currentTrack.title} from favorites` : `Save ${currentTrack.title} to favorites`);
    }
    const releaseDate = formatDate(currentTrack.releaseDate);
    const metadata = [
      currentTrack.collection,
      currentTrack.franchise,
      currentTrack.mood,
      ...currentTrack.tags.slice(0, 5),
      currentTrack.explicit ? "Explicit" : "",
    ].filter(Boolean);
    const hasAbout = Boolean(releaseDate || currentTrack.description || currentTrack.youtubeUrl || currentTrack.credits || metadata.length);
    $("#track-about").hidden = !hasAbout;
    $("#track-release-date").textContent = releaseDate ? `Released ${releaseDate}` : "";
    $("#track-metadata").hidden = metadata.length === 0;
    $("#track-metadata").innerHTML = metadata.map((entry) => `<span>${escapeHtml(entry)}</span>`).join("");
    $("#track-description").textContent = currentTrack.description;
    $("#track-description").hidden = !currentTrack.description;
    $("#track-credits").textContent = currentTrack.credits ? `Credits: ${currentTrack.credits}` : "";
    $("#track-credits").hidden = !currentTrack.credits;
    $("#track-youtube").hidden = !currentTrack.youtubeUrl;
    if (currentTrack.youtubeUrl) $("#track-youtube").href = currentTrack.youtubeUrl;
    const hasLyrics = Boolean(currentTrack.lyrics);
    $("#now-playing-lyrics-toggle").hidden = !hasLyrics;
    $("#lyrics-panel").hidden = !hasLyrics || !lyricsExpanded;
    $("#lyrics-copy").textContent = hasLyrics ? currentTrack.lyrics : "";
    $("#now-playing-lyrics-toggle").classList.toggle("active", hasLyrics && lyricsExpanded);
    $("#now-playing-lyrics-toggle").setAttribute("aria-expanded", String(hasLyrics && lyricsExpanded));
    updateOfflineButton();
    updatePlaybackControls();
    updateProgressUI();
    renderSideQueue();
  };

  const renderQueue = () => {
    const naturalQueue = currentQueue();
    $("#queue-context").textContent = playbackContextLabel;
    $("#queue-clear").disabled = naturalQueue.length <= 1;
    $("#queue-save").disabled = naturalQueue.length === 0;
    $("#queue-list").innerHTML = naturalQueue.map((track, index) => {
      const current = isCurrentTrack(track.id);
      const playing = isTrackPlaying(track.id);
      return `<article class="queue-row${current ? " active" : ""}">
        <button class="queue-row-main${trackStateClass(track.id)}" data-queue-play="${escapeHtml(track.id)}" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}">
          <span class="queue-position">${index + 1}</span>${artwork(track, true)}
          <span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}<span data-track-play-status>${current ? ` · ${playing ? "Playing" : "Paused"}` : ""}</span></small></span>${trackActionIcon(track)}
        </button>
        <div class="queue-row-actions" aria-label="Queue actions for ${escapeHtml(track.title)}">
          <button class="icon-only-button" data-queue-next="${escapeHtml(track.id)}" aria-label="Play ${escapeHtml(track.title)} next" ${current ? "disabled" : ""}>${iconMarkup("play-next")}</button>
          <button class="icon-only-button" data-queue-move="${escapeHtml(track.id)}" data-direction="-1" aria-label="Move ${escapeHtml(track.title)} up" ${index === 0 ? "disabled" : ""}>${iconMarkup("arrow-up")}</button>
          <button class="icon-only-button" data-queue-move="${escapeHtml(track.id)}" data-direction="1" aria-label="Move ${escapeHtml(track.title)} down" ${index === naturalQueue.length - 1 ? "disabled" : ""}>${iconMarkup("arrow-down")}</button>
          <button class="icon-only-button" data-queue-remove="${escapeHtml(track.id)}" aria-label="Remove ${escapeHtml(track.title)} from queue" ${current ? "disabled" : ""}>${iconMarkup("close")}</button>
        </div>
      </article>`;
    }).join("") || `<div class="queue-empty"><strong>The queue is empty</strong><span>Add music to a playlist or play from the catalog.</span></div>`;
  };

  const renderSearch = (query = "") => {
    const normalized = query.trim().toLowerCase();
    const matches = tracks.filter((track) => searchableTrackText(track).includes(normalized));
    $("#search-label").textContent = normalized ? `${matches.length} RESULTS` : "OFFICIAL RELEASES";
    $("#search-results").innerHTML = matches.length
      ? matches.map((track) => `<button class="${trackStateClass(track.id).trim()}" data-play="${escapeHtml(track.id)}" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}">${artwork(track, true)}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.album)}${track.year ? ` · ${escapeHtml(track.year)}` : ""}</small></span>${trackActionIcon(track)}</button>`).join("")
      : `<p class="search-empty">${tracks.length ? "No tracks match that search." : "No official releases are live yet."}</p>`;
  };

  const renderCollectionDetail = () => {
    const collection = findCollection(activeCollectionKey);
    if (!collection) return false;
    $("#collection-detail-cover").innerHTML = `<img src="${escapeHtml(collection.cover)}" alt="${escapeHtml(collection.title)} cover" />`;
    $("#collection-detail-title").textContent = collection.title;
    $("#collection-detail-meta").textContent = `${collection.artist} · ${collection.releaseType} · ${collection.tracks.length} track${collection.tracks.length === 1 ? "" : "s"}${collection.year ? ` · ${collection.year}` : ""}`;
    $("#collection-detail-play").disabled = collection.tracks.length === 0;
    $("#collection-detail-shuffle").disabled = collection.tracks.length < 2;
    $("#collection-detail-list").innerHTML = collection.tracks.map((track, index) => `<button class="collection-track-row${trackStateClass(track.id)}" data-collection-track="${escapeHtml(track.id)}" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}"><span>${track.trackNumber || index + 1}</span><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}</small></span>${trackActionIcon(track)}</button>`).join("");
    return true;
  };

  const renderPlaylistDetail = () => {
    const playlist = playlists.find((entry) => entry.id === activePlaylistId);
    if (!playlist) return;
    const entries = playlistTracks(playlist);
    $("#playlist-detail-cover").innerHTML = playlistArtwork(playlist);
    $("#playlist-detail-title").textContent = playlist.name;
    $("#playlist-detail-count").textContent = `${entries.length} song${entries.length === 1 ? "" : "s"} · saved on this device`;
    $("#playlist-detail-play").disabled = entries.length === 0;
    $("#playlist-detail-play").dataset.playlistAction = playlist.id;
    $("#playlist-detail-shuffle").disabled = entries.length === 0;
    $("#playlist-detail-list").innerHTML = entries.length
      ? entries.map((track, index) => `<div class="playlist-detail-row${trackStateClass(track.id)}">
          <button class="${trackStateClass(track.id).trim()}" data-playlist-track="${escapeHtml(track.id)}" data-playlist-id="${escapeHtml(playlist.id)}" data-track-action="${escapeHtml(track.id)}" aria-label="${escapeHtml(trackActionLabel(track))}">
            <span class="queue-position">${index + 1}</span>${artwork(track, true)}
            <span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${formatTime(track.duration)}<span data-track-play-status>${isCurrentTrack(track.id) ? ` · ${isTrackPlaying(track.id) ? "Playing" : "Paused"}` : ""}</span></small></span>${trackActionIcon(track)}
          </button>
          <div class="playlist-row-actions"><button class="icon-only-button" data-playlist-move="${escapeHtml(track.id)}" data-playlist-id="${escapeHtml(playlist.id)}" data-direction="-1" aria-label="Move ${escapeHtml(track.title)} up" ${index === 0 ? "disabled" : ""}>${iconMarkup("arrow-up")}</button><button class="icon-only-button" data-playlist-move="${escapeHtml(track.id)}" data-playlist-id="${escapeHtml(playlist.id)}" data-direction="1" aria-label="Move ${escapeHtml(track.title)} down" ${index === entries.length - 1 ? "disabled" : ""}>${iconMarkup("arrow-down")}</button><button class="playlist-remove icon-only-button" data-playlist-remove="${escapeHtml(track.id)}" data-playlist-id="${escapeHtml(playlist.id)}" aria-label="Remove ${escapeHtml(track.title)} from ${escapeHtml(playlist.name)}">${iconMarkup("close")}</button></div>
        </div>`).join("")
      : `<div class="playlist-detail-empty"><span>${iconMarkup("music")}</span><strong>This playlist is empty</strong><p>Open a song and choose “Add to playlist.”</p></div>`;
    syncPlaybackIndicators();
  };

  const modalLayers = () => [$("#search-layer"), $("#queue-layer"), $("#info-layer"), $("#playlist-layer"), $("#playlist-picker-layer"), $("#playlist-editor-layer"), $("#settings-layer"), $("#collection-layer"), $("#sleep-layer")];

  const openModal = (layer, focusSelector = "button:not([disabled]), input, select, textarea, a[href]") => {
    if (!layer) return;
    if (!activeModal) modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    for (const candidate of modalLayers()) candidate.hidden = candidate !== layer;
    activeModal = layer;
    layer.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => layer.querySelector(focusSelector)?.focus());
  };

  const syncAppearanceControls = (settings = appearanceApi?.read?.()) => {
    if (!settings) return;
    const theme = $(`input[name="appearance-theme"][value="${settings.theme}"]`);
    const accent = $(`input[name="appearance-accent"][value="${settings.accent}"]`);
    if (theme) theme.checked = true;
    if (accent) accent.checked = true;
    $("#appearance-motion").value = settings.motion;
  };

  const saveAppearanceFromControls = () => {
    if (!appearanceApi) return;
    const previous = appearanceApi.read();
    const settings = appearanceApi.apply({
      theme: $('input[name="appearance-theme"]:checked')?.value || previous.theme,
      accent: $('input[name="appearance-accent"]:checked')?.value || previous.accent,
      motion: $("#appearance-motion").value || previous.motion,
    }, { persist: true, announce: true });
    syncAppearanceControls(settings);
    showToast(settings.theme === "anime" ? "Anime Pulse appearance saved." : "Classic Xotiic appearance saved.");
  };

  const refreshAppHealth = async () => {
    $("#health-version").textContent = APP_VERSION;
    $("#health-install").textContent = isStandalone() ? "Installed app" : "Browser tab";
    $("#health-network").textContent = navigator.onLine ? "Online" : "Offline";
    $("#health-downloads").textContent = `${offlineIds.size} song${offlineIds.size === 1 ? "" : "s"}`;
    let storageCopy = offlineApi?.supported?.() ? "Browser managed" : "Unavailable";
    if (offlineApi?.supported?.()) {
      try {
        const [{ usage, quota }, persisted] = await Promise.all([
          offlineApi.estimate(),
          navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(false),
        ]);
        storageCopy = `${persisted ? "Persistent" : "Browser managed"}${quota ? ` · ${formatBytes(usage)} used` : ""}`;
      } catch { /* Diagnostics remain informational. */ }
    }
    $("#health-storage").textContent = storageCopy;
  };

  const openSettings = () => {
    syncAppearanceControls();
    refreshAppHealth().catch(() => undefined);
    openModal($("#settings-layer"), 'input[name="appearance-theme"]:checked');
  };

  const openPlaylist = (id) => {
    if (!playlists.some((playlist) => playlist.id === id)) return;
    activePlaylistId = id;
    renderPlaylistDetail();
    openModal($("#playlist-layer"), "[data-modal-close]");
  };

  const openCollection = (key) => {
    activeCollectionKey = key;
    if (!renderCollectionDetail()) return;
    openModal($("#collection-layer"), "[data-modal-close]");
  };

  const playCollection = (shuffled = false) => {
    const collection = findCollection(activeCollectionKey);
    if (!collection?.tracks.length) return;
    const entries = [...collection.tracks];
    if (shuffled) {
      for (let index = entries.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [entries[index], entries[swapIndex]] = [entries[swapIndex], entries[index]];
      }
    }
    setPlaybackQueue(entries.map((track) => track.id), collection.title);
    setTrack(entries[0]);
    closeModals();
  };

  const renderPlaylistPicker = () => {
    if (!currentTrack) return;
    $("#playlist-picker-track").textContent = currentTrack.title;
    $("#playlist-picker-list").innerHTML = playlists.length
      ? playlists.map((playlist) => {
          const added = playlist.trackIds.includes(currentTrack.id);
          const count = playlistTracks(playlist).length;
          return `<button data-playlist-toggle="${escapeHtml(playlist.id)}" class="${added ? "added" : ""}">
            ${playlistArtwork(playlist)}<span><strong>${escapeHtml(playlist.name)}</strong><small>${count} song${count === 1 ? "" : "s"}</small></span><b class="icon-frame">${iconMarkup(added ? "check" : "plus")}</b>
          </button>`;
        }).join("")
      : `<div class="playlist-picker-empty"><span>${iconMarkup("plus")}</span><strong>No playlists yet</strong><p>Create one and this song will be added automatically.</p></div>`;
  };

  const openPlaylistPicker = () => {
    if (!currentTrack) return;
    renderPlaylistPicker();
    openModal($("#playlist-picker-layer"), "[data-modal-close]");
  };

  const openPlaylistEditor = ({ playlistId = null, trackId = null } = {}) => {
    const playlist = playlists.find((entry) => entry.id === playlistId);
    playlistEditorTargetId = playlist?.id || null;
    playlistEditorTrackId = byId(trackId)?.id || null;
    playlistEditorQueueIds = [];
    $("#playlist-editor-label").textContent = playlist ? "EDIT PLAYLIST" : "NEW PLAYLIST";
    $("#playlist-editor-title").textContent = playlist ? "Rename playlist" : "Create a playlist";
    $("#playlist-name").value = playlist?.name || "";
    $("#playlist-editor-submit").textContent = playlist ? "Save name" : "Create playlist";
    openModal($("#playlist-editor-layer"), "#playlist-name");
  };

  const openQueuePlaylistEditor = () => {
    const ids = currentQueue().map((track) => track.id);
    if (!ids.length) return;
    playlistEditorTargetId = null;
    playlistEditorTrackId = null;
    playlistEditorQueueIds = [...ids];
    $("#playlist-editor-label").textContent = "SAVE PLAYBACK QUEUE";
    $("#playlist-editor-title").textContent = "Create a playlist from this queue";
    $("#playlist-name").value = playbackContextLabel === "All tracks" ? "Xotiic Rotation" : playbackContextLabel.slice(0, 60);
    $("#playlist-editor-submit").textContent = "Save queue";
    openModal($("#playlist-editor-layer"), "#playlist-name");
  };

  const playPlaylist = (id, shuffled = false) => {
    const playlist = playlists.find((entry) => entry.id === id);
    const entries = playlistTracks(playlist);
    if (!playlist || !entries.length) return;
    const active = activeQueuePlaylistId === playlist.id && Boolean(currentTrack) && playlist.trackIds.includes(currentTrack.id);
    if (active && !shuffled && !audio.ended) {
      togglePlay();
      closeModals();
      return;
    }
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

  const movePlaylistItem = (playlistId, trackId, direction) => {
    const playlist = playlists.find((entry) => entry.id === playlistId);
    if (!playlist) return;
    const from = playlist.trackIds.indexOf(trackId);
    const to = Math.min(playlist.trackIds.length - 1, Math.max(0, from + Number(direction)));
    if (from < 0 || from === to) return;
    [playlist.trackIds[from], playlist.trackIds[to]] = [playlist.trackIds[to], playlist.trackIds[from]];
    playlist.updatedAt = Date.now();
    if (activeQueuePlaylistId === playlist.id) activeQueueIds = playlist.trackIds.filter((id) => byId(id));
    shuffleBag = [];
    shuffleHistory = [];
    savePlaylists();
    saveSession(true);
    renderPlaylistDetail();
    renderLibrary();
  };

  const moveQueueItem = (trackId, direction) => {
    const from = activeQueueIds.indexOf(trackId);
    const to = Math.min(activeQueueIds.length - 1, Math.max(0, from + Number(direction)));
    if (from < 0 || from === to) return;
    [activeQueueIds[from], activeQueueIds[to]] = [activeQueueIds[to], activeQueueIds[from]];
    shuffleBag = [];
    shuffleHistory = [];
    activeQueuePlaylistId = null;
    playbackContextLabel = "Custom queue";
    saveSession(true);
    renderQueue();
    renderSideQueue();
    $("#now-playing-context").textContent = playbackContextLabel;
  };

  const playNext = (trackId) => {
    if (!byId(trackId) || trackId === currentTrack?.id) return;
    const without = activeQueueIds.filter((id) => id !== trackId);
    const currentIndex = Math.max(0, without.indexOf(currentTrack?.id));
    without.splice(currentIndex + 1, 0, trackId);
    activeQueueIds = without;
    shuffleBag = [];
    shuffleHistory = [];
    activeQueuePlaylistId = null;
    playbackContextLabel = "Custom queue";
    saveSession(true);
    renderQueue();
    renderSideQueue();
    $("#now-playing-context").textContent = playbackContextLabel;
    showToast(`${byId(trackId).title} will play next.`);
  };

  const removeQueueItem = (trackId) => {
    if (trackId === currentTrack?.id) return;
    activeQueueIds = activeQueueIds.filter((id) => id !== trackId);
    shuffleBag = [];
    shuffleHistory = [];
    activeQueuePlaylistId = null;
    playbackContextLabel = "Custom queue";
    saveSession(true);
    renderQueue();
    renderSideQueue();
  };

  const clearUpcoming = () => {
    if (!currentTrack) return;
    activeQueueIds = [currentTrack.id];
    shuffleBag = [];
    shuffleHistory = [];
    activeQueuePlaylistId = null;
    playbackContextLabel = "Current song";
    saveSession(true);
    renderQueue();
    renderSideQueue();
    $("#now-playing-context").textContent = playbackContextLabel;
    showToast("Upcoming songs cleared.");
  };

  const exportLibrary = async () => {
    const payload = {
      app: "XotiicDuck Music",
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      favorites: [...favorites].filter((id) => byId(id)),
      playlists: playlists.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        trackIds: playlist.trackIds.filter((id) => byId(id)),
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
      })),
    };
    const file = new File([JSON.stringify(payload, null, 2)], `xotiicduck-library-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try { await navigator.share({ title: "XotiicDuck Music library backup", files: [file] }); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Library backup downloaded.");
  };

  const importLibrary = async (file) => {
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast("That backup is too large to be valid."); return; }
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.app !== "XotiicDuck Music" || payload.version !== BACKUP_VERSION || !Array.isArray(payload.favorites) || !Array.isArray(payload.playlists)) throw new Error("Invalid backup");
      const nextFavorites = new Set(payload.favorites.filter((id) => typeof id === "string" && byId(id)));
      const nextPlaylists = payload.playlists.slice(0, 100).filter((entry) => entry && typeof entry.name === "string").map((entry, index) => ({
        id: typeof entry.id === "string" && /^[a-z0-9-]{1,100}$/i.test(entry.id) ? entry.id : `restored-${Date.now().toString(36)}-${index}`,
        name: entry.name.trim().slice(0, 60) || "Untitled playlist",
        trackIds: [...new Set(Array.isArray(entry.trackIds) ? entry.trackIds.filter((id) => typeof id === "string" && byId(id)) : [])],
        createdAt: Number(entry.createdAt) || Date.now(),
        updatedAt: Number(entry.updatedAt) || Date.now(),
      }));
      if (!window.confirm(`Restore ${nextPlaylists.length} playlist${nextPlaylists.length === 1 ? "" : "s"} and ${nextFavorites.size} liked song${nextFavorites.size === 1 ? "" : "s"}? This replaces the current local library.`)) return;
      favorites = nextFavorites;
      playlists = nextPlaylists;
      saveFavorites();
      savePlaylists();
      renderAll();
      showToast("Library restored on this device.");
    } catch {
      showToast("That file is not a valid XotiicDuck Music backup.");
    } finally {
      $("#library-import-file").value = "";
    }
  };

  const renderAll = () => {
    renderHome();
    renderDiscover();
    renderLibrary();
    renderCurrent();
    syncPlaybackIndicators();
  };

  const scheduleCatalogRefresh = () => {
    clearTimeout(scheduleTimer);
    const now = Date.now();
    const nextReleaseAt = rawCatalog
      .filter((entry) => entry?.status === "scheduled")
      .map((entry) => validIsoTime(entry.releaseAt))
      .filter((timestamp) => timestamp > now)
      .sort((left, right) => left - right)[0];
    if (!nextReleaseAt) return;
    scheduleTimer = setTimeout(refreshScheduledCatalog, Math.min(2147483647, Math.max(1000, nextReleaseAt - now + 1000)));
  };

  const refreshScheduledCatalog = () => {
    const previousSignature = tracks.map((track) => track.id).join("|");
    const currentId = currentTrack?.id || null;
    tracks = buildPublicTracks();
    const nextSignature = tracks.map((track) => track.id).join("|");
    if (currentId) currentTrack = byId(currentId) || tracks[0] || null;
    else currentTrack = tracks[0] || null;
    if (playbackContextLabel === "All tracks") activeQueueIds = tracks.map((track) => track.id);
    else activeQueueIds = activeQueueIds.filter((id) => byId(id));
    if (previousSignature !== nextSignature) {
      if (currentTrack && !audio.src) {
        audio.src = currentTrack.audio;
        audio.load();
      }
      renderAll();
      showToast("A scheduled XotiicDuck release is now live.");
    }
    scheduleCatalogRefresh();
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
    $$('[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (view === "discover") renderDiscover();
    if (view === "library") renderLibrary();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
    listenProgress.lastPosition = position;
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
    setIcon($("#repeat"), repeatMode === "one" ? "repeat-one" : "repeat");
    setIcon($("#now-playing-repeat-icon"), repeatMode === "one" ? "repeat-one" : "repeat");
    $("#now-playing-shuffle-state").textContent = shuffleEnabled ? "On" : "Off";
    $("#now-playing-repeat-state").textContent = repeatMode === "one" ? "One" : repeatMode === "all" ? "All" : "Off";
  };

  const syncPlaybackIndicators = () => {
    for (const button of $$('[data-track-action]')) {
      const track = byId(button.dataset.trackAction);
      if (!track) continue;
      const current = isCurrentTrack(track.id);
      const playing = isTrackPlaying(track.id);
      button.classList.toggle("is-current-track", current);
      button.classList.toggle("is-playing", playing);
      button.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${track.title}`);
      button.title = `${playing ? "Pause" : "Play"} ${track.title}`;
      setIcon(button.querySelector("[data-track-play-icon]"), playing ? "pause" : "play");
      for (const label of button.querySelectorAll("[data-track-play-label]")) {
        label.textContent = `${playing ? "Pause" : "Play"}${label.dataset.trackPlayLabelSuffix || ""}`;
      }
      for (const status of button.querySelectorAll("[data-track-play-status]")) {
        status.textContent = current ? ` · ${playing ? "Playing" : "Paused"}` : "";
      }
      for (const container of [button.closest(".release-card"), button.closest(".offline-track-row"), button.closest(".playlist-detail-row")]) {
        container?.classList.toggle("is-current-track", current);
        container?.classList.toggle("is-playing", playing);
      }
      const queueRow = button.closest(".queue-row");
      queueRow?.classList.toggle("active", current);
      queueRow?.classList.toggle("is-playing", playing);
    }

    for (const button of $$('[data-playlist-action]')) {
      const playlist = playlists.find((entry) => entry.id === button.dataset.playlistAction);
      const active = Boolean(playlist && currentTrack && activeQueuePlaylistId === playlist.id && playlist.trackIds.includes(currentTrack.id));
      const playing = active && isTrackPlaying(currentTrack.id);
      const verb = playing ? "Pause" : active && !audio.ended ? "Resume" : "Play";
      button.classList.toggle("is-current-playlist", active);
      button.classList.toggle("is-playing", playing);
      if (playlist) {
        button.setAttribute("aria-label", `${verb} ${playlist.name}`);
        button.title = `${verb} ${playlist.name}`;
      }
      setIcon(button.querySelector("[data-playlist-play-icon]"), playing ? "pause" : "play");
      for (const label of button.querySelectorAll("[data-playlist-play-label]")) label.textContent = verb;
      const card = button.closest(".playlist-card");
      card?.classList.toggle("is-current-playlist", active);
      card?.classList.toggle("is-playing", playing);
    }
  };

  const updatePlayButtons = () => {
    const playing = !audio.paused && !audio.ended;
    for (const button of [$("#play"), $("#now-playing-play")]) {
      setIcon(button, playing ? "pause" : "play");
      button.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    syncPlaybackIndicators();
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
      pendingRestorePosition = 0;
      setPlaybackStatus("loading", "Loading song…");
      audio.src = track.audio;
      audio.load();
      resetListenProgress();
    }
    renderAll();
    updateMediaSession();
    saveSession(true);
    try {
      const url = new URL(location.href);
      url.searchParams.set("track", track.id);
      if (currentView !== "home") url.searchParams.set("view", currentView);
      else url.searchParams.delete("view");
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch { /* Deep-link updates are optional in restricted browser modes. */ }
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

  const resetMiniPlayerGesture = (settle = false) => {
    const opener = $("#player-open");
    miniPlayerGesture = null;
    opener.style.setProperty("--mini-swipe-x", "0px");
    opener.classList.remove("is-swiping", "swipe-next", "swipe-previous");
    opener.classList.toggle("is-settling", settle);
    if (settle) setTimeout(() => opener.classList.remove("is-settling"), 230);
  };

  const startMiniPlayerGesture = (event) => {
    if (!currentTrack || !window.matchMedia("(max-width: 1040px)").matches || event.pointerType === "mouse" || !event.isPrimary) return;
    miniPlayerGesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, horizontal: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveMiniPlayerGesture = (event) => {
    if (!miniPlayerGesture || miniPlayerGesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - miniPlayerGesture.startX;
    const dy = event.clientY - miniPlayerGesture.startY;
    if (!miniPlayerGesture.horizontal && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      resetMiniPlayerGesture();
      return;
    }
    if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
    miniPlayerGesture.horizontal = true;
    miniPlayerGesture.dx = dx;
    const opener = $("#player-open");
    const resisted = Math.max(-110, Math.min(110, dx * 0.64));
    opener.style.setProperty("--mini-swipe-x", `${resisted}px`);
    opener.classList.add("is-swiping");
    opener.classList.toggle("swipe-next", dx < 0);
    opener.classList.toggle("swipe-previous", dx > 0);
  };

  const finishMiniPlayerGesture = (event) => {
    if (!miniPlayerGesture || miniPlayerGesture.pointerId !== event.pointerId) return;
    const { dx, horizontal } = miniPlayerGesture;
    const threshold = Math.min(92, Math.max(54, $("#player-open").clientWidth * 0.16));
    const completed = horizontal && Math.abs(dx) >= threshold;
    resetMiniPlayerGesture(true);
    if (!completed) return;
    suppressPlayerOpenUntil = Date.now() + 450;
    skip(dx < 0 ? 1 : -1);
    showToast(dx < 0 ? `Next: ${currentTrack?.title || "track"}` : `Previous: ${currentTrack?.title || "track"}`);
  };

  const toggleFavorite = (id) => {
    if (!byId(id)) return;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    saveFavorites();
    renderAll();
  };

  const shareCurrentTrack = async () => {
    if (!currentTrack) return;
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("track", currentTrack.id);
    const shareData = { title: `${currentTrack.title} by XotiicDuck`, text: `Listen to ${currentTrack.title} by ${currentTrack.artist}.`, url: url.href };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url.href);
      showToast("Song link copied.");
    } catch {
      const input = document.createElement("textarea");
      input.value = url.href;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      showToast("Song link copied.");
    }
  };

  const setPlaybackStatus = (state = "", message = "") => {
    for (const status of [$("#player-status"), $("#playback-status")]) {
      status.hidden = !state;
      status.classList.toggle("error", state === "error");
      status.classList.toggle("busy", state === "loading");
    }
    $("#player-status-copy").textContent = message;
    $("#playback-status-copy").textContent = message;
    $("#retry-track").hidden = state !== "error";
  };

  const retryCurrentTrack = async () => {
    if (!currentTrack) return;
    setPlaybackStatus("loading", "Trying again…");
    audio.load();
    try { await audio.play(); } catch { setPlaybackStatus("error", "This song still could not load. Check your connection."); }
  };

  const closeModals = () => {
    for (const layer of modalLayers()) layer.hidden = true;
    activeModal = null;
    document.body.classList.remove("modal-open");
    const returnTarget = modalReturnFocus;
    modalReturnFocus = null;
    if (returnTarget?.isConnected && !returnTarget.closest("[hidden]")) requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
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
        copy: `<div class="install-result success"><span aria-hidden="true">${iconMarkup("check")}</span><div><h3>${status === "accepted" ? "Check your Home screen or app list" : "Open it like any other app"}</h3><p>${status === "accepted" ? "Your browser accepted the install. Leave the browser and look for XotiicDuck Music on your Home screen or in your apps. Some devices take a few seconds to place the icon." : "You are currently using the installed player, or this browser completed the installation during this visit."}</p></div></div><section><h3>If you cannot find the icon</h3><p>Use your device search for “XotiicDuck.” If it is still missing, return to the website in your browser and follow the install guide again.</p></section>`,
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
      if (icon) setIcon(icon, installed ? "check" : "download");
      button.classList.toggle("is-installed", installed);
      button.setAttribute("aria-label", installed ? "XotiicDuck Music is installed" : "Install XotiicDuck Music");
      button.title = installed ? "Already installed. Tap for details" : "Install XotiicDuck Music";
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
      copy: `<section><h3>Saved on this device</h3><p>Favorites, playlists, the active song position, and offline choices stay in this browser. They are not connected to a listener account.</p></section><section><h3>No listening tracker</h3><p>This release does not display multi-song listening progress or send song plays to a chart service, advertising network, or analytics backend.</p></section><section><h3>Separate artist access</h3><p>The owner publishing console stores its GitHub connection in an encrypted device vault. Public listeners cannot publish releases without the verified repository owner’s GitHub access.</p></section><section><h3>External links</h3><p>YouTube links open an external service governed by its own privacy terms. This player does not embed a YouTube video.</p></section>`,
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
    openModal($("#info-layer"), "[data-modal-close]");
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

  const activateTrack = (track, prepareQueue = null) => {
    if (!track) return;
    if (isCurrentTrack(track.id)) {
      togglePlay();
      return;
    }
    prepareQueue?.();
    setTrack(track);
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
    openModal($("#queue-layer"), "[data-modal-close]");
  };

  const openSearch = () => {
    renderSearch($("#search-input").value);
    openModal($("#search-layer"), "#search-input");
  };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.dataset.view) { event.preventDefault(); switchView(target.dataset.view); }
    if (target.dataset.play) {
      event.preventDefault();
      activateTrack(byId(target.dataset.play), () => {
        const favoriteIds = tracks.filter((track) => favorites.has(track.id)).map((track) => track.id);
        const offlineTrackIds = tracks.filter((track) => offlineIds.has(track.id)).map((track) => track.id);
        if (target.dataset.playContext === "favorites" && favoriteIds.length) setPlaybackQueue(favoriteIds, "Liked songs");
        else if (target.dataset.playContext === "offline" && offlineTrackIds.length) setPlaybackQueue(offlineTrackIds, "Offline songs");
        else setPlaybackQueue(tracks.map((track) => track.id), "All tracks");
      });
      closeModals();
    }
    if (target.dataset.queuePlay) { event.preventDefault(); activateTrack(byId(target.dataset.queuePlay)); closeModals(); }
    if (target.dataset.playlistOpen) { event.preventDefault(); openPlaylist(target.dataset.playlistOpen); }
    if (target.dataset.playlistPlay) { event.preventDefault(); playPlaylist(target.dataset.playlistPlay); }
    if (target.dataset.collectionOpen) { event.preventDefault(); openCollection(target.dataset.collectionOpen); }
    if (target.dataset.collectionTrack) {
      event.preventDefault();
      const collection = findCollection(activeCollectionKey);
      if (collection) activateTrack(byId(target.dataset.collectionTrack), () => setPlaybackQueue(collection.tracks.map((track) => track.id), collection.title));
      closeModals();
    }
    if (target.dataset.playlistTrack) {
      event.preventDefault();
      const playlist = playlists.find((entry) => entry.id === target.dataset.playlistId);
      if (playlist) {
        activateTrack(byId(target.dataset.playlistTrack), () => setPlaybackQueue(playlist.trackIds, playlist.name, playlist.id));
        closeModals();
      }
    }
    if (target.dataset.playlistRemove) { event.preventDefault(); toggleTrackInPlaylist(target.dataset.playlistId, target.dataset.playlistRemove); }
    if (target.dataset.playlistMove) { event.preventDefault(); movePlaylistItem(target.dataset.playlistId, target.dataset.playlistMove, target.dataset.direction); }
    if (target.dataset.playlistToggle) { event.preventDefault(); toggleTrackInPlaylist(target.dataset.playlistToggle, currentTrack?.id); }
    if (target.dataset.queueNext) { event.preventDefault(); playNext(target.dataset.queueNext); }
    if (target.dataset.queueMove) { event.preventDefault(); moveQueueItem(target.dataset.queueMove, target.dataset.direction); }
    if (target.dataset.queueRemove) { event.preventDefault(); removeQueueItem(target.dataset.queueRemove); }
    if (target.dataset.offlineToggle) { event.preventDefault(); toggleOffline(byId(target.dataset.offlineToggle)); }
    if (target.dataset.libraryTab) { event.preventDefault(); setLibraryTab(target.dataset.libraryTab); }
    if (target.hasAttribute("data-playlist-create")) { event.preventDefault(); openPlaylistEditor(); }
    if (target.hasAttribute("data-playlist-create-current")) { event.preventDefault(); openPlaylistEditor({ trackId: currentTrack?.id }); }
    if (target.dataset.favorite) { event.preventDefault(); toggleFavorite(target.dataset.favorite); }
    if (target.hasAttribute("data-install")) { event.preventDefault(); requestInstall(); }
    if (target.hasAttribute("data-search-open")) { event.preventDefault(); openSearch(); }
    if (target.hasAttribute("data-settings-open")) { event.preventDefault(); openSettings(); }
    if (target.hasAttribute("data-settings-close")) { event.preventDefault(); closeModals(); }
    if (target.hasAttribute("data-modal-close")) { event.preventDefault(); closeModals(); }
    if (target.dataset.info) { event.preventDefault(); openInfo(target.dataset.info); }
    if (target.dataset.genre) { selectedGenre = target.dataset.genre; renderDiscover(); }
    if (target.dataset.sleepMinutes) { event.preventDefault(); startSleepTimer(target.dataset.sleepMinutes); }
    if (target.hasAttribute("data-sleep-after-track")) { event.preventDefault(); stopAfterThisTrack(); }
    if (target.hasAttribute("data-sleep-cancel")) { event.preventDefault(); clearSleepTimer(); closeModals(); }
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
  $("#player-open").addEventListener("click", () => {
    if (Date.now() < suppressPlayerOpenUntil) return;
    openNowPlaying();
  });
  $("#player-open").addEventListener("pointerdown", startMiniPlayerGesture);
  $("#player-open").addEventListener("pointermove", moveMiniPlayerGesture);
  $("#player-open").addEventListener("pointerup", finishMiniPlayerGesture);
  $("#player-open").addEventListener("pointercancel", () => resetMiniPlayerGesture());
  $("#now-playing-close").addEventListener("click", closeNowPlaying);
  $("#now-playing-add-playlist").addEventListener("click", openPlaylistPicker);
  $("#now-playing-offline").addEventListener("click", () => currentTrack && toggleOffline(currentTrack));
  $("#now-playing-share").addEventListener("click", shareCurrentTrack);
  $("#now-playing-sleep").addEventListener("click", () => { syncSleepUi(); openModal($("#sleep-layer"), "[data-sleep-minutes]"); });
  $("#now-playing-lyrics-toggle").addEventListener("click", toggleLyrics);
  $("#retry-track").addEventListener("click", retryCurrentTrack);
  $("#queue-clear").addEventListener("click", clearUpcoming);
  $("#queue-save").addEventListener("click", openQueuePlaylistEditor);
  $("#collection-detail-play").addEventListener("click", () => playCollection(false));
  $("#collection-detail-shuffle").addEventListener("click", () => playCollection(true));
  $("#library-export").addEventListener("click", exportLibrary);
  $("#library-import").addEventListener("click", () => $("#library-import-file").click());
  $("#library-import-file").addEventListener("change", (event) => importLibrary(event.target.files?.[0]));
  $("#clear-listening-data").addEventListener("click", () => {
    if (!window.confirm("Clear recently played songs and your monthly listening counts on this device?")) return;
    listening = { recent: [], months: {} };
    saveListening();
    renderListeningSections();
    showToast("Listening history cleared on this device.");
  });
  $("#volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value); saveSession(); });
  for (const input of [$("#progress"), $("#now-playing-progress")]) input.addEventListener("input", (event) => seekTo(event.target.value));
  $("#search-input").addEventListener("input", (event) => renderSearch(event.target.value));
  $("#discover-search").addEventListener("input", (event) => { discoverQuery = event.target.value; renderDiscover(); });
  $("#discover-type").addEventListener("change", (event) => { selectedReleaseType = event.target.value; renderDiscover(); });
  $("#discover-sort").addEventListener("change", (event) => { discoverSort = event.target.value; renderDiscover(); });
  $("#health-refresh").addEventListener("click", () => refreshAppHealth().then(() => showToast("Player diagnostics refreshed.")));
  for (const input of $$('input[name="appearance-theme"], input[name="appearance-accent"]')) input.addEventListener("change", saveAppearanceFromControls);
  $("#appearance-motion").addEventListener("change", saveAppearanceFromControls);
  $("#appearance-reset").addEventListener("click", () => {
    if (!appearanceApi) return;
    const settings = appearanceApi.apply(appearanceApi.defaults, { persist: true, announce: true });
    syncAppearanceControls(settings);
    showToast("Classic Xotiic defaults restored.");
  });
  $("#library-switcher").addEventListener("keydown", (event) => {
    const tabs = $$('[data-library-tab]');
    const index = tabs.indexOf(event.target.closest?.('[data-library-tab]'));
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setLibraryTab(tabs[nextIndex].dataset.libraryTab, { focus: true });
  });

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
      const initialTrackIds = playlistEditorQueueIds.length ? [...new Set(playlistEditorQueueIds.filter((trackId) => byId(trackId)))] : playlistEditorTrackId ? [playlistEditorTrackId] : [];
      playlists.unshift({ id, name, trackIds: initialTrackIds, createdAt: Date.now(), updatedAt: Date.now() });
      activePlaylistId = id;
      showToast(playlistEditorQueueIds.length ? `Saved ${initialTrackIds.length} songs to ${name}.` : playlistEditorTrackId ? `Created ${name} and added the song.` : `Created ${name}.`);
    }
    playlistEditorQueueIds = [];
    savePlaylists();
    renderLibrary();
    renderPlaylistPicker();
    if (activePlaylistId) renderPlaylistDetail();
    closeModals();
  });

  audio.addEventListener("play", () => { setPlaybackStatus(); updatePlayButtons(); markRecentlyPlayed(currentTrack); saveSession(true); if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "playing"; } catch { /* Partial support. */ } } });
  audio.addEventListener("playing", () => setPlaybackStatus());
  audio.addEventListener("pause", () => { updatePlayButtons(); saveSession(true); if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "paused"; } catch { /* Partial support. */ } } });
  audio.addEventListener("timeupdate", () => { updateProgressUI(); updateListeningProgress(); checkSleepTimer(); saveSession(); });
  audio.addEventListener("loadstart", () => setPlaybackStatus("loading", navigator.onLine ? "Loading song…" : "Opening saved song…"));
  audio.addEventListener("waiting", () => setPlaybackStatus("loading", "Buffering…"));
  audio.addEventListener("stalled", () => setPlaybackStatus("loading", navigator.onLine ? "Connection slowed. Still trying…" : "Trying to open the saved song…"));
  audio.addEventListener("canplay", () => setPlaybackStatus());
  audio.addEventListener("error", () => setPlaybackStatus("error", navigator.onLine ? "This song could not load. Check the connection and retry." : offlineIds.has(currentTrack?.id) ? "The saved song could not be opened. Retry once." : "This song is not saved offline. Reconnect to play it."));
  audio.addEventListener("loadedmetadata", () => {
    if (pendingRestorePosition > 0) {
      const duration = playbackDuration();
      audio.currentTime = Math.min(Math.max(0, pendingRestorePosition), Math.max(0, duration - 1));
      pendingRestorePosition = 0;
    }
    updateProgressUI();
  });
  audio.addEventListener("durationchange", () => updateProgressUI());
  audio.addEventListener("ended", () => {
    resetListenProgress();
    if (stopAfterCurrent) {
      clearSleepTimer({ announce: false });
      seekTo(0);
      updatePlayButtons();
      showToast("Playback stopped after the song.");
      return;
    }
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
    showToast("Installed. Open XotiicDuck Music from your Home screen or apps.");
  });
  window.addEventListener("pageshow", updateInstallButtons);
  window.addEventListener("pagehide", () => saveSession(true));
  window.addEventListener("beforeunload", () => saveSession(true));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshScheduledCatalog(); checkSleepTimer(); } });

  const trapFocus = (event, layer) => {
    if (event.key !== "Tab" || !layer) return;
    const focusable = [...layer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length && !element.closest("[hidden]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  window.addEventListener("keydown", (event) => {
    const activeElement = document.activeElement;
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement?.tagName) || activeElement?.isContentEditable;
    const focusLayer = activeModal || (!$("#now-playing-layer").hidden ? $("#now-playing-layer") : null);
    trapFocus(event, focusLayer);
    if (event.key === "/" && !typing) { event.preventDefault(); openSearch(); }
    if (event.key === "Escape") {
      if (activeModal) closeModals();
      else if (!$("#now-playing-layer").hidden) closeNowPlaying();
    }
    if (event.code === "Space" && !typing && !event.target.closest("button, a")) { event.preventDefault(); togglePlay(); }
    if (!typing && event.key === "ArrowLeft") { event.preventDefault(); event.shiftKey ? previousOrRestart() : seekTo((audio.currentTime || 0) - 10); }
    if (!typing && event.key === "ArrowRight") { event.preventDefault(); event.shiftKey ? skip(1) : seekTo((audio.currentTime || 0) + 10); }
    if (!typing && event.key.toLowerCase() === "s") { event.preventDefault(); toggleShuffle(); }
    if (!typing && event.key.toLowerCase() === "r") { event.preventDefault(); cycleRepeat(); }
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
      ["stop", () => { audio.pause(); seekTo(0); }],
    ];
    for (const [action, handler] of mediaActions) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Partial support. */ }
    }
  }

  const showUpdateReady = (registration) => {
    serviceWorkerRegistration = registration;
    if (registration.waiting && navigator.serviceWorker.controller) $("#update-banner").hidden = false;
  };

  $("#apply-update").addEventListener("click", () => {
    const waiting = serviceWorkerRegistration?.waiting;
    if (!waiting) { location.reload(); return; }
    $("#apply-update").disabled = true;
    $("#apply-update").textContent = "Refreshing…";
    waiting.postMessage({ type: "SKIP_WAITING" });
  });
  $("#dismiss-update").addEventListener("click", () => { $("#update-banner").hidden = true; });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then((registration) => {
        serviceWorkerRegistration = registration;
        showUpdateReady(registration);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") showUpdateReady(registration);
          });
        });
        return registration.update();
      })
      .catch(() => undefined);
  }

  const updateNetworkState = () => { $("#network-banner").hidden = navigator.onLine; };
  window.addEventListener("online", () => { updateNetworkState(); showToast("Back online."); });
  window.addEventListener("offline", updateNetworkState);

  $("#year").textContent = String(new Date().getFullYear());
  const restoredVolume = Number(restoredSession.volume);
  const initialVolume = Number.isFinite(restoredVolume) ? Math.min(1, Math.max(0, restoredVolume)) : Number($("#volume").value);
  $("#volume").value = String(initialVolume);
  audio.volume = initialVolume;
  if (currentTrack) {
    audio.src = currentTrack.audio;
    audio.load();
    updateMediaSession();
  }
  renderAll();
  syncAppearanceControls();
  switchView(currentView);
  updateInstallButtons();
  updateNetworkState();
  refreshOfflineState();
  syncSleepUi();
  scheduleSleepTimer();
  scheduleCatalogRefresh();
  if (params.get("search") === "1") openSearch();
})();

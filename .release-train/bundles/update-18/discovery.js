(() => {
  "use strict";

  const player = globalThis.XotiicPlayer;
  const root = document.querySelector("#for-you-content");
  if (!player || !root) return;

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const uniqueIds = (values) => [...new Set(values.filter(Boolean))];
  const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  let mixes = [];

  const searchable = (track) => [
    track.title, track.album, track.collection, track.genre, track.franchise,
    track.character, track.mood, track.energy, track.vocalStyle, track.performance,
    ...(track.tags || []),
  ].join(" ").toLowerCase();

  const similarity = (seed, candidate) => {
    if (!seed || seed.id === candidate.id) return -1;
    let score = 0;
    if (seed.similarReleaseIds?.includes(candidate.id)) score += 12;
    if (candidate.similarReleaseIds?.includes(seed.id)) score += 8;
    for (const field of ["franchise", "character", "mood", "genre", "energy", "vocalStyle", "performance", "collection"]) {
      if (seed[field] && candidate[field] && seed[field].toLowerCase() === candidate[field].toLowerCase()) score += field === "franchise" || field === "character" ? 5 : 2;
    }
    const seedTags = new Set((seed.tags || []).map((tag) => tag.toLowerCase()));
    score += (candidate.tags || []).filter((tag) => seedTags.has(tag.toLowerCase())).length * 2;
    return score;
  };

  const createMixes = () => {
    const tracks = player.getTracks();
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const favorites = new Set(player.getFavoriteIds());
    const offline = new Set(player.getOfflineIds());
    const listening = player.getListening() || { recent: [], months: {} };
    const recentIds = uniqueIds((listening.recent || []).map((entry) => entry.id).filter((id) => byId.has(id)));
    const month = listening.months?.[monthKey()] || {};
    const leaders = Object.entries(month)
      .map(([id, stats]) => ({ id, plays: Math.max(0, Number(stats?.plays) || 0), last: Number(stats?.lastPlayedAt) || 0 }))
      .filter((entry) => byId.has(entry.id) && entry.plays > 0)
      .sort((left, right) => right.plays - left.plays || right.last - left.last);
    const latest = [...tracks].sort((left, right) => right.catalogTimestamp - left.catalogTimestamp || right.catalogOrder - left.catalogOrder);
    const current = player.getCurrentTrack();
    const seed = current || byId.get(recentIds[0]) || tracks.find((track) => favorites.has(track.id)) || tracks[0];
    const related = seed ? [...tracks]
      .map((track) => ({ track, score: similarity(seed, track) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || right.track.catalogTimestamp - left.track.catalogTimestamp)
      .map((entry) => entry.track.id) : [];
    const battle = tracks.filter((track) => /battle|anthem|war|crown|wrath|dragon|storm|blade|throne|inferno|catastrophe/.test(searchable(track))).map((track) => track.id);
    const lateNight = tracks.filter((track) => /night|shadow|dark|void|moon|silent|twilight|eclipse|dream|sleep/.test(searchable(track))).map((track) => track.id);
    const characterThemes = tracks.filter((track) => track.character || track.franchise).sort((left, right) => String(left.franchise || left.character).localeCompare(String(right.franchise || right.character))).map((track) => track.id);
    const notRecent = latest.filter((track) => !recentIds.includes(track.id)).reverse().map((track) => track.id);
    const downloadedFavorites = tracks.filter((track) => favorites.has(track.id) && offline.has(track.id)).map((track) => track.id);
    const forgottenFavorites = tracks.filter((track) => favorites.has(track.id) && !recentIds.includes(track.id)).map((track) => track.id);
    const favouriteIds = tracks.filter((track) => favorites.has(track.id)).map((track) => track.id);

    const candidates = [
      { title: "On Repeat", eyebrow: "YOUR TOP TRACKS THIS MONTH", description: "Qualified plays counted only on this device.", ids: leaders.map((entry) => entry.id) },
      { title: seed ? `More like ${seed.title}` : "More like your favourites", eyebrow: "BASED ON RELEASE METADATA", description: "Matched by franchise, character, mood, genre, and tags.", ids: related },
      { title: "Recently Added", eyebrow: "FRESH FROM THE CATALOG", description: "The newest XotiicDuck releases in one queue.", ids: latest.map((track) => track.id) },
      { title: "Downloaded Favourites", eyebrow: "READY ANYWHERE", description: "Liked songs already saved for offline listening.", ids: downloadedFavorites },
      { title: "Forgotten Favourites", eyebrow: "TIME FOR A RETURN", description: "Liked songs outside your recent rotation.", ids: forgottenFavorites },
      { title: "Late Night Mix", eyebrow: "DARKER WORLDS", description: "Shadow, moon, void, and twilight releases.", ids: lateNight },
      { title: "Battle Anthems", eyebrow: "HIGH IMPACT ROTATION", description: "Crown clashes, storms, blades, and final battles.", ids: battle },
      { title: "Character Themes", eyebrow: "ANIME WORLDS", description: "Songs grouped by character and franchise metadata.", ids: characterThemes },
      { title: "Not Played Recently", eyebrow: "REDISCOVER THE ARCHIVE", description: "Tracks currently outside your recent history.", ids: notRecent },
      { title: "Liked Rotation", eyebrow: "SAVED BY YOU", description: "A clean queue of every favourite on this device.", ids: favouriteIds },
    ];

    return candidates
      .map((mix) => ({ ...mix, ids: uniqueIds(mix.ids).filter((id) => byId.has(id)).slice(0, 12) }))
      .filter((mix) => mix.ids.length >= 2)
      .slice(0, 7);
  };

  const artworkStack = (ids, byId) => {
    const tracks = ids.slice(0, 4).map((id) => byId.get(id)).filter(Boolean);
    return `<span class="mix-art-stack">${tracks.map((track) => `<img src="${escapeHtml(track.cover)}" alt="" loading="lazy" />`).join("")}</span>`;
  };

  const render = () => {
    const tracks = player.getTracks();
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const listening = player.getListening() || { recent: [], months: {} };
    const month = listening.months?.[monthKey()] || {};
    const leaders = Object.entries(month)
      .map(([id, stats]) => ({ track: byId.get(id), plays: Math.max(0, Number(stats?.plays) || 0) }))
      .filter((entry) => entry.track && entry.plays > 0)
      .sort((left, right) => right.plays - left.plays);
    const totalPlays = leaders.reduce((sum, entry) => sum + entry.plays, 0);
    const top = leaders[0];
    mixes = createMixes();
    $("#library-for-you-count").textContent = String(mixes.length);

    const recap = `<section class="local-recap">
      <div><p class="section-kicker">XOTIIC RECAP · ON THIS DEVICE</p><h2>${top ? `${escapeHtml(top.track.title)} leads your month` : "Your private rotation starts here"}</h2><p>${top ? `${totalPlays} qualified play${totalPlays === 1 ? "" : "s"} this month. Nothing is sent to an account or global chart.` : "Play songs normally and personal collections will adapt without showing unfinished-song progress bars."}</p></div>
      <dl><div><dt>Top track</dt><dd>${top ? escapeHtml(top.track.title) : "Not enough history"}</dd></div><div><dt>Favourites</dt><dd>${player.getFavoriteIds().length}</dd></div><div><dt>Offline</dt><dd>${player.getOfflineIds().length}</dd></div></dl>
      <button id="discovery-clear-history" type="button" ${totalPlays || listening.recent?.length ? "" : "disabled"}>Clear listening history</button>
    </section>`;
    const cards = mixes.length
      ? `<section class="personal-mixes"><div class="library-section-heading"><p class="section-kicker">MADE FROM YOUR LIBRARY</p><h2>Personal collections</h2></div><div class="personal-mix-grid">${mixes.map((mix, index) => `<article class="personal-mix-card"><button type="button" data-personal-mix="${index}" aria-label="Play ${escapeHtml(mix.title)}">${artworkStack(mix.ids, byId)}<span class="personal-mix-copy"><small>${escapeHtml(mix.eyebrow)}</small><strong>${escapeHtml(mix.title)}</strong><span>${escapeHtml(mix.description)}</span><b>${mix.ids.length} songs</b></span><span class="personal-mix-play" aria-hidden="true">▶</span></button></article>`).join("")}</div></section>`
      : `<div class="personal-mix-empty"><strong>More personal collections will appear here.</strong><p>Like songs, save a few offline, and listen normally. Your data stays in this browser.</p></div>`;
    root.innerHTML = recap + cards;
  };

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-personal-mix]");
    if (button) {
      const mix = mixes[Number(button.dataset.personalMix)];
      if (mix && player.playQueue(mix.ids, mix.title)) player.showToast(`${mix.title} started.`);
      return;
    }
    if (event.target.closest("#discovery-clear-history")) {
      if (!window.confirm("Clear qualified play counts and recent listening on this device?")) return;
      player.clearListening();
      player.showToast("Listening history cleared on this device.");
    }
  });

  document.addEventListener("xotiic:statechange", render);
  document.addEventListener("xotiic:listeningchange", render);
  render();
})();

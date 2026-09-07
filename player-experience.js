(() => {
  "use strict";
  const player = globalThis.XotiicPlayer;
  const model = globalThis.XotiicReleaseModel;
  if (!player || !model) return;
  const $ = (selector) => document.querySelector(selector);
  const esc = (text) => String(text || "").replace(/[&<>"']/g, (s) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[s]));
  const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { player.showToast("This preference could not be saved on this device."); } };
  const panel = document.createElement("section");
  panel.className = "view-panel release-page"; panel.dataset.panel = "release"; panel.hidden = true;
  $(".site-footer").before(panel);
  let restoring = false;
  let lastView = new URL(location.href).searchParams.get("view") || "home";
  let closeTimer;
  const showRelease = (id) => {
    const track = player.getTracks().find((item) => item.id === id);
    panel.replaceChildren();
    if (!track) {
      panel.innerHTML = '<h1>Release unavailable</h1><p>This song is not public, or its link has changed.</p><button class="u22-action" data-view="home">Back to music</button>';
    } else {
      const related = player.getTracks().filter((item) => item.id !== id && (track.relatedReleaseIds.includes(item.id) || item.relatedReleaseIds.includes(id)));
      panel.innerHTML = `<button class="u22-action" data-view="discover">Back to music</button><div class="release-page-header"><img src="${esc(track.cover)}" alt="${esc(track.title)} cover"><div><p class="section-kicker">${esc(track.versionLabel || track.releaseType)}</p><h1>${esc(track.title)}</h1><p>${esc(track.artist)}${track.releaseDate ? ` · ${esc(track.releaseDate)}` : ""}</p><div class="u22-actions"><button data-play="${esc(id)}">Play song</button><button data-release-share="${esc(id)}">Share release</button></div></div></div><div class="release-chips">${[...model.normalizeFranchise(track.franchise), ...model.values(track.character)].map((item) => `<span>${esc(item)}</span>`).join("")}</div>${track.description ? `<p>${esc(track.description)}</p>` : ""}<div class="u22-actions">${[["YouTube", track.youtubeUrl], ["Spotify", track.spotifyUrl], ["Apple Music", track.appleMusicUrl]].filter(([,url]) => model.safeUrl(url)).map(([label,url]) => `<a class="u22-action" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join("")}</div>${track.credits ? `<h2>Credits</h2><p>${esc(track.credits)}</p>` : ""}${related.length ? `<h2>Other versions</h2><div class="u22-actions">${related.map((item) => `<button data-release-open="${esc(item.id)}">${esc(item.versionLabel || item.title)}</button>`).join("")}</div>` : ""}<h2>Lyrics</h2><div id="release-lyrics-body">${esc(track.lyrics || "Lyrics have not been added to this release yet.")}</div>`;
      document.title = `${track.title} | XotiicDuck Music`;
    }
    player.switchView("release");
    panel.querySelector("h1")?.setAttribute("tabindex", "-1");
    panel.querySelector("h1")?.focus({ preventScroll: true });
  };
  const route = () => {
    clearTimeout(closeTimer);
    restoring = true;
    player.closePanels();
    const match = /^#release\/([a-z0-9-]+)$/.exec(location.hash);
    if (match) showRelease(match[1]);
    else { lastView = new URL(location.href).searchParams.get("view") || "home"; player.switchView(lastView); document.title = "XotiicDuck Music"; }
    if (history.state?.xotiicModal) player.openPanel(history.state.xotiicModal);
    restoring = false;
  };
  document.addEventListener("xotiic:viewchange", ({detail}) => {
    if (restoring || detail.view === "release") return;
    clearTimeout(closeTimer);
    const url = new URL(location.href); url.hash = "";
    if (detail.view === "home") url.searchParams.delete("view"); else url.searchParams.set("view", detail.view);
    if (history.state?.xotiicModal) history.replaceState({}, "", url);
    else if (url.href !== location.href) history.pushState({}, "", url);
    lastView = detail.view;
  });
  document.addEventListener("xotiic:panelchange", ({detail}) => {
    if (restoring) return;
    clearTimeout(closeTimer);
    if (detail.modal) {
      if (history.state?.xotiicModal === detail.modal) return;
      if (history.state?.xotiicModal) history.replaceState({xotiicModal: detail.modal}, "", location.href);
      else history.pushState({xotiicModal: detail.modal}, "", location.href);
    } else if (history.state?.xotiicModal) closeTimer = setTimeout(() => { if (history.state?.xotiicModal) history.back(); }, 0);
  });
  window.addEventListener("popstate", route);
  document.addEventListener("click", async (event) => {
    const open = event.target.closest("[data-release-open]");
    if (open) {
      clearTimeout(closeTimer);
      const url = new URL(location.href); url.hash = `release/${open.dataset.releaseOpen}`;
      if (history.state?.xotiicModal) history.replaceState({}, "", url); else history.pushState({}, "", url); route();
    }
    const share = event.target.closest("[data-release-share]");
    if (share) {
      const url = new URL(location.href); url.search = ""; url.hash = `release/${share.dataset.releaseShare}`;
      try { if (navigator.share) await navigator.share({title: document.title, url: url.href}); else { await navigator.clipboard.writeText(url.href); player.showToast("Release link copied."); } }
      catch (error) { if (error.name !== "AbortError") player.showToast("Could not share. Copy the address from your browser."); }
    }
  });
  // Existing play affordances stay intact. Details get their own labelled button.
  const addDetails = () => {
    for (const card of document.querySelectorAll(".release-card")) {
      if (card.querySelector("[data-release-open]")) continue;
      const id = card.querySelector("[data-play]")?.dataset.play;
      if (!id) continue;
      const button = document.createElement("button"); button.type = "button"; button.className = "release-details-button";
      button.dataset.releaseOpen = id; button.textContent = "Release details"; card.append(button);
    }
  };
  const catalogObserver = new MutationObserver(addDetails);
  for (const id of ["home-catalog", "discover-catalog"]) if (document.getElementById(id)) catalogObserver.observe(document.getElementById(id), {childList: true, subtree: true});
  addDetails();
  // Group existing controls without replacing their event handlers or saved preferences.
  const settings = $(".settings-modal");
  $("#settings-title").textContent = "Player settings";
  $(".settings-heading p:last-child").textContent = "Make the player comfortable on this device.";
  const appearance = document.createElement("details"); appearance.className = "u22-settings-section"; appearance.open = true;
  appearance.innerHTML = "<summary>Appearance</summary><div></div>";
  const controls = [".appearance-options", "#accent-settings", "#custom-accent-fields", ".motion-setting"].map((s) => $(s));
  controls[0].before(appearance); controls.forEach((node) => appearance.lastElementChild.append(node));
  const preferences = document.createElement("details"); preferences.className = "u22-settings-section";
  preferences.innerHTML = '<summary>Playback and layout</summary><div><label class="u22-field">Library density<select id="u22-density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><label class="u22-field">Desktop queue<select id="u22-dock"><option value="false">Open when needed</option><option value="true">Keep beside the library</option></select></label><label class="u22-field">Lyrics size<select id="u22-lyrics-size"><option value="1.1rem">Standard</option><option value="1.35rem">Large</option><option value="1.65rem">Extra large</option></select></label><div class="u22-actions"><button type="button" id="u22-sleep">Sleep timer</button></div></div>';
  appearance.after(preferences);
  for (const [selector, name, fallback, allowed, apply] of [
    ["#u22-density", "density", "comfortable", ["comfortable", "compact"], (v) => document.documentElement.dataset.density = v],
    ["#u22-dock", "dock", "false", ["true", "false"], (v) => document.documentElement.dataset.queueDocked = v],
    ["#u22-lyrics-size", "lyrics-size", "1.1rem", ["1.1rem", "1.35rem", "1.65rem"], (v) => document.documentElement.style.setProperty("--lyrics-size", v)]
  ]) {
    const control = $(selector), stored = read(`xotiic-ui-${name}`, fallback);
    control.value = allowed.includes(stored) ? stored : fallback; apply(control.value);
    control.addEventListener("change", () => { if (allowed.includes(control.value)) { save(`xotiic-ui-${name}`, control.value); apply(control.value); } });
  }
  $("#u22-sleep").addEventListener("click", () => player.openPanel("sleep-layer"));
  const downloads = document.createElement("details"); downloads.className = "u22-settings-section";
  downloads.innerHTML = '<summary>Downloads</summary><div><p class="u22-note">Saved music stays on this device. Your browser may remove it if storage is low.</p><div class="u22-actions"><button id="u22-downloads" type="button">Manage downloads</button></div></div>';
  preferences.after(downloads);
  $("#u22-downloads").addEventListener("click", () => { player.closePanels(); player.switchView("library"); $("#library-tab-offline")?.click(); });
  $("#app-health-title").textContent = "About and diagnostics";
  const undo = document.createElement("button"); undo.id = "queue-undo"; undo.className = "u22-action"; undo.textContent = "Undo queue change"; undo.hidden = true;
  $("#queue-list").before(undo);
  undo.addEventListener("click", () => { player.showToast(player.undoQueue() ? "Queue restored." : "That queue is no longer current."); undo.hidden = true; });
  document.addEventListener("xotiic:queueundo", ({detail}) => undo.hidden = !detail.available);
  let dragged = "";
  $("#queue-list").addEventListener("dragstart", (event) => { dragged = event.target.closest("[data-queue-id]")?.dataset.queueId || ""; if (dragged) event.dataTransfer.setData("text/plain", dragged); });
  $("#queue-list").addEventListener("dragover", (event) => { if (dragged && event.target.closest("[data-queue-id]")) event.preventDefault(); });
  $("#queue-list").addEventListener("drop", (event) => { event.preventDefault(); const target = event.target.closest("[data-queue-id]")?.dataset.queueId; if (target && dragged) player.reorderQueue(dragged, target); dragged = ""; });
  $("#queue-list").addEventListener("dragend", () => dragged = "");
  const dock = document.createElement("aside"); dock.id = "u22-queue-dock"; dock.setAttribute("aria-label", "Playback queue"); $("#app").append(dock);
  const renderDock = () => { dock.innerHTML = `<h2>In your queue</h2>${player.getQueue().map((track) => `<button data-queue-play="${esc(track.id)}"><img src="${esc(track.cover)}" alt=""><span>${esc(track.title)}</span></button>`).join("") || '<p class="u22-note">Play a song to begin.</p>'}`; };
  new MutationObserver(renderDock).observe($("#queue-list"), {childList: true}); renderDock();
  const discover = $('[data-panel="discover"]');
  const filters = document.createElement("div"); filters.className = "u22-discovery";
  filters.innerHTML = '<label class="u22-field">Franchise<select id="u22-franchise"><option value="">All franchises</option></select></label><label class="u22-field">Character<select id="u22-character"><option value="">All characters</option></select></label><p id="u22-discovery-status" class="u22-note" role="status"></p>';
  discover.querySelector(".page-title")?.after(filters);
  const applyFilters = () => {
    for (const [selector, field, normalize] of [["#u22-franchise","franchise",model.normalizeFranchise],["#u22-character","character",model.values]]) {
      const select=$(selector), values=[...new Set(player.getTracks().flatMap((track)=>normalize(track[field])))].sort();
      const signature=JSON.stringify(values);
      if(select.dataset.options===signature) continue;
      const selected=select.value;
      while(select.options.length>1) select.remove(1);
      values.forEach((value)=>select.add(new Option(value,value)));
      select.value=values.includes(selected)?selected:"";
      select.dataset.options=signature;
    }
    const franchise = $("#u22-franchise").value, character = $("#u22-character").value;
    const tracks = player.getTracks(); let count = 0;
    for (const card of discover.querySelectorAll(".release-card")) {
      const track = tracks.find((t) => t.id === card.querySelector("[data-play]")?.dataset.play);
      card.hidden = Boolean(track && ((franchise && !model.normalizeFranchise(track.franchise).includes(franchise)) || (character && !model.values(track.character).includes(character))));
      if (!card.hidden) count++;
    }
    $("#u22-discovery-status").textContent = franchise || character ? `${count} matching releases` : "";
  };
  for (const [selector, field, normalize] of [["#u22-franchise", "franchise", model.normalizeFranchise], ["#u22-character", "character", model.values]]) {
    const select = $(selector); if (!select) continue;
    [...new Set(player.getTracks().flatMap((track) => normalize(track[field])))].sort().forEach((value) => select.add(new Option(value, value)));
    select.addEventListener("change", applyFilters);
  }
  const discoverCatalog = $("#discover-catalog"); if (discoverCatalog) new MutationObserver(applyFilters).observe(discoverCatalog, {childList: true});
  if (location.hash.startsWith("#release/")) route();
})();

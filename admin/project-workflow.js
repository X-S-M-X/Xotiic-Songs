(() => {
  "use strict";
  const admin = globalThis.XotiicAdmin, vault = globalThis.XotiicArtworkVault, model = globalThis.XotiicReleaseModel;
  if (!admin || !vault || !model) return;
  const $ = (s) => document.querySelector(s);
  const esc = (text) => String(text || "").replace(/[&<>"']/g, (s) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
  const selected = new Set();
  const run = async (button, action) => { button.disabled = true; try { await action(); } catch (error) { admin.showToast(error.message, "error"); } finally { button.disabled = false; } };
  const tools = document.createElement("details"); tools.className = "u22-card u22-bulk-tools";
  tools.innerHTML = '<summary>Bulk artwork and recovery</summary><label class="u22-field">Add square covers<input id="project-bulk-covers" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><div class="u22-actions"><button id="project-select-all" type="button">Select all visible</button><button id="project-clear-selection" type="button">Clear selection</button><button id="project-export-selected" type="button">Export selected projects</button></div><div class="u22-bulk-fields"><label class="u22-field">Franchise<input id="project-batch-franchise" maxlength="500"></label><label class="u22-field">Character<input id="project-batch-character" maxlength="500"></label></div><div class="u22-actions"><button id="project-batch-apply" type="button">Fill selected empty fields</button></div><p id="project-bulk-status" class="u22-status" role="status"></p><p id="project-backup-status" class="u22-note"></p>';
  $(".artwork-controls").before(tools);
  const status = (message) => $("#project-bulk-status").textContent = message;
  const refreshSelection = () => {
    for (const card of document.querySelectorAll(".artwork-card")) {
      const id = card.querySelector("[data-artwork-select]")?.dataset.artworkSelect;
      if (!id || card.querySelector(".artwork-select-bulk")) continue;
      const check = document.createElement("input"); check.type = "checkbox"; check.className = "artwork-select-bulk";
      check.setAttribute("aria-label", `Select ${vault.get(id)?.title || "project"}`); check.checked = selected.has(id);
      check.addEventListener("change", () => { if (check.checked) selected.add(id); else selected.delete(id); status(`${selected.size} selected`); });
      card.prepend(check);
    }
    let exported = ""; try { exported = localStorage.getItem("xotiic-project-backup-at"); } catch {}
    $("#project-backup-status").textContent = exported ? `Last full backup export requested: ${new Date(exported).toLocaleString()}. Keep the downloaded file somewhere safe.` : "No full backup export recorded. Projects and attached MP3s stay on this device until you publish or export them.";
  };
  new MutationObserver(refreshSelection).observe($("#artwork-grid"), {childList:true}); refreshSelection();
  $("#project-select-all").onclick = () => { for (const button of document.querySelectorAll("#artwork-grid [data-artwork-select]")) selected.add(button.dataset.artworkSelect); vault.refresh(); status(`${selected.size} selected`); };
  $("#project-clear-selection").onclick = () => { selected.clear(); vault.refresh(); status("Selection cleared"); };
  $("#project-export-selected").onclick = (event) => run(event.currentTarget, () => vault.exportSelected([...selected]));
  $("#project-batch-apply").onclick = (event) => run(event.currentTarget, async () => {
    const franchise = $("#project-batch-franchise").value.trim(), character = $("#project-batch-character").value.trim();
    const records = [...selected].map((id) => vault.get(id)).filter(Boolean);
    if (!records.length) throw new Error("Select projects first.");
    await vault.saveBatch(records.map((r) => ({...r, franchise:r.franchise || franchise, character:r.character || character, updatedAt:Date.now()})));
    status(`Updated empty fields on ${records.length} projects.`);
  });
  const digest = async (blob) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))).map((n) => n.toString(16).padStart(2,"0")).join("");
  $("#project-bulk-covers").onchange = (event) => run(event.currentTarget, async () => {
    const files = [...event.target.files]; if (files.length > 100) throw new Error("Add up to 100 covers in one batch.");
    const hashes = new Set();
    for (const r of vault.list()) { const full = vault.get(r.id); hashes.add(full.coverHash || await digest(full.originalBlob || full.coverBlob)); }
    const records = [], failures = []; let duplicate = 0;
    for (const file of files) {
      try {
        const prepared = await vault.prepareCover(file, file.name), hash = await digest(file);
        if (hashes.has(hash)) { duplicate++; continue; } hashes.add(hash);
        const title = file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0,100) || "Untitled project";
        const hints = model.suggest({title, filename:file.name});
        records.push({id:vault.createId(), title, status:"needs-audio", franchise:hints.franchise, character:hints.character,
          coverBlob:prepared.blob, originalBlob:file, coverName:prepared.name, coverType:prepared.type,
          coverWidth:prepared.width, coverHeight:prepared.height, coverHash:hash, createdAt:Date.now(), updatedAt:Date.now()});
      } catch(error) { failures.push(`${file.name}: ${error.message}`); }
    }
    if (records.length) await vault.saveBatch(records);
    status(`${records.length} added, ${duplicate} exact duplicates skipped.\n${failures.join("\n")}`);
    event.target.value = "";
  });
  const form = $("#release-form");
  const current = document.createElement("div"); current.id = "project-current"; current.className = "u22-card";
  current.innerHTML = '<strong id="project-current-title">Song project</strong><p class="u22-note">Save the cover, attached MP3 and details here to continue on this device later.</p><div class="u22-actions"><button id="project-save-current" type="button">Save project on this device</button></div>';
  form.before(current);
  const saveCurrent = async () => {
    const files = admin.getReleaseFiles(), previous = vault.get(form.dataset.projectId);
    const title = $("#release-title").value.trim();
    if (!title || !(files.coverFile || previous?.coverBlob)) throw new Error("Add a working title and square cover first.");
    const id = previous?.id || vault.createId(), formFields = {};
    for (const input of form.querySelectorAll("input[id],select[id],textarea[id]")) {
      if (["file", "password"].includes(input.type)) continue;
      formFields[input.id] = ["checkbox","radio"].includes(input.type) ? input.checked : input.value;
    }
    await vault.saveBatch([{...previous, id, title, formFields, releaseMode:form.querySelector('input[name="release-mode"]:checked')?.value || "draft", status: files.audioFile ? "ready" : "needs-audio",
      franchise:$("#release-franchise").value, character:$("#release-character").value,
      coverBlob:files.coverFile || previous?.coverBlob, originalBlob:files.originalCoverFile || previous?.originalBlob || files.coverFile,
      coverName:files.coverFile?.name || previous?.coverName, coverType:files.coverFile?.type || previous?.coverType,
      coverWidth:files.coverWidth || previous?.coverWidth, coverHeight:files.coverHeight || previous?.coverHeight,
      audioBlob:files.audioFile || previous?.audioBlob, audioName:files.audioFile?.name || previous?.audioName,
      createdAt:previous?.createdAt || Date.now(), updatedAt:Date.now()}]);
    form.dataset.projectId = id; $("#project-current-title").textContent = title;
    admin.showToast("Project saved on this device, including its attached files.");
  };
  $("#project-save-current").onclick = (event) => run(event.currentTarget, saveCurrent);
  form.addEventListener("reset", () => { delete form.dataset.projectId; $("#project-current-title").textContent = "Song project"; });
  document.addEventListener("xotiic:projectloaded", ({detail}) => $("#project-current-title").textContent = detail.title);
  document.addEventListener("xotiic:releasecommitted", async ({detail}) => {
    const r = vault.get(detail.projectId); if (!r) return;
    try { await vault.saveBatch([{...r, releaseId:detail.id, releaseStatus:detail.status, updatedAt:Date.now()}]); }
    catch { admin.showToast("Release committed, but its local project link could not be saved.", "error"); }
  });
  const hint = document.createElement("p"); hint.className = "u22-note"; hint.id = "project-metadata-hint";
  $("#release-character").closest("label").after(hint);
  const suggest = () => {
    const result = model.suggest({title:$("#release-title").value, filename:$("#audio-file").files[0]?.name,
      franchise:$("#release-franchise").value, character:$("#release-character").value});
    let filled = false;
    for (const key of ["franchise","character"]) if (!$("#release-" + key).value && result[key]) {
      $("#release-" + key).value = result[key]; $("#release-" + key).dispatchEvent(new Event("input", {bubbles:true})); filled = true;
    }
    hint.textContent = filled ? "Suggested from your title, filename or existing metadata. Review these names before publishing." : "Unclear names are left empty. You can review existing songs together in Manage music.";
  };
  $("#release-title").addEventListener("change", suggest); $("#audio-file").addEventListener("change", suggest);
  document.addEventListener("xotiic:projectloaded", suggest);
  const review = document.createElement("details"); review.id = "metadata-review"; review.className = "u22-card";
  review.innerHTML = '<summary>Review discovery metadata in bulk</summary><p class="u22-note">Suggestions use titles and metadata. Existing values are kept. Edit the suggestions and select only the songs you want to update. Each repository is saved separately.</p><div class="u22-actions"><button id="metadata-load" type="button">Prepare review</button><button id="metadata-save" type="button" disabled>Save selected metadata</button></div><div class="u22-scroll"><table class="u22-table"><thead><tr><th>Select</th><th>Song</th><th>Franchise</th><th>Character</th></tr></thead><tbody id="metadata-rows"></tbody></table></div><p id="metadata-status" class="u22-status" role="status"></p>';
  $('[data-panel="releases"]').prepend(review);
  let reviewed = [];
  $("#metadata-load").onclick = () => {
    reviewed = admin.getReleases();
    $("#metadata-rows").innerHTML = reviewed.map((r, index) => { const suggested = model.suggest(r); return `<tr data-metadata-index="${index}"><td><input type="checkbox" aria-label="Select ${esc(r.title)}"></td><td>${esc(r.title)}<br><small>${esc(r.status)}</small></td><td><input data-field="franchise" aria-label="Franchise for ${esc(r.title)}" value="${esc(r.franchise || suggested.franchise)}" maxlength="500"></td><td><input data-field="character" aria-label="Character for ${esc(r.title)}" value="${esc(r.character || suggested.character)}" maxlength="500"></td></tr>`; }).join("");
    $("#metadata-save").disabled = !reviewed.length;
  };
  $("#metadata-save").onclick = (event) => run(event.currentTarget, async () => {
    const changes = [...$("#metadata-rows").querySelectorAll("tr")].filter((tr) => tr.querySelector("input[type=checkbox]").checked).map((tr) => {
      const r = reviewed[Number(tr.dataset.metadataIndex)];
      return {id:r.id, expectedUpdatedAt:r.updatedAt, franchise:tr.querySelector('[data-field="franchise"]').value.trim(), character:tr.querySelector('[data-field="character"]').value.trim()};
    });
    if (!changes.length) throw new Error("Select at least one song.");
    const result = await admin.updateMetadata(changes);
    $("#metadata-status").textContent = `${result.completed} songs updated. Refresh the review before making more changes.`;
    $("#metadata-rows").replaceChildren();
  });
  for (const prefix of ["release", "edit"]) {
    const target = $(`#${prefix}-lyrics`); if (!target) continue;
    const links = document.createElement("div"); links.className = "u22-bulk-fields";
    links.innerHTML = `<label class="u22-field">Version label<input id="${prefix}-version-label" maxlength="80" placeholder="Full song or AMV edit"></label><label class="u22-field">Other version IDs<input id="${prefix}-related-ids" maxlength="1000" placeholder="Comma-separated release IDs"></label><label class="u22-field">Spotify link<input id="${prefix}-spotify-url" type="url" placeholder="https://..."></label><label class="u22-field">Apple Music link<input id="${prefix}-apple-url" type="url" placeholder="https://..."></label>`;
    target.closest("label").after(links);
  }
  document.addEventListener("xotiic:editrelease", ({detail:r}) => {
    $("#edit-version-label").value = r.versionLabel || ""; $("#edit-related-ids").value = (r.relatedReleaseIds || []).join(", ");
    $("#edit-spotify-url").value = r.spotifyUrl || ""; $("#edit-apple-url").value = r.appleMusicUrl || "";
  });
  document.addEventListener("xotiic:buildrelease", ({detail:{release,prefix}}) => {
    const hints = model.suggest({...release, filename:prefix === "release" ? $("#audio-file").files[0]?.name : ""});
    for (const key of ["franchise","character"]) if (!release[key]) release[key] = hints[key];
    release.versionLabel = $(`#${prefix}-version-label`).value.trim();
    release.relatedReleaseIds = model.values($(`#${prefix}-related-ids`).value).filter((id) => /^[a-z0-9-]+$/.test(id));
    release.spotifyUrl = model.safeUrl($(`#${prefix}-spotify-url`).value); release.appleMusicUrl = model.safeUrl($(`#${prefix}-apple-url`).value);
  });
  const privateNote = document.createElement("p"); privateNote.className = "u22-card u22-note";
  $('[data-panel="security"]').prepend(privateNote); privateNote.textContent = admin.privateStatus();
  document.addEventListener("xotiic:privatestatus", ({detail}) => privateNote.textContent = detail);
})();

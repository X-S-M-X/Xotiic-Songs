(() => {
  "use strict";
  const { GitHubPublisher: Base, formatCatalog } = globalThis.XotiicGitHub;
  const model = globalThis.XotiicReleaseModel;
  class PrivatePublisher extends Base {
    constructor(options) {
      super(options);
      this.staging = new Base({...options, repository: options.privateRepository});
      this.privateIds = new Set(); this.media = new Map(); this.disposed = false;
      this.privateStatus = "Private storage has not been checked.";
    }
    async requirePrivate() {
      const repo = await this.staging.request(this.staging.repoPath());
      if (!repo.private || repo.full_name.toLowerCase() === `${this.owner}/${this.repository}`.toLowerCase()) throw new Error("Choose a separate private repository.");
      if (!repo.permissions?.push) throw new Error("Your token needs Contents read/write access to the private repository.");
      return this.staging;
    }
    async getCatalog() {
      const publicCatalog = await super.getCatalog();
      let privateReleases = [];
      try {
        await this.requirePrivate(); privateReleases = (await this.staging.getCatalog()).releases;
        this.privateStatus = "Private storage connected. Complete scheduler setup to enable automatic releases.";
      } catch (error) {
        this.privateStatus = `Private storage unavailable: ${error.message}. Complete PRIVATE-STORAGE-SETUP.md before saving online drafts.`;
      }
      this.privateIds = new Set(privateReleases.map((r) => r.id));
      const combined = new Map(publicCatalog.releases.map((r) => [r.id, r]));
      for (const r of privateReleases) if (!combined.has(r.id) || combined.get(r.id).status !== "published") combined.set(r.id, r);
      for (const r of publicCatalog.releases) if (r.status === "published") this.privateIds.delete(r.id);
      const pending = privateReleases.filter((r) => this.privateIds.has(r.id) && model.safeAssetPath(r.cover));
      const workers = Array.from({length:Math.min(4, pending.length)}, async () => { while (pending.length && !this.disposed) { const r = pending.shift(); try { await this.previewUrl(r, r.cover); } catch {} } });
      await Promise.all(workers);
      if (this.disposed) throw new Error("Console was locked.");
      document.dispatchEvent(new CustomEvent("xotiic:privatestatus", {detail: this.privateStatus}));
      return {...publicCatalog, releases: [...combined.values()]};
    }
    async assetFile(publisher, asset, ref = publisher.branch) {
      if (!model.safeAssetPath(asset)) throw new Error("Invalid media path.");
      const file = await publisher.request(publisher.repoPath(`/contents/${asset.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`));
      const blob = file.encoding === "base64" && file.content ? file : await publisher.request(publisher.repoPath(`/git/blobs/${file.sha}`));
      if (blob.encoding !== "base64") throw new Error("Could not read media from storage.");
      const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, "")), (c) => c.charCodeAt(0));
      const type = asset.endsWith(".mp3") ? "audio/mpeg" : asset.endsWith(".png") ? "image/png" : /\.jpe?g$/.test(asset) ? "image/jpeg" : "image/webp";
      return new File([bytes], asset.split("/").pop(), {type});
    }
    cachedUrl(release, asset) { return this.media.get(`${release.id}:${asset}:${release.updatedAt}`) || ""; }
    async previewUrl(release, asset) {
      if (!this.privateIds.has(release.id)) return "";
      const key = `${release.id}:${asset}:${release.updatedAt}`;
      if (!this.media.has(key)) {
        const file = await this.assetFile(this.staging, asset);
        if (this.disposed) throw new Error("Console was locked.");
        if (!this.media.has(key)) this.media.set(key, URL.createObjectURL(file));
      }
      return this.media.get(key);
    }
    dispose() { this.disposed = true; for (const url of this.media.values()) URL.revokeObjectURL(url); this.media.clear(); this.token = ""; this.staging.token = ""; }
    async publishRelease(options) {
      if (options.release.status !== "published") { await this.requirePrivate(); await this.staging.publishRelease(options); }
      else await super.publishRelease({...options, release: model.publicRecord(options.release)});
      return this.getCatalog();
    }
    async updateRelease(options) {
      const {releases} = await this.getCatalog();
      const previous = releases.find((r) => r.id === options.id);
      if (!previous) throw new Error("Release no longer exists. Refresh the catalog.");
      if (options.expectedUpdatedAt != null && (previous.updatedAt || "") !== options.expectedUpdatedAt) throw new Error("This release changed. Refresh before saving.");
      const fromPrivate = this.privateIds.has(options.id), toPrivate = options.release.status !== "published";
      if (fromPrivate === toPrivate) {
        if (toPrivate) { await this.requirePrivate(); await this.staging.updateRelease(options); }
        else await super.updateRelease({...options, release: model.publicRecord(options.release)});
      } else {
        await this.requirePrivate();
        const source = fromPrivate ? this.staging : this, destination = toPrivate ? this.staging : this;
        const snapshot = await source.getHeadContext();
        const current = (await source.getCatalogAt(snapshot.headSha)).releases.find((r) => r.id === previous.id);
        if (!current || JSON.stringify(current) !== JSON.stringify(previous)) throw new Error("The source changed. Refresh before transferring.");
        const dest = await Base.prototype.getCatalog.call(destination);
        if (dest.releases.some((r) => r.id === previous.id)) throw new Error("This ID exists in both repositories. Resolve the interrupted transfer before retrying; neither copy was overwritten.");
        await Base.prototype.publishRelease.call(destination, {...options, release: toPrivate ? options.release : model.publicRecord(options.release),
          audioFile: options.audioFile || await this.assetFile(source, previous.audio, snapshot.headSha),
          coverFile: options.coverFile || await this.assetFile(source, previous.cover, snapshot.headSha)});
        if ((await source.getHeadContext()).headSha !== snapshot.headSha) throw new Error("Copy succeeded but the source changed. Both copies are retained for review.");
        await Base.prototype.deleteRelease.call(source, previous.id, snapshot.headSha);
      }
      return this.getCatalog();
    }
    async setReleaseStatus(id, status, metadata = {}) {
      if (!["published", "draft", "scheduled", "archived"].includes(status)) throw new Error("Invalid release status.");
      const {releases} = await this.getCatalog(), previous = releases.find((r) => r.id === id);
      if (!previous) throw new Error("Release no longer exists.");
      const release = {...previous, ...metadata, id, status, updatedAt: new Date().toISOString()};
      if (status === "published") { release.publishedAt = new Date().toISOString(); delete release.releaseAt; }
      if (status === "scheduled" && !Number.isFinite(Date.parse(release.releaseAt))) throw new Error("Choose a valid schedule.");
      return this.updateRelease({id, release, expectedUpdatedAt:previous.updatedAt || ""});
    }
    async deleteRelease(id) {
      await this.getCatalog();
      if (this.privateIds.has(id)) { await this.requirePrivate(); await this.staging.deleteRelease(id); }
      else await super.deleteRelease(id);
      return this.getCatalog();
    }
    async updateMetadata(changes) {
      await this.getCatalog(); let completed = 0;
      try { for (const privateGroup of [true, false]) {
        const selected = changes.filter((c) => this.privateIds.has(c.id) === privateGroup);
        if (!selected.length) continue;
        const target = privateGroup ? await this.requirePrivate() : this;
        const context = await target.getHeadContext(), {releases} = await target.getCatalogAt(context.headSha);
        if (selected.some((c) => !releases.some((r) => r.id === c.id))) throw new Error("A selected release was removed. Refresh before saving.");
        const next = releases.map((r) => {
          const change = selected.find((c) => c.id === r.id); if (!change) return r;
          if ((r.updatedAt || "") !== (change.expectedUpdatedAt || "")) throw new Error("A selected release changed. Refresh the bulk review.");
          return {...r, franchise: String(change.franchise || "").slice(0, 500), character: String(change.character || "").slice(0, 500), updatedAt: new Date().toISOString()};
        });
        const sha = await target.createBlob(formatCatalog(next));
        await target.finalizeCommit({...context, message: "Update reviewed discovery metadata", entries: [{path:"catalog.js", type:"blob", mode:"100644", sha}]});
        completed += selected.length;
      }
      } catch (error) {
        error.message = `${completed} releases saved before this stop. ${error.message}`;
        try { error.catalog = await this.getCatalog(); } catch {}
        throw error;
      }
      return {...await this.getCatalog(), completed};
    }
  }
  globalThis.XotiicPrivatePublisher = PrivatePublisher;
})();

(() => {
  "use strict";

  class GitHubError extends Error {
    constructor(message, { status = 0, code = "GITHUB_ERROR", details = null } = {}) {
      super(message);
      this.name = "GitHubError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

  const decodeBase64Utf8 = (value) => {
    const binary = atob(String(value || "").replaceAll("\n", ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const readFileAsBase64 = (file, onProgress) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma < 0) reject(new Error(`Could not encode ${file.name}.`));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });

  const CATALOG_VERSION = 3;

  const parseCatalog = (source) => {
    const match = String(source || "").match(/window\.XOTIICDUCK_RELEASES\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
    if (!match) throw new GitHubError("catalog.js is not in the expected XotiicDuck format.", { code: "CATALOG_FORMAT" });
    try {
      const releases = JSON.parse(match[1]);
      if (!Array.isArray(releases)) throw new Error("Catalog must be an array.");
      return releases;
    } catch {
      throw new GitHubError("catalog.js contains invalid release data.", { code: "CATALOG_PARSE" });
    }
  };

  const formatCatalog = (releases) =>
    `// Managed by Xotiic Upload. Only complete releases are shown publicly.\nwindow.XOTIICDUCK_CATALOG_VERSION = ${CATALOG_VERSION};\nwindow.XOTIICDUCK_RELEASES = ${JSON.stringify(releases, null, 2)};\n`;

  class GitHubPublisher {
    constructor({ token, owner, repository, branch = "main", requiredLogin, apiVersion = "2022-11-28" }) {
      this.token = String(token || "").trim();
      this.owner = owner;
      this.repository = repository;
      this.branch = branch;
      this.requiredLogin = requiredLogin;
      this.apiVersion = apiVersion;
      this.baseUrl = "https://api.github.com";
    }

    async request(path, options = {}) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": this.apiVersion,
          ...options.headers,
        },
      });
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
      if (!response.ok) {
        const apiMessage = typeof payload === "object" && payload?.message ? payload.message : "GitHub rejected the request.";
        const code = response.status === 401 ? "TOKEN_INVALID"
          : response.status === 403 ? "TOKEN_FORBIDDEN"
            : response.status === 409 ? "REPOSITORY_CONFLICT"
              : response.status === 422 ? "BRANCH_CHANGED"
                : "GITHUB_ERROR";
        throw new GitHubError(apiMessage, { status: response.status, code, details: payload });
      }
      return payload;
    }

    repoPath(path = "") {
      return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}${path}`;
    }

    async verifyOwner() {
      const [user, repository] = await Promise.all([
        this.request("/user"),
        this.request(this.repoPath()),
      ]);
      if (String(user?.login || "").toLowerCase() !== String(this.requiredLogin || "").toLowerCase()) {
        throw new GitHubError(`This token belongs to ${user?.login || "another account"}, not ${this.requiredLogin}.`, { code: "OWNER_MISMATCH" });
      }
      if (!repository?.permissions?.push && !repository?.permissions?.admin) {
        throw new GitHubError("This token cannot write to the Xotiic-Songs repository.", { code: "NO_WRITE_PERMISSION" });
      }
      return { user, repository };
    }

    async getHeadContext() {
      const ref = await this.request(this.repoPath(`/git/ref/heads/${encodeURIComponent(this.branch)}`));
      const headSha = ref?.object?.sha;
      if (!headSha) throw new GitHubError(`The ${this.branch} branch is not ready yet. Push the website to GitHub first.`, { code: "BRANCH_MISSING" });
      const commit = await this.request(this.repoPath(`/git/commits/${headSha}`));
      return { headSha, treeSha: commit?.tree?.sha };
    }

    async getCatalogAt(ref = this.branch) {
      const file = await this.request(this.repoPath(`/contents/${encodePath("catalog.js")}?ref=${encodeURIComponent(ref)}`));
      if (!file?.content) throw new GitHubError("catalog.js could not be read from GitHub.", { code: "CATALOG_MISSING" });
      const source = decodeBase64Utf8(file.content);
      return { source, releases: parseCatalog(source), sha: file.sha };
    }

    async getCatalog() {
      return this.getCatalogAt(this.branch);
    }

    async createBlob(content, encoding = "utf-8") {
      const blob = await this.request(this.repoPath("/git/blobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, encoding }),
      });
      return blob.sha;
    }

    async finalizeCommit({ headSha, treeSha, entries, message }) {
      const tree = await this.request(this.repoPath("/git/trees"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_tree: treeSha, tree: entries }),
      });
      const commit = await this.request(this.repoPath("/git/commits"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
      });
      await this.request(this.repoPath(`/git/refs/heads/${encodeURIComponent(this.branch)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return {
        sha: commit.sha,
        url: `https://github.com/${this.owner}/${this.repository}/commit/${commit.sha}`,
      };
    }

    async publishRelease({ release, audioFile, coverFile, onStep }) {
      onStep?.("catalog", 0.05, "Reading the latest catalog");
      const { headSha, treeSha } = await this.getHeadContext();
      const { releases } = await this.getCatalogAt(headSha);
      if (releases.some((entry) => entry.id === release.id)) {
        throw new GitHubError("A release with this ID already exists.", { code: "DUPLICATE_RELEASE" });
      }

      onStep?.("audio-read", 0.12, "Preparing the MP3");
      const audioContent = await readFileAsBase64(audioFile, (ratio) => onStep?.("audio-read", 0.12 + ratio * 0.12, "Preparing the MP3"));
      onStep?.("audio-upload", 0.27, "Uploading the MP3 to GitHub");
      const audioSha = await this.createBlob(audioContent, "base64");

      onStep?.("cover-read", 0.51, "Preparing the square cover");
      const coverContent = await readFileAsBase64(coverFile, (ratio) => onStep?.("cover-read", 0.51 + ratio * 0.05, "Preparing the square cover"));
      onStep?.("cover-upload", 0.58, "Uploading the cover to GitHub");
      const coverSha = await this.createBlob(coverContent, "base64");

      const nextReleases = [...releases, release];
      onStep?.("catalog-upload", 0.76, "Updating the public catalog");
      const catalogSha = await this.createBlob(formatCatalog(nextReleases), "utf-8");

      onStep?.("commit", 0.88, "Publishing one atomic release commit");
      const result = await this.finalizeCommit({
        headSha,
        treeSha,
        message: `Publish ${release.title}`,
        entries: [
          { path: release.audio, mode: "100644", type: "blob", sha: audioSha },
          { path: release.cover, mode: "100644", type: "blob", sha: coverSha },
          { path: "catalog.js", mode: "100644", type: "blob", sha: catalogSha },
        ],
      });
      onStep?.("done", 1, "Release published");
      return { ...result, releases: nextReleases };
    }

    async updateRelease({ id, release, audioFile = null, coverFile = null, onStep }) {
      onStep?.("catalog", 0.06, "Reading the latest release");
      const { headSha, treeSha } = await this.getHeadContext();
      const { releases } = await this.getCatalogAt(headSha);
      const index = releases.findIndex((entry) => entry.id === id);
      if (index < 0) throw new GitHubError("That release is no longer in the catalog.", { code: "RELEASE_MISSING" });
      if (release.id !== id) throw new GitHubError("A release ID cannot be changed after publishing.", { code: "RELEASE_ID_CHANGED" });
      const previous = releases[index];
      const entries = [];

      if (audioFile) {
        onStep?.("audio-read", 0.13, "Preparing the replacement MP3");
        const content = await readFileAsBase64(audioFile, (ratio) => onStep?.("audio-read", 0.13 + ratio * 0.13, "Preparing the replacement MP3"));
        onStep?.("audio-upload", 0.3, "Uploading the replacement MP3");
        const sha = await this.createBlob(content, "base64");
        entries.push({ path: release.audio, mode: "100644", type: "blob", sha });
        if (previous.audio !== release.audio && /^(music|covers)\/[a-zA-Z0-9._/-]+$/.test(previous.audio || "") && !previous.audio.includes("..")) {
          entries.push({ path: previous.audio, mode: "100644", type: "blob", sha: null });
        }
      }

      if (coverFile) {
        onStep?.("cover-read", 0.47, "Preparing the replacement cover");
        const content = await readFileAsBase64(coverFile, (ratio) => onStep?.("cover-read", 0.47 + ratio * 0.08, "Preparing the replacement cover"));
        onStep?.("cover-upload", 0.58, "Uploading the replacement cover");
        const sha = await this.createBlob(content, "base64");
        entries.push({ path: release.cover, mode: "100644", type: "blob", sha });
        if (previous.cover !== release.cover && /^(music|covers)\/[a-zA-Z0-9._/-]+$/.test(previous.cover || "") && !previous.cover.includes("..")) {
          entries.push({ path: previous.cover, mode: "100644", type: "blob", sha: null });
        }
      }

      const nextReleases = releases.map((entry, entryIndex) => entryIndex === index ? release : entry);
      onStep?.("catalog-upload", 0.73, "Updating release details");
      const catalogSha = await this.createBlob(formatCatalog(nextReleases), "utf-8");
      entries.push({ path: "catalog.js", mode: "100644", type: "blob", sha: catalogSha });
      onStep?.("commit", 0.88, "Saving one atomic release update");
      const result = await this.finalizeCommit({
        headSha,
        treeSha,
        message: `Update ${release.title}`,
        entries,
      });
      onStep?.("done", 1, "Release updated");
      return { ...result, releases: nextReleases };
    }

    async setReleaseStatus(id, status, metadata = {}) {
      const { headSha, treeSha } = await this.getHeadContext();
      const { releases } = await this.getCatalogAt(headSha);
      const index = releases.findIndex((entry) => entry.id === id);
      if (index < 0) throw new GitHubError("That release is no longer in the catalog.", { code: "RELEASE_MISSING" });
      if (!["published", "scheduled", "draft", "archived"].includes(status)) {
        throw new GitHubError("That release status is not supported.", { code: "RELEASE_STATUS" });
      }
      const now = new Date().toISOString();
      const nextReleases = releases.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        const next = { ...entry, ...metadata, status, updatedAt: now };
        if (status === "published") {
          next.publishedAt = metadata.publishedAt || now;
          delete next.releaseAt;
          delete next.archivedAt;
        } else if (status === "scheduled") {
          delete next.publishedAt;
          delete next.archivedAt;
        } else if (status === "archived") {
          next.archivedAt = metadata.archivedAt || now;
          delete next.releaseAt;
        } else {
          delete next.releaseAt;
          delete next.archivedAt;
        }
        return next;
      });
      const catalogSha = await this.createBlob(formatCatalog(nextReleases), "utf-8");
      const result = await this.finalizeCommit({
        headSha,
        treeSha,
        message: `${status === "published" ? "Publish" : status === "scheduled" ? "Schedule" : status === "archived" ? "Archive" : "Hide"} ${releases[index].title}`,
        entries: [{ path: "catalog.js", mode: "100644", type: "blob", sha: catalogSha }],
      });
      return { ...result, releases: nextReleases };
    }

    async deleteRelease(id) {
      const { headSha, treeSha } = await this.getHeadContext();
      const { releases } = await this.getCatalogAt(headSha);
      const release = releases.find((entry) => entry.id === id);
      if (!release) throw new GitHubError("That release is no longer in the catalog.", { code: "RELEASE_MISSING" });
      const nextReleases = releases.filter((entry) => entry.id !== id);
      const catalogSha = await this.createBlob(formatCatalog(nextReleases), "utf-8");
      const entries = [{ path: "catalog.js", mode: "100644", type: "blob", sha: catalogSha }];
      for (const path of [release.audio, release.cover]) {
        if (typeof path === "string" && /^(music|covers)\/[a-zA-Z0-9._/-]+$/.test(path) && !path.includes("..")) {
          entries.push({ path, mode: "100644", type: "blob", sha: null });
        }
      }
      const result = await this.finalizeCommit({
        headSha,
        treeSha,
        message: `Remove ${release.title}`,
        entries,
      });
      return { ...result, releases: nextReleases };
    }
  }

  const api = { GitHubPublisher, GitHubError, parseCatalog, formatCatalog, readFileAsBase64, CATALOG_VERSION };
  globalThis.XotiicGitHub = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();

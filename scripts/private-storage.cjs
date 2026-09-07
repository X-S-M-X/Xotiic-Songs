/* Run locally with gh authentication, or in the PRIVATE repository's workflow. */
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {createHash} = require("node:crypto");
const {GitHubPublisher, parseCatalog, formatCatalog} = require("../admin/github.js");
const model = require("../release-model.js");
const fingerprint = (r) => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a],[b]) => a.localeCompare(b))));
const validate = (r) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id || "") || !String(r.title || "").trim()) throw Error("A release needs a valid ID and title.");
  if (!model.safeAssetPath(r.audio) || !model.safeAssetPath(r.cover) || !r.audio.startsWith("music/") || !r.cover.startsWith("covers/")) throw Error(`Invalid media paths for ${r.id}.`);
};
class Store extends GitHubPublisher {
  async snapshot() { const context = await this.getHeadContext(); return {...context, ...(await this.getCatalogAt(context.headSha))}; }
  async put(context, releases, entries, message) {
    const sha = await this.createBlob(formatCatalog(releases));
    return this.finalizeCommit({...context, message, entries:[...entries, {path:"catalog.js",mode:"100644",type:"blob",sha}]});
  }
  async copyAsset(source, ref, file) {
    if (!model.safeAssetPath(file)) throw Error("Unsafe media path.");
    const metadata = await source.request(source.repoPath(`/contents/${file}?ref=${ref}`));
    const blob = await source.request(source.repoPath(`/git/blobs/${metadata.sha}`));
    if (blob.encoding !== "base64") throw Error(`Could not read ${file}.`);
    const content = Buffer.from(blob.content.replace(/\s/g,""), "base64");
    const expected = createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
    if (expected !== metadata.sha) throw Error(`Source verification failed for ${file}.`);
    const sha = await this.createBlob(content.toString("base64"), "base64");
    if (sha !== expected) throw Error(`Destination verification failed for ${file}. Source was retained.`);
    return {path:file,mode:"100644",type:"blob",sha};
  }
}
async function copyRecords(source, target, records, {publish = false, apply = false, sanitizeSource = false} = {}) {
  if (!records.length) return {copied:0};
  const src = await source.snapshot(), dest = await target.snapshot();
  const selected = records.map((r) => {
    const current = src.releases.find((entry) => entry.id === r.id);
    if (!current || fingerprint(current) !== fingerprint(r)) throw Error("A release changed. Refresh and retry.");
    validate(r);
    return publish ? model.publicRecord({...r, publishedAt:r.publishedAt || r.releaseAt}) : r;
  });
  const additions = selected.filter((r) => {
    const existing = dest.releases.find((entry) => entry.id === r.id);
    if (existing && fingerprint(existing) !== fingerprint(r)) throw Error(`Conflicting copies of ${r.id}. Both were retained for review.`);
    return !existing;
  });
  for (const r of additions) for (const asset of [r.audio,r.cover]) {
    if (dest.releases.some((other) => other.id !== r.id && [other.audio,other.cover].includes(asset))) throw Error(`Shared destination path ${asset}. Neither release was replaced.`);
  }
  if (!apply) return {copied:additions.length, total:selected.length, preview:true};
  if (additions.length) {
    const entries = [];
    for (const r of additions) for (const file of [r.audio,r.cover]) if (!entries.some((e) => e.path === file)) entries.push(await target.copyAsset(source, src.headSha, file));
    await target.put(dest, [...dest.releases,...additions], entries, publish ? "Publish scheduled releases" : "Move unreleased music to private storage");
  }
  // Verify every destination record and blob, including copies left by an interrupted run.
  const verified = await target.snapshot();
  for (const r of selected) {
    if (fingerprint(verified.releases.find((entry) => entry.id === r.id) || {}) !== fingerprint(r)) throw Error("Destination changed. Source retained.");
    for (const file of [r.audio,r.cover]) {
      const [a,b] = await Promise.all([source.request(source.repoPath(`/contents/${file}?ref=${src.headSha}`)), target.request(target.repoPath(`/contents/${file}?ref=${verified.headSha}`))]);
      if (a.sha !== b.sha) throw Error(`Verification failed for ${file}. Source retained.`);
    }
  }
  if ((await source.getHeadContext()).headSha !== src.headSha) throw Error("The source changed. Verified destination copies are retained; retry after review.");
  const ids = new Set(records.map((r) => r.id));
  const remaining = src.releases.filter((r) => !ids.has(r.id)).map((r) => sanitizeSource ? model.publicRecord(r) : r);
  const assets = [...new Set(records.flatMap((r) => [r.audio,r.cover]))].filter((file) => !remaining.some((r) => r.audio === file || r.cover === file));
  await source.put(src, remaining, assets.map((file) => ({path:file,mode:"100644",type:"blob",sha:null})), publish ? "Complete scheduled publication" : "Remove verified private releases from public branch");
  return {copied:additions.length, moved:records.length};
}
async function main() {
  const command = process.argv[2], apply = process.argv.includes("--apply");
  const token = process.env.XOTIIC_PUBLISH_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || execFileSync("gh",["auth","token"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  const owner = process.env.XOTIIC_OWNER || "X-S-M-X";
  const publicRepo = process.env.XOTIIC_PUBLIC_REPOSITORY || "Xotiic-Songs", privateRepo = process.env.XOTIIC_PRIVATE_REPOSITORY || "Xotiic-Songs-Private";
  const options = {token,owner,branch:"main",requiredLogin:owner};
  const publicStore = new Store({...options,repository:publicRepo}), privateStore = new Store({...options,repository:privateRepo});
  if (privateRepo.toLowerCase() === publicRepo.toLowerCase()) throw Error("Private and public repositories must be different.");
  const metadata = await privateStore.request(privateStore.repoPath());
  if (!metadata.private) throw Error("Staging repository must be private. No changes made.");
  if (command === "bootstrap") {
    const root = path.resolve(__dirname,"..");
    const files = ["scripts/private-storage.cjs","admin/github.js","release-model.js"];
    let context;
    try { context = await privateStore.getHeadContext(); } catch { throw Error("Initialize the private repository with a README before setup."); }
    if (!apply) { console.log("Preview: install private publishing tools; existing catalog and media are preserved."); return; }
    const entries = [];
    for (const file of files) entries.push({path:file,mode:"100644",type:"blob",sha:await privateStore.createBlob(fs.readFileSync(path.join(root,file),"utf8"))});
    entries.push({path:".github/workflows/publish-scheduled.yml",mode:"100644",type:"blob",sha:await privateStore.createBlob(fs.readFileSync(path.join(root,"private-template/publish-scheduled.yml"),"utf8"))});
    try { await privateStore.getCatalog(); } catch (error) { if (error.status !== 404) throw error; entries.push({path:"catalog.js",mode:"100644",type:"blob",sha:await privateStore.createBlob(formatCatalog([]))}); }
    if (!apply) { console.log("Preview: install private publishing tools; existing catalog and media are preserved."); return; }
    await privateStore.finalizeCommit({...context, entries, message:"Install private release publishing tools"});
    console.log("Private tools installed. Configure the publisher secret before migrating releases."); return;
  }
  if (command === "migrate") {
    const catalog = await publicStore.getCatalog();
    const records = catalog.releases.filter((r) => !model.publicNow(r));
    console.log(`${apply ? "Moving" : "Preview:"} ${records.length} unreleased records into private storage.`);
    console.log(JSON.stringify(await copyRecords(publicStore,privateStore,records,{apply,sanitizeSource:true})));
    console.log("Older public Git history is unchanged. Previously public files cannot be made historically private by this migration.");
  } else if (command === "publish-due") {
    const catalog = await privateStore.getCatalog(), now = Date.now();
    const due = catalog.releases.filter((r) => r.status === "scheduled" && model.publicNow(r,now));
    console.log(JSON.stringify(await copyRecords(privateStore,publicStore,due,{publish:true,apply})));
  } else throw Error("Use bootstrap, migrate, or publish-due. Add --apply to write changes.");
}
module.exports = {Store, validate, fingerprint, copyRecords};
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode=1; });

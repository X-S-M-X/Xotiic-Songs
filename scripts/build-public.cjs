/* An allowlist keeps private tooling and unreferenced media out of Pages. */
const fs = require("node:fs");
const path = require("node:path");
const {parseCatalog,formatCatalog} = require("../admin/github.js");
const model = require("../release-model.js");
const ROOT_FILES = ["index.html","theme.js","release-model.js","player-experience.js","app.js","offline.js","range.js","sw.js","download-manager.js","discovery.js","storage-tools.js","online-config.js","online-platform.js","connected-devices.js","manifest.webmanifest","favicon.svg","apple-touch-icon.png","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png","app-icon.svg","app-icon-maskable.svg"];
const ADMIN_FILES = ["index.html","theme-sync.js","config.js","crypto.js","github.js","private-publisher.js","app.js","studio.js","artwork-vault.js","project-workflow.js","sw.js","manifest.webmanifest"];
const CODE_FILES = [...ROOT_FILES,...ADMIN_FILES.map((file) => `admin/${file}`),"ui/player.css","ui/console.css","ui/contrast.js"];
function build(root, output) {
  if (fs.existsSync(output)) throw Error("Build output already exists. Choose a fresh directory.");
  const releases = parseCatalog(fs.readFileSync(path.join(root,"catalog.js"),"utf8"));
  const published = releases.filter((r) => model.publicNow(r)).map((r) => model.publicRecord(r));
  const files = [...new Set([...CODE_FILES,...published.flatMap((r) => [r.audio,r.cover])])];
  for (const file of files) {
    if (!CODE_FILES.includes(file) && !model.safeAssetPath(file)) throw Error("Unsafe catalog asset path.");
    const src = path.join(root,file);
    if (!fs.existsSync(src) || fs.lstatSync(src).isSymbolicLink() || !fs.statSync(src).isFile()) throw Error(`Missing public asset: ${file}`);
    if (!fs.realpathSync(src).startsWith(fs.realpathSync(root)+path.sep)) throw Error("Asset escaped project root.");
  }
  fs.mkdirSync(output,{recursive:true});
  for (const file of files) { const dest=path.join(output,file); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.copyFileSync(path.join(root,file),dest); }
  fs.writeFileSync(path.join(output,"catalog.js"),formatCatalog(published));
  fs.writeFileSync(path.join(output,".nojekyll"),"");
  return {releases:published.length, excluded:releases.length-published.length, files:files.length+2};
}
module.exports={build,CODE_FILES};
if(require.main===module) console.log(build(path.resolve(__dirname,".."),path.resolve(process.argv[2] || "_site")));

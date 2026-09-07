/* Deterministic compatibility build. Edit component sources, not generated bundles. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const groups = {
  player: ["styles.css", "layout.css", "anime-theme.css", "update-13-14.css", "update-15-16.css", "update-17-18.css", "update-19-20.css", "player-hotfix.css", "update-20-1.css", "update-21.css"],
  console: ["admin/styles.css", "admin/update-12.css", "admin/update-13-14.css", "admin/update-15-16.css", "admin/admin-hotfix.css", "admin/admin-player-v2.css", "admin/update-21.css"]
};
for (const [name, files] of Object.entries(groups)) {
  const sources = [...files, "ui/tokens.css", `ui/${name}-components.css`];
  const body = sources.map((file) => {
    let css = fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
    // Relative URLs must retain their original base when moved into ui/.
    css = css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (all, quote, url) => {
      if (/^(data:|https?:|\/|#|var\()/i.test(url)) return all;
      return `url(${quote}${path.posix.relative("ui", path.posix.normalize(path.posix.join(path.posix.dirname(file), url)))}${quote})`;
    });
    return `/* Source: ${file} */\n${css}`;
  }).join("\n");
  const output = path.join(root, `ui/${name}.css`);
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(output) || fs.readFileSync(output, "utf8").replace(/\r\n/g, "\n") !== body) throw new Error(`Rebuild ui/${name}.css`);
  } else fs.writeFileSync(output, body);
}

const {createHash} = require("node:crypto");
for (const file of ["index.html","sw.js","admin/index.html","admin/sw.js"]) {
  const target=path.join(root,file), original=fs.readFileSync(target,"utf8");
  const next=original.replace(/((?:\.\.\/)?[a-zA-Z0-9_./-]+\.(?:css|js))\?v=22\.0\.0(?:&rev=[a-f0-9]+)?/g, (all,asset) => {
    const source=path.resolve(path.dirname(target),asset);
    if (!fs.existsSync(source)) return all;
    return asset+"?v=22.0.0&rev="+createHash("sha256").update(fs.readFileSync(source,"utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0,12);
  });
  if (process.argv.includes("--check")) { if(next!==original) throw Error("Rebuild asset revisions in "+file); }
  else fs.writeFileSync(target,next);
}

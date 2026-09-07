const fs = require("node:fs"), path = require("node:path"), {execFileSync} = require("node:child_process");
for(const folder of [".","admin","ui","scripts"]) for(const file of fs.readdirSync(folder)) if(/\.(?:js|cjs)$/.test(file) && file!=="catalog.js") execFileSync(process.execPath,["--check",path.join(folder,file)],{stdio:"inherit"});

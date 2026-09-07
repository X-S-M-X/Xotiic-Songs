const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {validatePackage,protectedPath,digest,blob}=require("../scripts/update-installer.cjs");
test("installer verifies payload bytes and rejects protected paths",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"xotiic-package-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,"payload"));const bytes=Buffer.from("safe");
  fs.writeFileSync(path.join(root,"payload","app.js"),bytes);
  const manifest={version:"22.0.0",files:[{path:"app.js",sha256:digest(bytes),targetBlob:blob(bytes),baseBlob:null}]};
  fs.writeFileSync(path.join(root,"UPDATE-MANIFEST.json"),JSON.stringify(manifest));
  assert.equal(validatePackage(root).files.length,1);
  fs.writeFileSync(path.join(root,"payload","app.js"),"changed");
  assert.throws(()=>validatePackage(root),/verification failed/);
  for(const name of ["../app.js","catalog.js","music/song.mp3","covers/art.webp","android-twa/output/a.apk",".git/config",".env","keys/key.jks"])assert.equal(protectedPath(name),true,name);
  assert.equal(protectedPath(".github/workflows/validate.yml"),false);
});

test("UI build remains deterministic after a Windows CRLF checkout",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"xotiic-crlf-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project=path.resolve(__dirname,"..");
  for(const dir of [".","admin","ui","scripts"]){
    fs.mkdirSync(path.join(root,dir),{recursive:true});
    for(const name of fs.readdirSync(path.join(project,dir))){
      const src=path.join(project,dir,name);
      if(!/\.(?:js|cjs|css|html)$/.test(name)||!fs.statSync(src).isFile())continue;
      fs.writeFileSync(path.join(root,dir,name),fs.readFileSync(src,"utf8").replace(/\r?\n/g,"\r\n"));
    }
  }
  require("node:child_process").execFileSync(process.execPath,["scripts/build-ui.cjs","--check"],{cwd:root});
});

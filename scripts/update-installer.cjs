/* Protected Windows/macOS/Linux installer. Distributed as installer.cjs beside payload/. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const digest=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const blob=(bytes)=>crypto.createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
const protectedPath=(file)=>!file || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(file)
  || file.split("/").some(p=>p==="."||p==="..") || /^(catalog\.js|music\/|covers\/|android-twa\/|\.git\/|\.env(?:\.|$))/i.test(file)
  || /\.(mp3|mp4|apk|aab|jks|keystore|pem|p12)$/i.test(file);
function validatePackage(root){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"UPDATE-MANIFEST.json"),"utf8"));
  if(manifest.version!=="22.0.0"||!Array.isArray(manifest.files)||!manifest.files.length)throw Error("Invalid Update 22 manifest.");
  const names=new Set();
  for(const item of manifest.files){
    if(protectedPath(item.path)||names.has(item.path))throw Error("Unsafe or duplicate payload path: "+item.path);
    names.add(item.path);
    const file=path.join(root,"payload",item.path);
    if(!fs.existsSync(file)||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error("Missing payload file: "+item.path);
    const bytes=fs.readFileSync(file);
    if(digest(bytes)!==item.sha256||blob(bytes)!==item.targetBlob)throw Error("Package verification failed: "+item.path);
    if(item.baseBlob!==null&&!/^[a-f0-9]{40}$/.test(item.baseBlob))throw Error("Invalid source revision.");
  }
  return manifest;
}
function run(command,args,cwd,{capture=false,allowFailure=false}={}){
  const result=spawnSync(command,args,{cwd,encoding:"utf8",stdio:capture?["ignore","pipe","pipe"]:"inherit",
    shell:process.platform==="win32"&&command==="npm"});
  if(result.error)throw Error(command+" could not start: "+result.error.message);
  if(result.status!==0&&!allowFailure)throw Error(command+" failed. "+(capture?result.stderr||"":"See the output above."));
  return result;
}
function install(root,repo){
  const [major,minor]=process.versions.node.split(".").map(Number);
  if(major<22||(major===22&&minor<12))throw Error("Install Node.js 22.12 or newer before applying Update 22.");
  const manifest=validatePackage(root);
  repo=path.resolve(repo);
  const git=(args,opts={})=>run("git",args,repo,{capture:true,...opts}).stdout?.trim()||"";
  if(path.resolve(git(["rev-parse","--show-toplevel"]))!==repo)throw Error("Choose the root of your existing Xotiic-Songs repository.");
  const remote=git(["remote","get-url","origin"]);
  if(!/^(https:\/\/github\.com\/|git@github\.com:)X-S-M-X\/Xotiic-Songs(?:\.git)?\/?$/i.test(remote))throw Error("Origin is not X-S-M-X/Xotiic-Songs. No app files changed.");
  if(git(["branch","--show-current"])!=="main")throw Error("Switch to the main branch first.");
  const exclude=path.resolve(repo,git(["rev-parse","--git-path","info/exclude"]));
  fs.mkdirSync(path.dirname(exclude),{recursive:true});
  let text=fs.existsSync(exclude)?fs.readFileSync(exclude,"utf8"):"";
  for(const pattern of ["/android-twa/generated/","/android-twa/output/"])if(!text.split(/\r?\n/).includes(pattern))text+="\n"+pattern+"\n";
  fs.writeFileSync(exclude,text);
  if(git(["status","--porcelain"]))throw Error("There are uncommitted changes. Save the intended changes first; do not add Android output or signing files.");
  run("git",["pull","--ff-only","origin","main"],repo);
  const version=JSON.parse(fs.readFileSync(path.join(repo,"package.json"),"utf8")).version;
  if(!/^(21|22)\./.test(version))throw Error("This package needs Update 21 or Update 22 after pulling. Found "+version);
  const pending=[];
  for(const item of manifest.files){
    const target=path.join(repo,item.path),exists=fs.existsSync(target);
    if(exists&&digest(fs.readFileSync(target))===item.sha256)continue;
    const result=run("git",["rev-parse","--verify","HEAD:"+item.path],repo,{capture:true,allowFailure:true});
    const current=result.status===0?result.stdout.trim():null;
    if(current===item.targetBlob)continue;
    if(current!==item.baseBlob||(exists&&item.baseBlob===null))throw Error("Newer or conflicting code in "+item.path+". No payload files were copied.");
    pending.push(item);
  }
  if(!pending.length){console.log("This Update 22 package is already installed. See PRIVATE-STORAGE-SETUP.md for private scheduling.");return;}
  const backup=path.join(path.dirname(repo),"XotiicDuck-Update22-Backup-"+new Date().toISOString().replace(/[:.]/g,"-"));
  fs.mkdirSync(backup);
  fs.writeFileSync(path.join(backup,"BASE-COMMIT.txt"),git(["rev-parse","HEAD"])+"\n");
  const files=pending.map(i=>i.path),created=[];
  for(const item of pending){
    const target=path.join(repo,item.path),save=path.join(backup,"files",item.path);
    if(fs.existsSync(target)){fs.mkdirSync(path.dirname(save),{recursive:true});fs.copyFileSync(target,save);}
    else created.push(item.path);
  }
  fs.writeFileSync(path.join(backup,"NEW-FILES.json"),JSON.stringify(created,null,2));
  let committed=false;
  try{
    for(const item of pending){
      const target=path.join(repo,item.path);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(root,"payload",item.path),target);
    }
    run("npm",["ci"],repo);run("npm",["test"],repo);
    const buildOutput=path.join(backup,"public-validation");
    run(process.execPath,["scripts/build-public.cjs",buildOutput],repo);
    fs.rmSync(buildOutput,{recursive:true,force:true});
    run("git",["diff","--check"],repo);
    run("git",["add","--",...files],repo);
    run("git",["--no-pager","diff","--cached","--stat"],repo);
    run("git",["commit","-m","Release Update 22 player and song projects"],repo);committed=true;
    run("git",["push","origin","main"],repo);
    console.log("Update 22 pushed. GitHub runs the browser checks before deploying.");
    console.log("Backup: "+backup);
    console.log("Next: read PRIVATE-STORAGE-SETUP.md to enable private drafts and scheduling.");
  }catch(error){
    if(!committed){
      for(const item of pending){
        const target=path.join(repo,item.path),saved=path.join(backup,"files",item.path);
        if(fs.existsSync(target)&&digest(fs.readFileSync(target))!==item.sha256)continue;
        if(fs.existsSync(saved))fs.copyFileSync(saved,target);else if(created.includes(item.path))fs.rmSync(target,{force:true});
      }
      run("git",["reset","HEAD","--",...files],repo,{allowFailure:true});
      console.error("App files restored after validation failed. Backup: "+backup);
    }else console.error("Your Update 22 commit and backup were kept. Resolve the push error, then run git push origin main.");
    throw error;
  }
}
module.exports={validatePackage,protectedPath,digest,blob,install};
if(require.main===module){
  try{
    if(process.argv.includes("--verify-package")){console.log("Verified "+validatePackage(__dirname).files.length+" protected payload files.");}
    else install(__dirname,process.argv[2]||path.join(process.env.USERPROFILE||process.env.HOME,"Downloads","XotiicDuck-Music-Portable"));
  }catch(error){console.error(error.message);process.exitCode=1;}
}

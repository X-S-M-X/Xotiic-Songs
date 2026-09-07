const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const model=require("../release-model.js");
const {copyRecords}=require("../scripts/private-storage.cjs");
const {build,CODE_FILES}=require("../scripts/build-public.cjs");
const {GitHubPublisher,formatCatalog}=require("../admin/github.js");
const {palette,luminance}=require("../ui/contrast.js");
const record=(id="test-song",status="draft")=>({id,title:id,status,audio:"music/"+id+".mp3",cover:"covers/"+id+".webp",updatedAt:"2026-01-01",notes:"private",releaseAt:"2020-01-01T00:00:00Z"});
class MemoryStore {
  constructor(releases=[]){this.releases=structuredClone(releases);this.head=1;this.writes=[];this.assets=new Map(releases.flatMap(r=>[[r.audio,r.audio],[r.cover,r.cover]]));}
  repoPath(s){return s;}
  async snapshot(){return {headSha:String(this.head),treeSha:"tree",releases:structuredClone(this.releases)};}
  async getHeadContext(){return {headSha:String(this.head),treeSha:"tree"};}
  async request(url){const file=url.split("/contents/")[1].split("?")[0];return {sha:this.assets.get(file)};}
  async copyAsset(source,ref,file){return {path:file,sha:source.assets.get(file)};}
  async put(context,releases,entries,message){assert.equal(context.headSha,String(this.head));this.releases=structuredClone(releases);for(const e of entries){if(e.sha===null)this.assets.delete(e.path);else this.assets.set(e.path,e.sha);}this.head++;this.writes.push(message);}
}
test("public metadata strips private project details and rejects hidden songs",()=>{
  const r=model.publicRecord({...record("visible","published"),projectId:"secret",lyrics:"kept",discNumber:2});
  assert.equal(r.notes,undefined);assert.equal(r.projectId,undefined);assert.equal(r.lyrics,"kept");assert.equal(r.discNumber,2);
  assert.throws(()=>model.publicRecord(record()),/Unreleased/);
  assert.equal(model.safeAssetPath("covers/../key"),false);
  assert.equal(model.safeUrl("javascript:alert(1)"),"");
});
test("metadata suggestions use explicit names without guessing poetic titles",()=>{
  assert.equal(model.suggest({title:"Rimuru Tempest song"}).franchise,"Tensura");
  assert.equal(model.suggest({title:"My Silent World"}).character,"");
  assert.equal(model.suggest({title:"Void",lyrics:"rimuru"}).character,"");
  assert.deepEqual(model.normalizeFranchise("That Time I Got Reincarnated as a Slime"),["Tensura"]);
});
test("custom action text remains legible on extreme colours",()=>{
  for(const colour of ["#000000","#ffffff","#777777","#ff0000","#00ff00","#0000ff"]){
    const p=palette(colour,"#101612"),rgb=colour.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16));
    const a=luminance(rgb),b=p.ink==="#ffffff"?1:0;
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
  }
});
test("migration preview makes no writes",async()=>{
  const r=record(),src=new MemoryStore([r]),dst=new MemoryStore();
  assert.equal((await copyRecords(src,dst,[r])).preview,true);
  assert.equal(src.writes.length+dst.writes.length,0);
});
test("verified migration keeps shared media referenced by another song",async()=>{
  const r=record(),other={...record("other","published"),cover:r.cover};
  const src=new MemoryStore([r,other]),dst=new MemoryStore();
  await copyRecords(src,dst,[r],{apply:true,sanitizeSource:true});
  assert.equal(src.releases.length,1);assert.ok(src.assets.has(r.cover));assert.equal(src.assets.has(r.audio),false);
  assert.equal(dst.releases[0].notes,"private");assert.equal(src.releases[0].notes,undefined);
});
test("destination verification failure never removes source",async()=>{
  const r=record(),src=new MemoryStore([r]),dst=new MemoryStore();
  dst.copyAsset=async()=>({path:r.audio,sha:"wrong"});
  await assert.rejects(copyRecords(src,dst,[r],{apply:true}),/Verification failed/);
  assert.equal(src.writes.length,0);assert.equal(src.releases.length,1);
});
test("concurrent source edit is retained and identical copies can resume safely",async()=>{
  const r=record(),src=new MemoryStore([r]),dst=new MemoryStore();
  const put=dst.put.bind(dst);dst.put=async(...args)=>{await put(...args);src.head++;};
  await assert.rejects(copyRecords(src,dst,[r],{apply:true}),/source changed/);
  assert.equal(src.releases.length,1);assert.equal(dst.releases.length,1);
  dst.put=put;
  const result=await copyRecords(src,dst,[r],{apply:true});
  assert.equal(result.copied,0);assert.equal(src.releases.length,0);assert.equal(dst.releases.length,1);
});
test("conflicting IDs and destination asset paths are not overwritten",async()=>{
  const r=record(),src=new MemoryStore([r]);
  await assert.rejects(copyRecords(src,new MemoryStore([{...r,title:"separate edit"}]),[r],{apply:true}),/Conflicting copies/);
  await assert.rejects(copyRecords(src,new MemoryStore([{...record("other"),cover:r.cover}]),[r],{apply:true}),/Shared destination/);
  assert.equal(src.writes.length,0);
});
test("scheduled publication exposes only approved public fields",async()=>{
  const r=record("due","scheduled"),src=new MemoryStore([r]),dst=new MemoryStore();
  await copyRecords(src,dst,[r],{apply:true,publish:true});
  assert.equal(dst.releases[0].status,"published");assert.equal(dst.releases[0].releaseAt,undefined);
  assert.equal(dst.releases[0].notes,undefined);assert.equal(src.releases.length,0);
});
test("public build excludes unreleased media and detects missing referenced files",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"xotiic-build-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const live=record("live","published"),draft=record("draft"),future={...record("future","scheduled"),releaseAt:"2099-01-01"};
  for(const f of [...CODE_FILES,...[live,draft,future].flatMap(r=>[r.audio,r.cover])]){
    fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),"fixture");
  }
  fs.writeFileSync(path.join(root,"catalog.js"),formatCatalog([live,draft,future]));
  const dest=path.join(root,"out");assert.equal(build(root,dest).releases,1);
  assert.equal(fs.existsSync(path.join(dest,draft.audio)),false);
  assert.equal(fs.existsSync(path.join(dest,future.cover)),false);
  assert.equal(fs.readFileSync(path.join(dest,"catalog.js"),"utf8").includes('"notes"'),false);
  fs.unlinkSync(path.join(root,live.audio));assert.throws(()=>build(root,path.join(root,"next")),/Missing public asset/);
});
test("publisher rejects stale edits and preserves shared assets during deletion",async()=>{
  const publisher=new GitHubPublisher({owner:"test",repository:"test",branch:"main",token:"unused"});
  publisher.getHeadContext=async()=>({headSha:"head",treeSha:"tree"});
  const r=record(),other={...record("other"),cover:r.cover};
  publisher.getCatalogAt=async()=>({releases:[r,other]});
  publisher.createBlob=async()=>"blob";let commit;
  publisher.finalizeCommit=async args=>{commit=args;return {};};
  await assert.rejects(publisher.updateRelease({id:r.id,release:r,expectedUpdatedAt:"stale"}),/changed/);
  await assert.rejects(publisher.deleteRelease(r.id,"old-head"),/source changed/);
  await publisher.deleteRelease(r.id,"head");
  assert.equal(commit.entries.some(e=>e.path===r.cover&&e.sha===null),false);
  assert.ok(commit.entries.some(e=>e.path===r.audio&&e.sha===null));
});

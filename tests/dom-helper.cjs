const fs=require("node:fs"), path=require("node:path");
const {JSDOM}=require("jsdom");
const {indexedDB,IDBKeyRange}=require("fake-indexeddb");
const root=path.resolve(__dirname,"..");
function load(file="index.html", setup=()=>{}) {
  const errors=[];
  const dom=new JSDOM(fs.readFileSync(path.join(root,file),"utf8"),{url:`https://test.invalid/${file}`,runScripts:"outside-only",pretendToBeVisual:true});
  const w=dom.window;
  w.addEventListener("error",(e)=>{errors.push(e.error || Error(e.message));e.preventDefault();});
  w.matchMedia=(media)=>({media,matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLMediaElement.prototype.load=function(){};
  w.HTMLMediaElement.prototype.pause=function(){Object.defineProperty(this,"paused",{value:true,configurable:true});};
  w.HTMLMediaElement.prototype.play=async function(){Object.defineProperty(this,"paused",{value:false,configurable:true});this.dispatchEvent(new w.Event("play"));};
  w.URL.createObjectURL=()=>"blob:https://test.invalid/test";w.URL.revokeObjectURL=()=>{};
  w.indexedDB=indexedDB;w.IDBKeyRange=IDBKeyRange;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  Object.defineProperty(w,"crypto",{value:require("node:crypto").webcrypto});
  w.confirm=()=>false;
  w.fetch=async()=>({ok:false,status:503,text:async()=>"",json:async()=>({}),headers:new Headers()});
  setup(w);
  for(const script of w.document.querySelectorAll("script[src]")) {
    const url=new URL(script.src); if(url.origin!==w.location.origin)continue;
    const source=path.join(root,url.pathname);
    w.eval(fs.readFileSync(source,"utf8")+`\n//# sourceURL=${source}`);
  }
  return {w,dom,errors};
}
module.exports={load};

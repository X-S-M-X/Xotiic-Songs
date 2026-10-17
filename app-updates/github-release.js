((root, factory) => { const model=typeof module==='object'?require('./model.js'):root.XotiicReleaseModel; const api=factory(model);if(typeof module==='object') module.exports=api;else root.XotiicReleasePublisher=api;})(globalThis, model => {
  'use strict';
  const read = async publisher => {
    const head=await publisher.getHeadContext();
    const file=await publisher.request(publisher.repoPath(`/contents/app-release.json?ref=${encodeURIComponent(head.headSha)}`));
    const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
    return {...head,sha:file.sha,config:model.validate(JSON.parse(new TextDecoder().decode(bytes)))};
  };
  const publish = async (publisher, review, desired, banner, isActive=()=>true) => {
    const config=model.validate({...desired,schema:1,revision:model.revision(),updatedAt:new Date().toISOString()});
    const latest=await read(publisher);
    if(latest.sha!==review.sha)throw new Error('App settings changed since review. Review the current settings again. Your music has not been changed.');
    const entries=[];
    if(banner){
      if(!/^app-updates\/banner\.(png|jpg|webp)$/.test(banner.path)||banner.path!==config.branding.banner||typeof banner.base64!=='string'||banner.base64.length>2800000||!/^[A-Za-z0-9+/]+=*$/.test(banner.base64))throw new Error('Invalid banner upload.');
      entries.push({path:banner.path,mode:'100644',type:'blob',sha:await publisher.createBlob(banner.base64,'base64')});
    }
    entries.push({path:'app-release.json',mode:'100644',type:'blob',sha:await publisher.createBlob(JSON.stringify(config,null,2)+'\n')});
    for(let attempt=0;attempt<3;attempt++){
      if(!isActive())throw new Error('The console was locked. Unlock and review again.');
      const head=await read(publisher);
      if(head.sha!==review.sha)throw new Error('Another app settings change was published. Review again.');
      try{
        const commit=await publisher.finalizeCommit({headSha:head.headSha,treeSha:head.treeSha,entries,message:`Select ${model.versions[config.activeVersion]} and app branding`});
        return {...commit,config};
      }catch(error){
        // A song commit may advance main. Rebase the settings-only tree onto it.
        const current=await read(publisher);
        if(current.config.revision===config.revision)return {sha:current.headSha,url:`https://github.com/${publisher.owner}/${publisher.repository}/commit/${current.headSha}`,config};
        if(current.sha!==review.sha)throw new Error('App settings changed during publishing. Review again.');
        if(current.headSha===head.headSha||attempt===2)throw error;
      }
    }
  };
  return Object.freeze({read,publish});
});

(() => {
  'use strict';
  const model=window.XotiicReleaseModel, transport=window.XotiicReleasePublisher;
  const $=id=>document.getElementById(id);
  const runtime=window.XotiicRelease;
  let review=null,desired=null,banner=null,bannerUrl='',busy=false,confirmation=null;
  const session=action=>window.XotiicAdmin.withAppUpdateSession(action);
  const feedback=(id,message,error=false)=>{const el=$(id);el.textContent=message;el.dataset.error=String(error);};
  const generations={};
  const buttonIds=['app-update-review','app-update-publish','branding-publish','branding-reset','app-update-target','brand-banner-file'];
  const setBusy=value=>{busy=value;buttonIds.forEach(id=>{if($(id))$(id).disabled=value;});document.querySelectorAll('#branding-form input').forEach(input=>input.disabled=value);};
  const clearReview=()=>{review=null;desired=null;confirmation=null;$('app-update-plan').hidden=true;$('branding-plan').hidden=true;};
  window.addEventListener('xotiic:adminlocked',clearReview);
  function waitForDeployment(result,id){
    const generation=(generations[id]||0)+1;generations[id]=generation;
    feedback(id,'GitHub accepted the commit. Waiting for Pages deployment. You can check deployment status below.');
    const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noreferrer';link.textContent=' View commit';$(id).append(link);
    let attempts=0;
    const poll=async()=>{if(generations[id]!==generation)return;try{const deployed=await runtime.fetchConfig();if(deployed.revision===result.config.revision){feedback(id,'Deployed successfully. Reload the player or console when ready.');const reload=document.createElement('button');reload.type='button';reload.textContent='Reload';reload.className='secondary-action';reload.onclick=()=>location.reload();$(id).append(reload);return;}}catch{}if(++attempts<36)setTimeout(poll,5000);else feedback(id,'Commit saved. Pages deployment is still pending or failed. Check Deployment status; no additional publish is needed.');};
    setTimeout(poll,5000);
  }
  const commit=async id=>{
    if(busy||!review||!desired)return;
    const selected=structuredClone(desired), reviewed=review, file=confirmation==='branding'?banner:null;
    setBusy(true);
    try{const result=await session((publisher,isActive)=>transport.publish(publisher,reviewed,selected,file,isActive));clearReview();draft=structuredClone(result.config.branding);banner=null;if(bannerUrl){URL.revokeObjectURL(bannerUrl);bannerUrl='';}syncBrand();$('app-update-git').textContent=model.versions[result.config.activeVersion];waitForDeployment(result,id);}
    catch(error){clearReview();feedback(id,error.message,true);}finally{setBusy(false);}
  };
  let draft={...model.defaults.branding};
  const syncBrand=()=>{
    document.querySelectorAll('[name=brand-logo]').forEach(input=>input.checked=input.value===draft.logo);
    document.querySelectorAll('.brand-choice').forEach(choice=>choice.classList.toggle('selected',choice.querySelector('input').checked));
    $('banner-position').value=draft.position;
    document.querySelectorAll('.brand-preview-logo').forEach(img=>img.src=runtime.logoUrl(draft.logo));
    document.querySelectorAll('.brand-preview-banner').forEach(img=>{img.src=bannerUrl||(draft.banner?new URL(`${draft.banner}?v=${Date.now()}`,runtime.base).href:new URL('ui/assets/artist.png',runtime.base).href);img.style.objectPosition=`center ${draft.position}%`;});
  };
  async function prepare(kind){
    if(busy)return;clearReview();setBusy(true);const id=kind==='branding'?'branding-feedback':'app-update-feedback';
    try{
      review=await session(publisher=>transport.read(publisher));
      $('app-update-git').textContent=model.versions[review.config.activeVersion];
      desired=kind==='branding'?{...review.config,branding:structuredClone(draft)}:{...review.config,activeVersion:$('app-update-target').value};
      desired=model.validate(desired);confirmation=kind;
      if(kind==='branding')$('branding-plan').hidden=false;
      else {$('app-update-description').textContent=`Change ${model.versions[review.config.activeVersion]} to ${model.versions[desired.activeVersion]}. GitHub Pages will deploy the selection.`;$('app-update-plan').hidden=false;}
      feedback(id,'Reviewed the latest GitHub settings. Confirm to publish.');
    }catch(error){clearReview();feedback(id,error.message,true);}finally{setBusy(false);}
  }
  $('app-update-review').onclick=()=>prepare('version');
  $('app-update-publish').onclick=()=>commit('app-update-feedback');
  $('branding-publish').onclick=()=>commit('branding-feedback');
  $('app-update-cancel').onclick=clearReview;$('branding-cancel').onclick=clearReview;
  $('app-update-target').onchange=clearReview;
  const tabs=[...document.querySelectorAll('[data-updates-tab]')];
  tabs.forEach((tab,index)=>tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].click();tabs[next].focus();}));
  document.querySelectorAll('[data-updates-tab]').forEach(tab=>tab.onclick=()=>{const branding=tab.dataset.updatesTab==='branding';$('branding-form').hidden=!branding;$('app-updates-versions').hidden=branding;document.querySelectorAll('[data-updates-tab]').forEach(item=>item.setAttribute('aria-selected',String(item===tab)));});
  $('branding-form').onsubmit=event=>{event.preventDefault();prepare('branding');};
  $('branding-reset').onclick=()=>{clearReview();draft={...model.defaults.branding};banner=null;if(bannerUrl)URL.revokeObjectURL(bannerUrl);bannerUrl='';$('brand-banner-file').value='';syncBrand();feedback('branding-feedback','Defaults selected. Review before publishing.');};
  $('branding-form').addEventListener('input',event=>{if(event.target.name==='brand-logo')draft.logo=event.target.value;if(event.target.id==='banner-position')draft.position=Number(event.target.value);if(event.target.id!=='brand-banner-file'){clearReview();syncBrand();}});
  $('brand-banner-file').addEventListener('change',async event=>{
    clearReview();const file=event.target.files?.[0];if(!file)return;
    const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    if(!extensions[file.type]||file.size>2*1024*1024||file.size===0){feedback('branding-feedback','Choose PNG, JPEG or WebP under 2 MB.',true);event.target.value='';return;}
    setBusy(true);
    try{
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read banner.'));reader.readAsDataURL(file);});
      const image=new Image(), url=URL.createObjectURL(file);try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('This file is not a readable image.'));image.src=url;});}catch(error){URL.revokeObjectURL(url);throw error;}
      if(bannerUrl)URL.revokeObjectURL(bannerUrl);bannerUrl=url;draft.banner=`app-updates/banner.${extensions[file.type]}`;banner={path:draft.banner,base64:data};syncBrand();feedback('branding-feedback','Banner ready. Review before publishing.');
    }catch(error){feedback('branding-feedback',error.message,true);}finally{setBusy(false);}
  });
  runtime.ready.then(config=>{draft=structuredClone(config.branding);$('app-update-current').textContent=model.versions[config.activeVersion];$('app-update-target').value=config.activeVersion;$('branding-form').hidden=true;syncBrand();if(!runtime.verified)feedback('app-update-feedback','Hosted settings could not be verified. The original design is shown. Review reads GitHub directly.',true);});
})();

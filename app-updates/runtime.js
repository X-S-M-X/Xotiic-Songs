(() => {
  'use strict';
  const base = new URL('../',document.currentScript.src);
  const model = window.XotiicReleaseModel;
  let settings = structuredClone(model.defaults), online = false;
  const fetchConfig = async () => {
    const response = await fetch(new URL(`app-release.json?check=${Date.now()}`,base), {cache:'no-store',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(`App selection unavailable (${response.status}).`);
    return model.validate(await response.json());
  };
  const logoUrl = logo => new URL(`ui/assets/${logo==='portrait'?'artist.png':`xd-${logo==='anime'?'anime':'classic'}.svg`}`,base).href;
  const apply = value => {
    settings = model.validate(value);
    const anime = settings.activeVersion === '21.1.0';
    const root=document.documentElement;
    root.dataset.previewUi=anime?'anime':'baseline21'; root.dataset.brandLogo=settings.branding.logo;
    if (anime) {
      for (const file of ['shared.css',location.pathname.includes('/admin/')?'console.css':'player.css']) {
        const style=document.createElement('link');style.rel='stylesheet';style.href=new URL(`ui/${file}?v=1`,base);style.dataset.appDesign='';document.head.append(style);
      }
      document.querySelectorAll('.brand-mark,.owner-avatar').forEach(target=>{const image=document.createElement('img');image.src=logoUrl(settings.branding.logo);image.alt='XotiicDuck';target.replaceChildren(image);});
      for (const [selector,cls] of [['.hero','xd-hero-art'],['.dashboard-header','xd-console-art']]) {
        const parent=document.querySelector(selector);if(!parent)continue;
        const art=document.createElement('img');art.className=cls;art.src=settings.branding.banner?new URL(`${settings.branding.banner}?v=${settings.revision}`,base).href:new URL('ui/assets/artist.png',base).href;art.alt='';art.setAttribute('aria-hidden','true');art.style.objectPosition=`center ${settings.branding.position}%`;parent.prepend(art);
      }
    }
    const nav=document.querySelector('.dashboard-nav [data-admin-panel=branding]');if(nav)nav.hidden=!anime;
    const back=document.querySelector('[data-legacy-update-control]');if(back)back.hidden=anime;
    const note=document.getElementById('branding-version-note');if(note)note.hidden=anime;
    document.dispatchEvent(new CustomEvent('xotiic:release-ready',{detail:structuredClone(settings)}));
  };
  const api={get config(){return structuredClone(settings);},get verified(){return online;},fetchConfig,logoUrl,base};
  window.XotiicRelease=api;
  api.ready=(async()=>{try{settings=await fetchConfig();online=true;}catch(error){api.error=error.message;}apply(settings);return api.config;})();
  let checking=false;
  const check=async()=>{if(checking||document.hidden)return;checking=true;try{const next=await fetchConfig();if(next.revision!==settings.revision&&!document.querySelector('.xd-release-notice')){const note=document.createElement('aside');note.className='xd-release-notice';note.setAttribute('role','status');note.textContent='App appearance updated. Reload when you are ready.';const button=document.createElement('button');button.type='button';button.textContent='Reload';button.onclick=()=>location.reload();note.append(button);document.body.append(note);}}catch{}finally{checking=false;}};
  window.addEventListener('focus',check);window.addEventListener('online',check);
})();

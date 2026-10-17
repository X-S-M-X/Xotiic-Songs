(() => {
  'use strict';
  const $=id=>document.getElementById(id);const config=window.XOTIIC_ADMIN_CONFIG;
  let publisher=null,review=null,timer=null,busy=false;
  const status=message=>$('recovery-status').textContent=message;
  function lock(){publisher=null;review=null;clearTimeout(timer);$('recovery-password').value='';$('recovery-plan').hidden=true;$('recovery-login').hidden=false;}
  function setBusy(value){busy=value;document.querySelectorAll('button,input').forEach(el=>el.disabled=value);}
  const vault=window.XotiicVault.readVault();if(vault)$('recovery-username').value=vault.username||'';
  $('recovery-login').onsubmit=async event=>{
    event.preventDefault();if(busy)return;setBusy(true);
    try{
      if(!vault)throw new Error('This browser has no admin vault. Set up or unlock Artist Console on your usual browser first.');
      const token=await window.XotiicVault.unlockVault({vault,username:$('recovery-username').value,password:$('recovery-password').value,owner:config.owner,repository:config.repository});
      publisher=new window.XotiicGitHub.GitHubPublisher({token,owner:config.owner,repository:config.repository,branch:config.branch,requiredLogin:config.requiredGitHubLogin,apiVersion:config.githubApiVersion});
      await publisher.verifyOwner();review=await window.XotiicReleasePublisher.read(publisher);
      $('recovery-current').textContent=`GitHub currently selects ${window.XotiicReleaseModel.versions[review.config.activeVersion]}.`;
      $('recovery-login').hidden=true;$('recovery-plan').hidden=false;$('recovery-password').value='';status('Owner verified. Review above before publishing.');timer=setTimeout(lock,5*60*1000);
    }catch(error){lock();status(error.message);}finally{setBusy(false);}
  };
  $('recovery-lock').onclick=()=>{lock();status('Locked.');};
  $('recovery-publish').onclick=async()=>{
    if(busy||!publisher||!review)return;setBusy(true);clearTimeout(timer);
    try{
      const result=await window.XotiicReleasePublisher.publish(publisher,review,{...review.config,activeVersion:'21.0.0'});
      lock();status('GitHub accepted the v21 design selection. Wait for Pages deployment, then reopen the app.');const link=document.createElement('a');link.href=result.url;link.textContent='View recovery commit';$('recovery-status').append(link);
    }catch(error){lock();status(error.message);}finally{setBusy(false);}
  };
  window.addEventListener('pagehide',lock);
})();

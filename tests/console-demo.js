// Development-only fixture. This is excluded from the deployed site.
window.fetch=async()=>{throw Error("Publishing is disabled in the sample preview.");};
document.querySelector("#setup-view").hidden=true;
document.querySelector("#login-view").hidden=true;
document.querySelector("#dashboard-view").hidden=false;
const banner=document.createElement("p");banner.textContent="Sample console preview. GitHub publishing is disabled.";
banner.style.cssText="background:#c7f776;color:#102012;padding:12px;font:14px system-ui;margin:0";
document.body.prepend(banner);
window.XotiicAdmin.selectPanel("artwork");


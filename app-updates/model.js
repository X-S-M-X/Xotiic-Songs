/* Shared release settings. No catalog or device-storage writes. */
((root, factory) => { const api = factory(); if (typeof module === 'object') module.exports = api; else root.XotiicReleaseModel = api; })(globalThis, () => {
  'use strict';
  const versions = Object.freeze({'21.0.0':'v21.0.0 · Original','21.1.0':'v21.1.0 · Anime UI'});
  const defaults = {schema:1,activeVersion:'21.0.0',branding:{logo:'classic',banner:'',position:42},revision:'fallback',updatedAt:''};
  function validate(value) {
    if (!value || value.schema !== 1 || !Object.hasOwn(versions,value.activeVersion)) throw new Error('Unknown app design. Keep the original design and check the installed release.');
    if (!['classic','anime','portrait'].includes(value.branding?.logo)) throw new Error('Invalid logo selection.');
    const banner = value.branding.banner;
    if (banner !== '' && !/^app-updates\/banner\.(png|jpg|webp)$/.test(banner)) throw new Error('Invalid banner path.');
    if (!Number.isFinite(value.branding.position) || value.branding.position < 0 || value.branding.position > 100) throw new Error('Invalid banner position.');
    if (typeof value.revision !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value.revision)) throw new Error('Invalid release revision.');
    return {schema:1,activeVersion:value.activeVersion,branding:{logo:value.branding.logo,banner,position:value.branding.position},revision:value.revision,updatedAt:String(value.updatedAt || '')};
  }
  const revision = () => globalThis.crypto.randomUUID();
  return Object.freeze({versions,defaults,validate,revision});
});

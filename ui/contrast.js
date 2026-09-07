/* Keep custom-colour controls legible without changing the saved palette. */
(() => {
  "use strict";
  const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const parse = (value) => { const m = /^#([\da-f]{6})$/i.exec(value.trim()); return m ? [0,2,4].map((i) => parseInt(m[1].slice(i, i+2), 16)) : null; };
  const palette = (accent, surface) => {
    const rgb = parse(accent) || [181,244,92], bg = parse(surface) || [16,22,18];
    const l = luminance(rgb), ink = (l + .05) / .05 >= 1.05 / (l + .05) ? "#000000" : "#ffffff";
    let link = [...rgb];
    while ((Math.max(luminance(link), luminance(bg)) + .05) / (Math.min(luminance(link), luminance(bg)) + .05) < 4.5 && link.some((v) => v < 255)) link = link.map((v) => Math.min(255, v + 5));
    return {ink, link: `#${link.map((v) => v.toString(16).padStart(2,"0")).join("")}`};
  };
  if (typeof module !== "undefined") module.exports = {palette, luminance};
  if (typeof document === "undefined") return;
  const apply = () => {
    const root = document.documentElement, css = getComputedStyle(root);
    const accent = css.getPropertyValue("--accent").trim() || css.getPropertyValue("--acid").trim() || "#b5f45c";
    const {ink, link} = palette(accent, css.getPropertyValue("--ui-surface"));
    root.style.setProperty("--ui-action-ink", ink); root.style.setProperty("--ui-link", link); root.style.setProperty("--ui-accent", accent);
  };
  new MutationObserver(apply).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme","data-accent"]});
  window.addEventListener("xotiicappearancechange", apply); window.addEventListener("storage", apply); apply();
})();

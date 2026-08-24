(() => {
  "use strict";

  const source = globalThis.XOTIIC_ONLINE_CONFIG || {};
  const validEndpoint = (() => {
    try {
      const url = new URL(String(source.endpoint || ""));
      return url.protocol === "https:" ? url.origin : "";
    } catch {
      return "";
    }
  })();
  const active = source.enabled === true && Boolean(validEndpoint);
  const features = Object.freeze({
    accounts: active && source.features?.accounts === true,
    globalCharts: active && source.features?.globalCharts === true,
    releaseAlerts: active && source.features?.releaseAlerts === true,
  });

  const request = async (path, options = {}) => {
    if (!active) throw new Error("The optional online platform is not connected.");
    const cleanPath = String(path || "").replace(/^\/+/, "");
    const url = new URL(cleanPath, `${validEndpoint}/`);
    if (url.origin !== validEndpoint) throw new Error("The online request target was rejected.");
    const response = await fetch(url, {
      ...options,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`Online platform request failed with status ${response.status}.`);
    return response.status === 204 ? null : response.json();
  };

  globalThis.XotiicOnline = Object.freeze({
    active,
    endpoint: validEndpoint,
    features,
    request,
    status: () => ({ mode: active ? "connected" : "local-only", features: { ...features } }),
  });

  const title = document.querySelector("#online-platform-title");
  const copy = document.querySelector("#online-platform-copy");
  const status = document.querySelector("#online-platform-status");
  const set = (selector, enabled) => {
    const target = document.querySelector(selector);
    if (target) target.textContent = enabled ? "Connected" : "Off";
  };
  if (title) title.textContent = active ? "Online services connected" : "Local-only mode";
  if (copy) copy.textContent = active
    ? "Only the explicitly enabled online services can contact the configured endpoint."
    : "Accounts, global charts, and release alerts are disabled. The player works without a backend.";
  if (status) status.textContent = active ? `CONNECTED TO ${validEndpoint.replace(/^https:\/\//, "").toUpperCase()}` : "NO ENDPOINT CONNECTED";
  set("#online-account-status", features.accounts);
  set("#online-chart-status", features.globalCharts);
  set("#online-alert-status", features.releaseAlerts);
})();

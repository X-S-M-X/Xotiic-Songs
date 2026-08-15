(() => {
  "use strict";

  const STORAGE_KEY = "xotiicduck-appearance-v1";
  const defaults = Object.freeze({ theme: "classic", accent: "pulse", motion: "system" });
  const validThemes = new Set(["anime", "classic"]);
  const validAccents = new Set(["pulse", "sakura", "aqua"]);
  const validMotion = new Set(["system", "full", "reduced"]);

  const sanitize = (value = {}) => ({
    theme: validThemes.has(value.theme) ? value.theme : defaults.theme,
    accent: validAccents.has(value.accent) ? value.accent : defaults.accent,
    motion: validMotion.has(value.motion) ? value.motion : defaults.motion,
  });

  const read = () => {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return { ...defaults };
    }
  };

  const apply = (value, { persist = false, announce = false } = {}) => {
    const settings = sanitize(value);
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.accent = settings.accent;
    root.dataset.motion = settings.motion;

    const themeColor = settings.theme === "classic" ? "#050705" : "#08050f";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Appearance still applies for this visit. */ }
    }

    if (announce) window.dispatchEvent(new CustomEvent("xotiicappearancechange", { detail: settings }));
    return settings;
  };

  const current = apply(read());
  window.XotiicAppearance = { STORAGE_KEY, defaults, sanitize, read, apply, current };
})();

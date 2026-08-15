(() => {
  "use strict";

  const STORAGE_KEY = "xotiicduck-appearance-v1";
  const defaults = Object.freeze({ theme: "classic", accent: "pulse", motion: "system" });
  const validThemes = new Set(["classic", "anime"]);
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

  const apply = (value) => {
    const settings = sanitize(value);
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.accent = settings.accent;
    root.dataset.motion = settings.motion;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", settings.theme === "classic" ? "#050705" : "#08050f");
    return settings;
  };

  let current = apply(read());
  const sync = () => { current = apply(read()); return current; };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) sync();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sync();
  });

  window.XotiicAdminAppearance = { STORAGE_KEY, defaults, sanitize, read, apply, sync, current };
})();

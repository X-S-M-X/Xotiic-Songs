(() => {
  "use strict";

  const STORAGE_KEY = "xotiicduck-appearance-v1";
  const defaults = Object.freeze({
    theme: "classic",
    accent: "pulse",
    motion: "system",
    primary: "#c8ff55",
    secondary: "#8b62ff",
  });
  const validThemes = new Set(["classic", "anime"]);
  const validAccents = new Set(["pulse", "sakura", "aqua", "ember", "royal", "void", "custom"]);
  const validMotion = new Set(["system", "full", "reduced"]);
  const validHex = /^#[0-9a-f]{6}$/i;

  const sanitizeHex = (value, fallback) => validHex.test(String(value || ""))
    ? String(value).toLowerCase()
    : fallback;

  const hexToRgb = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };

  const rgbToHex = (channels) => `#${channels
    .map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0"))
    .join("")}`;

  const mixHex = (first, second, amount = 0.5) => {
    const left = hexToRgb(first);
    const right = hexToRgb(second);
    return rgbToHex(left.map((channel, index) => channel + ((right[index] - channel) * amount)));
  };

  const contrastColor = (hex) => {
    const [red, green, blue] = hexToRgb(hex).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) > 0.42 ? "#071006" : "#ffffff";
  };

  const sanitize = (value = {}) => ({
    theme: validThemes.has(value.theme) ? value.theme : defaults.theme,
    accent: validAccents.has(value.accent) ? value.accent : defaults.accent,
    motion: validMotion.has(value.motion) ? value.motion : defaults.motion,
    primary: sanitizeHex(value.primary, defaults.primary),
    secondary: sanitizeHex(value.secondary, defaults.secondary),
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
    const third = mixHex(settings.primary, settings.secondary, 0.48);
    root.style.setProperty("--admin-custom-primary", settings.primary);
    root.style.setProperty("--admin-custom-primary-rgb", hexToRgb(settings.primary).join(", "));
    root.style.setProperty("--admin-custom-secondary", settings.secondary);
    root.style.setProperty("--admin-custom-secondary-rgb", hexToRgb(settings.secondary).join(", "));
    root.style.setProperty("--admin-custom-third", third);
    root.style.setProperty("--admin-custom-soft", mixHex(settings.primary, "#ffffff", 0.48));
    root.style.setProperty("--admin-custom-on", contrastColor(settings.primary));
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

(() => {
  "use strict";

  const extension = (file) => {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    if (name.endsWith(".wav")) return "wav";
    if (name.endsWith(".mp3")) return "mp3";
    if (["audio/wav", "audio/x-wav", "audio/wave"].includes(type)) return "wav";
    if (type === "audio/mpeg") return "mp3";
    return "";
  };

  const label = (file) => extension(file).toUpperCase() || "audio";
  const isSupported = (file) => Boolean(extension(file));
  const path = (releaseId, file) => {
    const format = extension(file);
    if (!format || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(releaseId || ""))) return "";
    return `music/${releaseId}.${format}`;
  };

  window.XotiicAudioFiles = Object.freeze({ extension, isSupported, label, path });
})();

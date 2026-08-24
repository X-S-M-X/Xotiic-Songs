(() => {
  "use strict";

  const player = globalThis.XotiicPlayer;
  const audio = document.querySelector("#audio");
  const layer = document.querySelector("#devices-layer");
  if (!player || !audio || !layer) return;

  const $ = (selector) => document.querySelector(selector);
  const remote = audio.remote;
  const supportsRemote = Boolean(remote && typeof remote.prompt === "function");
  const supportsAirPlay = typeof audio.webkitShowPlaybackTargetPicker === "function";
  let available = false;
  let availabilityWatchId = null;

  audio.disableRemotePlayback = false;

  const publicUrl = () => {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/index\.html$/i, "");
    return url.href;
  };

  const update = () => {
    const connected = remote?.state === "connected" || audio.webkitCurrentPlaybackTargetIsWireless === true;
    const connecting = remote?.state === "connecting";
    const title = $("#device-picker-title");
    const copy = $("#device-picker-copy");
    const button = $("#device-picker-button");
    if (connected) {
      title.textContent = "Playing on a connected device";
      copy.textContent = "Playback controls remain available in XotiicDuck Music.";
      button.textContent = "Change or disconnect";
    } else if (connecting) {
      title.textContent = "Connecting to device";
      copy.textContent = "Keep this player open while the browser completes the connection.";
      button.textContent = "Connecting";
    } else if (supportsRemote) {
      title.textContent = available ? "A playback device is available" : "Browser device picker ready";
      copy.textContent = available ? "Choose the nearby target you want to use." : "Your browser will show compatible targets if it finds any.";
      button.textContent = "Choose a device";
    } else if (supportsAirPlay) {
      title.textContent = "AirPlay picker ready";
      copy.textContent = "Safari can show nearby AirPlay playback targets.";
      button.textContent = "Choose AirPlay device";
    } else {
      title.textContent = "No in-page device picker here";
      copy.textContent = "Use the browser menu, your operating system media output, or open the player URL on the other device.";
      button.textContent = "Show fallback options";
    }
    button.disabled = connecting;
    $("#now-playing-devices").classList.toggle("is-connected", connected);
    $("#now-playing-devices-label").textContent = connected ? "Connected" : "Devices";
  };

  const open = () => {
    $("#device-player-url").textContent = publicUrl();
    layer.hidden = false;
    document.body.classList.add("modal-open");
    update();
    requestAnimationFrame(() => $("#device-picker-button").focus());
  };

  const prompt = async () => {
    if (supportsRemote) {
      try {
        await remote.prompt();
      } catch (error) {
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") player.showToast("The browser could not open its device picker.");
      }
      update();
      return;
    }
    if (supportsAirPlay) {
      try { audio.webkitShowPlaybackTargetPicker(); } catch { player.showToast("AirPlay could not open from this browser."); }
      return;
    }
    player.showToast("Use the copied player link or your device's audio-output menu.");
    $("#device-copy-link").focus();
  };

  $("#now-playing-devices")?.addEventListener("click", open);
  $("#device-picker-button")?.addEventListener("click", prompt);
  $("#device-copy-link")?.addEventListener("click", async () => {
    const value = publicUrl();
    try {
      await navigator.clipboard.writeText(value);
      player.showToast("Player link copied.");
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      player.showToast("Player link copied.");
    }
  });

  for (const eventName of ["connecting", "connect", "disconnect"]) remote?.addEventListener?.(eventName, update);
  audio.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", update);
  if (supportsRemote && typeof remote.watchAvailability === "function") {
    remote.watchAvailability((value) => { available = Boolean(value); update(); })
      .then((id) => { availabilityWatchId = id; })
      .catch(() => undefined);
  }
  window.addEventListener("beforeunload", () => {
    if (availabilityWatchId === null) return;
    try {
      const cancellation = remote?.cancelWatchAvailability?.(availabilityWatchId);
      cancellation?.catch?.(() => undefined);
    } catch { /* The browser is already closing. */ }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !layer.hidden) {
      layer.hidden = true;
      document.body.classList.remove("modal-open");
      $("#now-playing-devices")?.focus();
    }
  });

  $("#device-player-url").textContent = publicUrl();
  update();
})();

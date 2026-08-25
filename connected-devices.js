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
  const supportsShare = typeof navigator.share === "function";
  let available = null;
  let availabilityWatchId = null;
  let copyResetTimer = 0;

  audio.disableRemotePlayback = false;

  const publicUrl = () => {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/index\.html$/i, "");
    return url.href;
  };

  const setPickerState = ({ state, badge, title, copy, action, disabled = false }) => {
    $("#device-status-card").dataset.state = state;
    $("#device-support-badge").lastChild.textContent = badge;
    $("#device-picker-title").textContent = title;
    $("#device-picker-copy").textContent = copy;
    const button = $("#device-picker-button");
    button.querySelector("span").textContent = action;
    button.disabled = disabled;
  };

  const update = () => {
    const connected = remote?.state === "connected" || audio.webkitCurrentPlaybackTargetIsWireless === true;
    const connecting = remote?.state === "connecting";

    if (connected) {
      setPickerState({
        state: "connected",
        badge: "CONNECTED",
        title: "Playing on another device",
        copy: "This player remains your controller. Use the button to change the target.",
        action: "Change playback device",
        disabled: !(supportsRemote || supportsAirPlay),
      });
    } else if (connecting) {
      setPickerState({
        state: "connecting",
        badge: "CONNECTING",
        title: "Connecting to your device",
        copy: "Keep XotiicDuck open while the browser completes the connection.",
        action: "Connecting",
        disabled: true,
      });
    } else if (supportsRemote && available === true) {
      setPickerState({
        state: "available",
        badge: "DEVICE FOUND",
        title: "A compatible player is nearby",
        copy: "Open the browser picker and choose where to send this song.",
        action: "Choose playback device",
      });
    } else if (supportsRemote && available === false) {
      setPickerState({
        state: "unavailable",
        badge: "NONE FOUND",
        title: "No compatible target found",
        copy: "Keep both devices on the same network, or use Share or Copy link below.",
        action: "No devices available",
        disabled: true,
      });
    } else if (supportsRemote) {
      setPickerState({
        state: "supported",
        badge: "SUPPORTED",
        title: "Browser device picker available",
        copy: "Your browser will decide which compatible playback targets it can show.",
        action: "Open device picker",
      });
    } else if (supportsAirPlay) {
      setPickerState({
        state: "supported",
        badge: "AIRPLAY READY",
        title: "AirPlay picker available",
        copy: "Safari can show nearby AirPlay targets from this button.",
        action: "Choose AirPlay device",
      });
    } else {
      setPickerState({
        state: "unsupported",
        badge: "LINK MODE",
        title: "Direct picker unavailable here",
        copy: "This browser cannot open a wireless player list. Share or copy the player link instead.",
        action: "Picker unavailable",
        disabled: true,
      });
    }

    $("#now-playing-devices").classList.toggle("is-connected", connected);
    $("#now-playing-devices-label").textContent = connected ? "Connected" : "Devices";
  };

  const copyLink = async () => {
    const value = publicUrl();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("Copy is unavailable");
    }

    const label = $("#device-copy-link strong");
    label.textContent = "Link copied";
    clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => { label.textContent = "Copy player link"; }, 1800);
    player.showToast("Player link copied.");
  };

  const prompt = async () => {
    if (supportsRemote) {
      try {
        await remote.prompt();
      } catch (error) {
        if (error?.name === "AbortError" || error?.name === "NotAllowedError") return;
        player.showToast(error?.name === "InvalidStateError"
          ? "No compatible playback device is available."
          : "The browser could not open its device picker.");
      } finally {
        update();
      }
      return;
    }

    if (supportsAirPlay) {
      try { audio.webkitShowPlaybackTargetPicker(); }
      catch { player.showToast("AirPlay could not open from this browser."); }
    }
  };

  const shareLink = async () => {
    if (!supportsShare) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "XotiicDuck Music",
        text: "Open the XotiicDuck Music player on this device.",
        url: publicUrl(),
      });
    } catch (error) {
      if (error?.name !== "AbortError") player.showToast("Sharing is unavailable. Use Copy player link instead.");
    }
  };

  document.addEventListener("xotiic:devicesopen", () => {
    $("#device-player-url").textContent = publicUrl().replace(/^https?:\/\//, "");
    $("#device-share-link").hidden = !supportsShare;
    $(".device-link-actions").classList.toggle("single-action", !supportsShare);
    update();
  });
  $("#device-picker-button")?.addEventListener("click", prompt);
  $("#device-share-link")?.addEventListener("click", shareLink);
  $("#device-copy-link")?.addEventListener("click", () => {
    copyLink().catch(() => player.showToast("Copy is blocked here. Select the address manually."));
  });

  for (const eventName of ["connecting", "connect", "disconnect"]) remote?.addEventListener?.(eventName, update);
  audio.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", update);

  if (supportsRemote && typeof remote.watchAvailability === "function") {
    remote.watchAvailability((value) => {
      available = Boolean(value);
      update();
    }).then((id) => {
      availabilityWatchId = id;
    }).catch(() => {
      available = null;
      update();
    });
  }

  window.addEventListener("beforeunload", () => {
    if (availabilityWatchId === null) return;
    try {
      const cancellation = remote?.cancelWatchAvailability?.(availabilityWatchId);
      cancellation?.catch?.(() => undefined);
    } catch { /* The browser is already closing. */ }
  });

  $("#device-player-url").textContent = publicUrl().replace(/^https?:\/\//, "");
  $("#device-share-link").hidden = !supportsShare;
  $(".device-link-actions").classList.toggle("single-action", !supportsShare);
  update();
})();

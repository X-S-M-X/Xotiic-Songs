(() => {
  "use strict";

  const player = globalThis.XotiicPlayer;
  const offline = globalThis.XotiicOffline;
  const status = document.querySelector("#health-storage-status");
  if (!player || !offline || !status) return;

  const $ = (selector) => document.querySelector(selector);
  const buttons = [$("#health-verify"), $("#health-cleanup"), $("#health-persist")].filter(Boolean);
  let busy = false;

  const setBusy = (value, message = "") => {
    busy = value;
    buttons.forEach((button) => { button.disabled = value; });
    status.classList.toggle("is-busy", value);
    status.textContent = message;
  };

  const verify = async () => {
    if (busy) return;
    setBusy(true, "Reading saved MP3s and cover checksums. Keep this window open.");
    try {
      const result = await offline.audit(player.getTracks(), { deep: true });
      $("#health-integrity").textContent = result.damaged
        ? `${result.damaged} need attention`
        : result.checked ? `${result.healthy} verified` : "No saved songs";
      status.textContent = result.damaged
        ? `${result.damaged} saved release${result.damaged === 1 ? "" : "s"} are incomplete. Remove and download them again from Offline.`
        : result.checked ? `All ${result.checked} saved release${result.checked === 1 ? "" : "s"} passed the integrity check.` : "There are no offline files to verify.";
      if (result.damaged) player.showToast("Some offline files need to be downloaded again.");
      else player.showToast(result.checked ? "Offline files verified." : "No offline files to verify.");
    } catch {
      $("#health-integrity").textContent = "Check failed";
      status.textContent = "The browser could not finish the storage check. Your public catalog was not changed.";
    } finally {
      setBusy(false, status.textContent);
    }
  };

  const cleanup = async () => {
    if (busy) return;
    setBusy(true, "Removing superseded and orphaned cache files.");
    try {
      const result = await offline.cleanup(player.getTracks());
      await player.refreshOffline();
      const freed = player.formatBytes(result.bytes);
      status.textContent = result.removed
        ? `Removed ${result.removed} old cache file${result.removed === 1 ? "" : "s"}, about ${freed}. Current offline songs were kept.`
        : "No old cache files needed cleanup.";
      $("#health-integrity").textContent = result.valid.length ? "Quick check passed" : "No saved songs";
      player.showToast(result.removed ? "Old offline cache files cleaned." : "Offline cache is already clean.");
    } catch {
      status.textContent = "Cache cleanup could not finish. Try again after reopening the player.";
    } finally {
      setBusy(false, status.textContent);
    }
  };

  const persist = async () => {
    if (busy) return;
    setBusy(true, "Requesting protected browser storage.");
    try {
      const granted = await offline.requestPersistence();
      status.textContent = granted
        ? "Protected storage is active. The browser is less likely to remove offline songs automatically."
        : "This browser kept storage under automatic management. Offline downloads still work, but the device may clear them when space is low.";
      player.showToast(granted ? "Protected storage is active." : "The browser will continue managing storage.");
    } catch {
      status.textContent = "This browser does not offer a protected-storage request.";
    } finally {
      setBusy(false, status.textContent);
    }
  };

  $("#health-verify")?.addEventListener("click", verify);
  $("#health-cleanup")?.addEventListener("click", cleanup);
  $("#health-persist")?.addEventListener("click", persist);
})();

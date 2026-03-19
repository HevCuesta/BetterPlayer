/* content.js — Main content script: DOM detection, SPA handling, orchestration */

(function () {
  "use strict";

  let playerEl = null;
  let currentTrackUrl = null;
  let currentTrackId = null;

  // --- Player bar detection ---

  function findPlayer() {
    return (
      document.querySelector(".playControls") ||
      document.querySelector('section[class*="playControl"]') ||
      document.querySelector(".bottomBar") ||
      document.querySelector('[class*="player"]')
    );
  }

  function getTrackLink() {
    if (!playerEl) return null;
    const link =
      playerEl.querySelector(".playbackSoundBadge__titleLink") ||
      playerEl.querySelector('a[href*="/"][class*="soundTitle"]') ||
      playerEl.querySelector("a[href]");
    if (link) {
      const href = link.getAttribute("href");
      if (href && href.startsWith("/")) {
        return "https://soundcloud.com" + href.split("?")[0];
      }
    }
    return null;
  }

  async function resolveCurrentTrack() {
    const url = getTrackLink();
    if (!url || url === currentTrackUrl) return currentTrackId;

    currentTrackUrl = url;
    try {
      const result = await BPApi.resolveTrack(url);
      if (result.track && result.track.id) {
        currentTrackId = result.track.id;
        return currentTrackId;
      }
    } catch (e) {
      console.warn("[BetterPlayer] Track resolve failed:", e);
    }
    return null;
  }

  // --- Player event binding ---

  function bindPlayerEvents() {
    if (!playerEl) return;
    if (playerEl._bpBound) return;
    playerEl._bpBound = true;

    // Hover events (used by hover mode, ignored by others)
    playerEl.addEventListener("mouseenter", async () => {
      if (BPPanel.getTriggerMode() !== "hover") return;
      const trackId = await resolveCurrentTrack();
      if (trackId) BPPanel.show(trackId);
    });

    playerEl.addEventListener("mouseleave", () => {
      if (BPPanel.getTriggerMode() !== "hover") return;
      BPPanel.scheduleHide();
    });

  }

  // --- Pinned mode: auto-show when track is playing ---

  async function checkPinnedMode() {
    if (BPPanel.getTriggerMode() !== "pinned") return;
    const trackId = await resolveCurrentTrack();
    if (trackId) BPPanel.show(trackId);
  }

  // --- MutationObserver for track changes ---

  function observePlayerChanges() {
    if (!playerEl) return;

    const observer = new MutationObserver(() => {
      const newUrl = getTrackLink();
      if (newUrl && newUrl !== currentTrackUrl) {
        resolveCurrentTrack().then((trackId) => {
          if (trackId) {
            // Update panel if visible or pinned
            if (
              BPPanel.isVisible() ||
              BPPanel.getTriggerMode() === "pinned"
            ) {
              BPPanel.show(trackId);
            }
          }
        });
      }
    });

    observer.observe(playerEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // --- Initialization ---

  function initPlayer() {
    playerEl = findPlayer();
    if (!playerEl) return false;
    bindPlayerEvents();
    observePlayerChanges();
    // If pinned, show immediately
    checkPinnedMode();
    return true;
  }

  async function init() {
    // Apply saved position
    await BPPosition.init();

    // Load settings
    const data = await browser.storage.local.get([
      "bpPanelEnabled",
      "bpSections",
      "bpTriggerMode",
    ]);
    if (data.bpPanelEnabled === false) BPPanel.setEnabled(false);
    if (data.bpSections) BPPanel.setSections(data.bpSections);
    if (data.bpTriggerMode) BPPanel.setTriggerMode(data.bpTriggerMode);

    // Try to find player immediately
    if (!initPlayer()) {
      const bodyObserver = new MutationObserver(() => {
        if (initPlayer()) {
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // --- Message handling from background / popup ---

  browser.runtime.onMessage.addListener((msg) => {
    switch (msg.action) {
      case "positionChanged":
        BPPosition.apply(msg.position);
        break;
      case "settingsChanged":
        if (msg.panelEnabled !== undefined)
          BPPanel.setEnabled(msg.panelEnabled);
        if (msg.sections) BPPanel.setSections(msg.sections);
        if (msg.triggerMode) {
          BPPanel.setTriggerMode(msg.triggerMode);
          // If switching to pinned, show immediately
          if (msg.triggerMode === "pinned") checkPinnedMode();
        }
        break;
      case "navigationChanged":
        BPPanel.clearCache();
        currentTrackUrl = null;
        currentTrackId = null;
        if (!playerEl || !document.body.contains(playerEl)) {
          playerEl = null;
          initPlayer();
        }
        break;
    }
  });

  // Also listen for popstate (SPA back/forward)
  window.addEventListener("popstate", () => {
    BPPanel.clearCache();
    currentTrackUrl = null;
    currentTrackId = null;
  });

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

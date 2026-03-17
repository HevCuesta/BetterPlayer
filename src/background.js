/* background.js — Client ID extraction, API proxying, navigation relay */

(function () {
  "use strict";

  let clientId = null;

  // Restore cached client_id on startup
  browser.storage.local.get("clientId").then((data) => {
    if (data.clientId) clientId = data.clientId;
  });

  // --- Client ID extraction via webRequest ---

  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      try {
        const url = new URL(details.url);
        const id = url.searchParams.get("client_id");
        if (id && id !== clientId) {
          clientId = id;
          browser.storage.local.set({ clientId: id });
        }
      } catch (_) {
        // ignore malformed URLs
      }
    },
    { urls: ["*://api-v2.soundcloud.com/*"] }
  );

  // --- API helpers ---

  async function ensureClientId() {
    if (clientId) return clientId;
    const data = await browser.storage.local.get("clientId");
    if (data.clientId) {
      clientId = data.clientId;
      return clientId;
    }
    return null;
  }

  async function apiFetch(endpoint, params = {}) {
    const cid = await ensureClientId();
    if (!cid) throw new Error("client_id not available yet");
    const url = new URL(`https://api-v2.soundcloud.com${endpoint}`);
    url.searchParams.set("client_id", cid);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`API ${res.status}: ${endpoint}`);
    return res.json();
  }

  async function resolveTrack(trackUrl) {
    return apiFetch("/resolve", { url: trackUrl });
  }

  async function fetchTrackData(trackId) {
    return apiFetch(`/tracks/${trackId}`);
  }

  async function fetchComments(trackId) {
    return apiFetch(`/tracks/${trackId}/comments`, {
      threaded: "0",
      filter_replies: "0",
      limit: "200",
      sort: "timestamp",
    });
  }

  // --- Waveform fetch (routed through background to bypass page CSP) ---

  async function fetchWaveform(waveformUrl) {
    const jsonUrl = waveformUrl.replace(/\.png$/, ".json");
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`Waveform fetch failed: ${res.status}`);
    return res.json();
  }

  // --- Message handler ---

  browser.runtime.onMessage.addListener((msg, sender) => {
    switch (msg.action) {
      case "getClientId":
        return ensureClientId().then((id) => ({ clientId: id }));

      case "resolveTrack":
        return resolveTrack(msg.trackUrl)
          .then((track) => ({ track }))
          .catch((e) => ({ error: e.message }));

      case "fetchTrackData":
        return fetchTrackData(msg.trackId)
          .then((track) => ({ track }))
          .catch((e) => ({ error: e.message }));

      case "fetchComments":
        return fetchComments(msg.trackId)
          .then((data) => ({ comments: data.collection || [] }))
          .catch((e) => ({ error: e.message }));

      case "fetchWaveform":
        return fetchWaveform(msg.waveformUrl)
          .then((data) => ({ samples: data.samples || [] }))
          .catch((e) => ({ error: e.message }));

      case "positionChanged":
      case "settingsChanged":
        // Relay to all SoundCloud content scripts
        return browser.tabs
          .query({ url: "*://soundcloud.com/*" })
          .then((tabs) => {
            for (const tab of tabs) {
              browser.tabs.sendMessage(tab.id, msg).catch(() => {});
            }
            return { ok: true };
          });

      default:
        return Promise.resolve({ error: "unknown action" });
    }
  });

  // --- SPA navigation relay ---

  browser.webNavigation.onHistoryStateUpdated.addListener(
    (details) => {
      if (details.frameId === 0) {
        browser.tabs
          .sendMessage(details.tabId, {
            action: "navigationChanged",
            url: details.url,
          })
          .catch(() => {});
      }
    },
    { url: [{ hostContains: "soundcloud.com" }] }
  );
})();

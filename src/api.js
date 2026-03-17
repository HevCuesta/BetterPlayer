/* api.js — Content-side helpers to talk to background script */

// eslint-disable-next-line no-var
var BPApi = (function () {
  "use strict";

  function send(msg) {
    return browser.runtime.sendMessage(msg);
  }

  return {
    getClientId() {
      return send({ action: "getClientId" }).then((r) => r.clientId);
    },

    resolveTrack(trackUrl) {
      return send({ action: "resolveTrack", trackUrl });
    },

    fetchTrackData(trackId) {
      return send({ action: "fetchTrackData", trackId: String(trackId) });
    },

    fetchComments(trackId) {
      return send({ action: "fetchComments", trackId: String(trackId) });
    },

    fetchWaveform(waveformUrl) {
      return send({ action: "fetchWaveform", waveformUrl });
    },
  };
})();

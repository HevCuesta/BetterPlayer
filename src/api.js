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

    likeTrack(trackId) {
      return send({ action: "likeTrack", trackId: String(trackId) });
    },

    unlikeTrack(trackId) {
      return send({ action: "unlikeTrack", trackId: String(trackId) });
    },

    repostTrack(trackId) {
      return send({ action: "repostTrack", trackId: String(trackId) });
    },

    unrepostTrack(trackId) {
      return send({ action: "unrepostTrack", trackId: String(trackId) });
    },

    followUser(userId) {
      return send({ action: "followUser", userId: String(userId) });
    },

    unfollowUser(userId) {
      return send({ action: "unfollowUser", userId: String(userId) });
    },

    checkLikeStatus(trackId) {
      return send({ action: "checkLikeStatus", trackId: String(trackId) });
    },

    checkRepostStatus(trackId) {
      return send({ action: "checkRepostStatus", trackId: String(trackId) });
    },

    checkFollowStatus(userId) {
      return send({ action: "checkFollowStatus", userId: String(userId) });
    },
  };
})();

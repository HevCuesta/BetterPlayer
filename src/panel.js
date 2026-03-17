/* panel.js — Hover panel UI: waveform + comments + track info */

// eslint-disable-next-line no-var
var BPPanel = (function () {
  "use strict";

  let panelEl = null;
  let waveformRenderer = null;
  let currentTrackId = null;
  let trackCache = {}; // { [trackId]: { track, comments, samples } }
  let hideTimeout = null;
  let progressRAF = null;
  let enabled = true;
  let triggerMode = "hover"; // "hover" | "click" | "pinned"
  let sections = { waveform: true, comments: true, info: true };

  // --- DOM creation ---

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "bp-panel";
    panel.innerHTML = `
      <div class="bp-panel-inner">
        <section class="bp-section bp-waveform-section">
          <canvas class="bp-waveform-canvas"></canvas>
        </section>
        <section class="bp-section bp-comments-section">
          <h3 class="bp-section-title">Timed Comments</h3>
          <div class="bp-comments-list"></div>
        </section>
        <section class="bp-section bp-info-section">
          <div class="bp-track-info"></div>
        </section>
      </div>
    `;
    document.body.appendChild(panel);

    // Hover keep-alive on panel itself (only relevant in hover mode)
    panel.addEventListener("mouseenter", () => {
      if (triggerMode === "hover") clearHideTimeout();
    });
    panel.addEventListener("mouseleave", () => {
      if (triggerMode === "hover") scheduleHide();
    });

    return panel;
  }

  function ensurePanel() {
    if (!panelEl) {
      panelEl = createPanel();
      const canvas = panelEl.querySelector(".bp-waveform-canvas");
      waveformRenderer = BPWaveform.create(canvas);
      waveformRenderer.setOnSeek(seekTo);
    }
    applySectionVisibility();
    return panelEl;
  }

  function applySectionVisibility() {
    if (!panelEl) return;
    panelEl
      .querySelector(".bp-waveform-section")
      .classList.toggle("bp-hidden", !sections.waveform);
    panelEl
      .querySelector(".bp-comments-section")
      .classList.toggle("bp-hidden", !sections.comments);
    panelEl
      .querySelector(".bp-info-section")
      .classList.toggle("bp-hidden", !sections.info);
  }

  // --- Data loading ---

  async function loadTrackData(trackId) {
    if (trackCache[trackId]) return trackCache[trackId];

    const [trackRes, commentsRes] = await Promise.all([
      BPApi.fetchTrackData(trackId),
      BPApi.fetchComments(trackId),
    ]);

    if (trackRes.error) throw new Error(trackRes.error);

    const cached = {
      track: trackRes.track,
      comments: (commentsRes.comments || []).sort(
        (a, b) => a.timestamp - b.timestamp
      ),
      samples: null,
    };

    // Fetch waveform samples
    if (cached.track.waveform_url) {
      try {
        cached.samples = await BPWaveform.fetchSamples(
          cached.track.waveform_url
        );
      } catch (_) {
        cached.samples = [];
      }
    }

    trackCache[trackId] = cached;
    return cached;
  }

  // --- Rendering ---

  function renderTrackInfo(track) {
    const info = panelEl.querySelector(".bp-track-info");
    const desc = track.description
      ? `<p class="bp-track-desc">${escapeHtml(track.description).substring(0, 500)}</p>`
      : "";
    const tags = track.tag_list
      ? `<div class="bp-track-tags">${escapeHtml(track.tag_list)}</div>`
      : "";
    const genre = track.genre
      ? `<span class="bp-stat">Genre: ${escapeHtml(track.genre)}</span>`
      : "";

    info.innerHTML = `
      <div class="bp-track-header">
        ${track.artwork_url ? `<img class="bp-track-artwork" src="${track.artwork_url.replace("-large", "-t200x200")}" alt="">` : ""}
        <div class="bp-track-meta">
          <div class="bp-track-title">${escapeHtml(track.title || "")}</div>
          <div class="bp-track-artist">${escapeHtml(track.user?.username || "")}</div>
          <div class="bp-track-stats">
            <span class="bp-stat">${formatCount(track.playback_count)} plays</span>
            <span class="bp-stat">${formatCount(track.likes_count)} likes</span>
            <span class="bp-stat">${formatCount(track.reposts_count)} reposts</span>
            ${genre}
          </div>
        </div>
      </div>
      ${desc}
      ${tags}
    `;
  }

  function renderComments(comments) {
    const list = panelEl.querySelector(".bp-comments-list");
    if (!comments.length) {
      list.innerHTML = '<div class="bp-no-comments">No comments yet</div>';
      return;
    }

    list.innerHTML = comments
      .map(
        (c) => `
      <div class="bp-comment" data-ts="${c.timestamp}">
        <img class="bp-comment-avatar" src="${c.user?.avatar_url || ""}" alt="">
        <div class="bp-comment-body">
          <span class="bp-comment-user">${escapeHtml(c.user?.username || "")}</span>
          <span class="bp-comment-time">${formatTimestamp(c.timestamp)}</span>
          <span class="bp-comment-text">${escapeHtml(c.body || "")}</span>
        </div>
      </div>
    `
      )
      .join("");

    // Click to seek
    list.querySelectorAll(".bp-comment").forEach((el) => {
      el.addEventListener("click", () => {
        const ms = parseInt(el.dataset.ts, 10);
        if (!isNaN(ms)) seekTo(ms / 1000);
      });
    });
  }

  function highlightComments(currentMs) {
    if (!panelEl) return;
    const comments = panelEl.querySelectorAll(".bp-comment");
    let nearestEl = null;
    let nearestDiff = Infinity;

    comments.forEach((el) => {
      const ts = parseInt(el.dataset.ts, 10);
      el.classList.remove("bp-comment-active");
      const diff = Math.abs(ts - currentMs);
      if (ts <= currentMs + 3000 && diff < nearestDiff) {
        nearestDiff = diff;
        nearestEl = el;
      }
    });

    if (nearestEl && nearestDiff < 5000) {
      nearestEl.classList.add("bp-comment-active");
      nearestEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  // --- Playback progress sync ---

  function getAudioElement() {
    return document.querySelector("audio");
  }

  function getPlayerProgress() {
    const audio = getAudioElement();
    if (audio && audio.duration) {
      return {
        current: audio.currentTime,
        duration: audio.duration,
        fraction: audio.currentTime / audio.duration,
      };
    }
    // Fallback: read from progress bar element
    const bar = document.querySelector(".playbackTimeline__progressWrapper");
    if (bar) {
      const inner = bar.querySelector('[role="progressbar"]');
      if (inner) {
        const val = parseFloat(inner.getAttribute("aria-valuenow") || 0);
        const max = parseFloat(inner.getAttribute("aria-valuemax") || 1);
        return { current: val, duration: max, fraction: max ? val / max : 0 };
      }
    }
    return null;
  }

  function startProgressSync() {
    stopProgressSync();
    function tick() {
      const p = getPlayerProgress();
      if (p && waveformRenderer) {
        waveformRenderer.setProgress(p.fraction);
        waveformRenderer.setDuration(p.duration);
        highlightComments(p.current * 1000);
      }
      progressRAF = requestAnimationFrame(tick);
    }
    progressRAF = requestAnimationFrame(tick);
  }

  function stopProgressSync() {
    if (progressRAF) {
      cancelAnimationFrame(progressRAF);
      progressRAF = null;
    }
  }

  // --- Seek ---

  function seekTo(seconds) {
    const audio = getAudioElement();
    if (audio) {
      audio.currentTime = seconds;
      return;
    }
    // Fallback: simulate click on the progress bar
    const bar = document.querySelector(
      ".playbackTimeline__progressWrapper .playbackTimeline__progressBackground"
    );
    if (bar) {
      const rect = bar.getBoundingClientRect();
      const p = getPlayerProgress();
      if (p && p.duration) {
        const frac = seconds / p.duration;
        const x = rect.left + frac * rect.width;
        const y = rect.top + rect.height / 2;
        bar.dispatchEvent(
          new MouseEvent("click", { clientX: x, clientY: y, bubbles: true })
        );
      }
    }
  }

  // --- Show / Hide / Toggle ---

  function isVisible() {
    return panelEl && panelEl.classList.contains("bp-panel-visible");
  }

  function clearHideTimeout() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }

  function scheduleHide() {
    if (triggerMode === "pinned") return;
    clearHideTimeout();
    hideTimeout = setTimeout(() => {
      hide();
    }, 300);
  }

  async function show(trackId) {
    if (!enabled) return;
    clearHideTimeout();
    ensurePanel();

    panelEl.classList.add("bp-panel-visible");

    if (trackId && trackId !== currentTrackId) {
      currentTrackId = trackId;
      panelEl.classList.add("bp-panel-loading");

      try {
        const data = await loadTrackData(trackId);

        // Only render if still the current track
        if (currentTrackId !== trackId) return;

        if (data.samples && waveformRenderer) {
          waveformRenderer.setSamples(data.samples);
          waveformRenderer.setCommentTimestamps(
            data.comments.map((c) => c.timestamp)
          );
          if (data.track.duration) {
            waveformRenderer.setDuration(data.track.duration / 1000);
          }
        }

        renderTrackInfo(data.track);
        renderComments(data.comments);
      } catch (e) {
        console.warn("[BetterPlayer] Failed to load track data:", e);
      }

      panelEl.classList.remove("bp-panel-loading");
    }

    startProgressSync();
  }

  function hide() {
    if (triggerMode === "pinned") return;
    if (panelEl) {
      panelEl.classList.remove("bp-panel-visible");
    }
    stopProgressSync();
  }

  /** Toggle panel visibility (for click mode) */
  function toggle(trackId) {
    if (isVisible()) {
      if (panelEl) panelEl.classList.remove("bp-panel-visible");
      stopProgressSync();
    } else {
      show(trackId);
    }
  }

  function clearCache() {
    trackCache = {};
    currentTrackId = null;
  }

  function setEnabled(val) {
    enabled = val;
    if (!val) {
      if (panelEl) panelEl.classList.remove("bp-panel-visible");
      stopProgressSync();
    }
  }

  function setTriggerMode(mode) {
    if (!["hover", "click", "pinned"].includes(mode)) mode = "hover";
    triggerMode = mode;
    // If switching away from pinned, hide panel
    if (mode !== "pinned" && isVisible()) {
      if (panelEl) panelEl.classList.remove("bp-panel-visible");
      stopProgressSync();
    }
  }

  function getTriggerMode() {
    return triggerMode;
  }

  function setSections(s) {
    Object.assign(sections, s);
    applySectionVisibility();
  }

  // --- Utilities ---

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function formatTimestamp(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function formatCount(n) {
    if (!n) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }

  return {
    show,
    hide,
    toggle,
    isVisible,
    scheduleHide,
    clearHideTimeout,
    clearCache,
    setEnabled,
    setTriggerMode,
    getTriggerMode,
    setSections,
  };
})();

/* position.js — Player repositioning logic + vertical sidebar enhancements */

// eslint-disable-next-line no-var
var BPPosition = (function () {
  "use strict";

  const VALID = ["bottom", "top", "left", "right"];
  const SIDE = ["left", "right"];
  let current = "bottom";
  let verticalEl = null; // container for custom vertical progress + info
  let progressRAF = null;

  function isSide() {
    return SIDE.includes(current);
  }

  function apply(pos) {
    if (!VALID.includes(pos)) pos = "bottom";
    current = pos;
    document.body.setAttribute("data-bp-position", pos);
    browser.storage.local.set({ bpPosition: pos });

    if (isSide()) {
      injectVerticalExtras();
      startProgressSync();
    } else {
      removeVerticalExtras();
      stopProgressSync();
    }
  }

  function get() {
    return current;
  }

  // --- Vertical sidebar extras: progress bar + track info ---

  function injectVerticalExtras() {
    const elements = document.querySelector(".playControls__elements");
    if (!elements) return;

    if (!verticalEl) {
      verticalEl = document.createElement("div");
      verticalEl.className = "bp-vertical-extras";
      verticalEl.innerHTML = `
        <div class="bp-vbar-wrap">
          <div class="bp-vbar-bg">
            <div class="bp-vbar-fill"></div>
          </div>
          <div class="bp-vbar-time"></div>
        </div>
        <div class="bp-vbar-info">
          <div class="bp-vbar-title"></div>
          <div class="bp-vbar-artist"></div>
        </div>
      `;

      // Click-to-seek on the progress bar
      const bg = verticalEl.querySelector(".bp-vbar-bg");
      bg.addEventListener("click", (e) => {
        const rect = bg.getBoundingClientRect();
        // Progress fills from bottom, so invert Y
        const frac = 1 - (e.clientY - rect.top) / rect.height;
        const audio = document.querySelector("audio");
        if (audio && audio.duration) {
          audio.currentTime = Math.max(0, Math.min(1, frac)) * audio.duration;
        }
      });
    }

    // Append after the buttons, before the sound badge
    const badge = elements.querySelector(".playControls__soundBadge");
    if (badge && !elements.contains(verticalEl)) {
      elements.insertBefore(verticalEl, badge);
    } else if (!elements.contains(verticalEl)) {
      elements.appendChild(verticalEl);
    }

    updateTrackInfo();
  }

  function removeVerticalExtras() {
    if (verticalEl && verticalEl.parentNode) {
      verticalEl.parentNode.removeChild(verticalEl);
    }
  }

  function updateTrackInfo() {
    if (!verticalEl) return;
    const titleEl = document.querySelector(
      ".playbackSoundBadge__titleLink"
    );
    const artistEl = document.querySelector(
      ".playbackSoundBadge__lightLink"
    );

    const title = titleEl
      ? titleEl.getAttribute("title") || titleEl.textContent.trim()
      : "";
    const artist = artistEl
      ? artistEl.getAttribute("title") || artistEl.textContent.trim()
      : "";

    const vTitle = verticalEl.querySelector(".bp-vbar-title");
    const vArtist = verticalEl.querySelector(".bp-vbar-artist");
    if (vTitle) vTitle.textContent = title;
    if (vArtist) vArtist.textContent = artist;
  }

  function updateProgress() {
    if (!verticalEl) return;
    const audio = document.querySelector("audio");
    let fraction = 0;
    let timeStr = "";

    if (audio && audio.duration) {
      fraction = audio.currentTime / audio.duration;
      const m = Math.floor(audio.currentTime / 60);
      const s = Math.floor(audio.currentTime % 60);
      timeStr = `${m}:${s.toString().padStart(2, "0")}`;
    } else {
      // Fallback: read from the progress bar element
      const bar = document.querySelector(
        '.playbackTimeline__progressBar'
      );
      if (bar && bar.style.width) {
        fraction = parseFloat(bar.style.width) / 100;
      }
    }

    const fill = verticalEl.querySelector(".bp-vbar-fill");
    const time = verticalEl.querySelector(".bp-vbar-time");
    if (fill) fill.style.height = (fraction * 100).toFixed(1) + "%";
    if (time) time.textContent = timeStr;

    // Also keep track info fresh
    updateTrackInfo();
  }

  function startProgressSync() {
    stopProgressSync();
    function tick() {
      updateProgress();
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

  /** Load saved position and apply immediately */
  async function init() {
    const data = await browser.storage.local.get("bpPosition");
    apply(data.bpPosition || "bottom");
  }

  return { apply, get, init, VALID };
})();

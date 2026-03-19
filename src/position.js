/* position.js — Player repositioning logic + vertical sidebar enhancements */

// eslint-disable-next-line no-var
var BPPosition = (function () {
  "use strict";

  var VALID = ["bottom", "top", "left", "right"];
  var SIDE = ["left", "right"];
  var current = "bottom";
  var verticalEl = null;
  var toggleBtn = null;
  var progressRAF = null;

  function isSide() {
    return SIDE.includes(current);
  }

  function apply(pos) {
    if (!VALID.includes(pos)) pos = "bottom";
    current = pos;
    document.body.setAttribute("data-bp-position", pos);
    browser.storage.local.set({ bpPosition: pos });

    injectToggleButton();

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
    var elements = document.querySelector(".playControls__elements");
    if (!elements) return;

    if (!verticalEl) {
      verticalEl = document.createElement("div");
      verticalEl.className = "bp-vertical-extras";
      verticalEl.innerHTML =
        '<div class="bp-vbar-wrap">' +
        '<div class="bp-vbar-timePassed">0:00</div>' +
        '<div class="bp-vbar-progressWrapper">' +
        '<div class="bp-vbar-progressBackground"></div>' +
        '<div class="bp-vbar-progressBar"></div>' +
        '<div class="bp-vbar-progressHandle"></div>' +
        "</div>" +
        '<div class="bp-vbar-duration">0:00</div>' +
        "</div>" +
        '<div class="bp-vbar-info">' +
        '<a class="bp-vbar-title" href="#"></a>' +
        '<a class="bp-vbar-artist" href="#"></a>' +
        "</div>";

      // SPA navigation for title/artist links
      verticalEl.querySelector(".bp-vbar-info").addEventListener("click", function (e) {
        var link = e.target.closest("a");
        if (!link || link.href === "#" || !link.getAttribute("href")) return;
        e.preventDefault();
        history.pushState({}, "", link.getAttribute("href"));
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      // Click-to-seek on the progress wrapper
      var wrapper = verticalEl.querySelector(".bp-vbar-progressWrapper");
      wrapper.addEventListener("click", function (e) {
        var rect = wrapper.getBoundingClientRect();
        var frac = (e.clientY - rect.top) / rect.height;
        var audio = document.querySelector("audio");
        if (audio && audio.duration) {
          audio.currentTime = Math.max(0, Math.min(1, frac)) * audio.duration;
        }
      });
    }

    // Append after the buttons, before the sound badge
    var badge = elements.querySelector(".playControls__soundBadge");
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

  // --- Panel toggle button at top of sidebar ---

  function injectToggleButton() {
    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.className = "bp-panel-toggle";
      toggleBtn.title = "Toggle panel";
      toggleBtn.innerHTML =
        '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">' +
        '<path d="M1 1 L9 7 L1 13Z"/>' +
        "</svg>";
      toggleBtn.addEventListener("click", function () {
        if (typeof BPPanel !== "undefined") {
          var link =
            document.querySelector(".playbackSoundBadge__titleLink");
          if (link) {
            var href = link.getAttribute("href");
            if (href && href.startsWith("/")) {
              var url = "https://soundcloud.com" + href.split("?")[0];
              BPApi.resolveTrack(url).then(function (result) {
                if (result.track && result.track.id) {
                  BPPanel.toggle(result.track.id);
                  updateToggleArrow();
                }
              });
            }
          }
        }
      });
    }

    if (!document.body.contains(toggleBtn)) {
      document.body.appendChild(toggleBtn);
    }
    updateToggleArrow();
  }

  function updateToggleArrow() {
    if (!toggleBtn) return;
    var deployed = typeof BPPanel !== "undefined" && BPPanel.isVisible();

    if (current === "left" || current === "right") {
      // Horizontal arrow: outward when closed, inward when deployed
      var pointsRight =
        (current === "left" && !deployed) ||
        (current === "right" && deployed);
      toggleBtn.style.transform = pointsRight ? "scaleX(1)" : "scaleX(-1)";
    } else {
      // Top/bottom: rotate arrow to point up/down
      // Top: outward = down (closed), inward = up (deployed)
      // Bottom: outward = up (closed), inward = down (deployed)
      var pointsDown =
        (current === "top" && !deployed) ||
        (current === "bottom" && deployed);
      toggleBtn.style.transform = pointsDown
        ? "rotate(90deg)"
        : "rotate(-90deg)";
    }
  }

  function removeToggleButton() {
    if (toggleBtn && toggleBtn.parentNode) {
      toggleBtn.parentNode.removeChild(toggleBtn);
    }
  }

  function updateTrackInfo() {
    if (!verticalEl) return;
    var titleEl = document.querySelector(".playbackSoundBadge__titleLink");
    var artistEl = document.querySelector(".playbackSoundBadge__lightLink");

    var title = titleEl
      ? titleEl.getAttribute("title") || titleEl.textContent.trim()
      : "";
    var artist = artistEl
      ? artistEl.getAttribute("title") || artistEl.textContent.trim()
      : "";

    var titleHref = titleEl ? titleEl.getAttribute("href") || "#" : "#";
    var artistHref = artistEl ? artistEl.getAttribute("href") || "#" : "#";

    var vTitle = verticalEl.querySelector(".bp-vbar-title");
    var vArtist = verticalEl.querySelector(".bp-vbar-artist");
    if (vTitle) {
      vTitle.textContent = title;
      vTitle.href = titleHref;
    }
    if (vArtist) {
      vArtist.textContent = artist;
      vArtist.href = artistHref;
    }
  }

  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + s.toString().padStart(2, "0");
  }

  function updateProgress() {
    if (!verticalEl) return;

    // Re-inject if SC re-rendered and our elements got detached
    if (!document.body.contains(verticalEl)) {
      injectVerticalExtras();
    }
    if (toggleBtn && !document.body.contains(toggleBtn)) {
      injectToggleButton();
    }
    updateToggleArrow();

    var audio = document.querySelector("audio");
    var fraction = 0;
    var currentTime = 0;
    var totalDuration = 0;

    if (audio && audio.duration) {
      fraction = audio.currentTime / audio.duration;
      currentTime = audio.currentTime;
      totalDuration = audio.duration;
    } else {
      var bar = document.querySelector(".playbackTimeline__progressBar");
      if (bar && bar.style.width) {
        fraction = parseFloat(bar.style.width) / 100;
      }
    }

    var pct = (fraction * 100).toFixed(2) + "%";
    var progressBar = verticalEl.querySelector(".bp-vbar-progressBar");
    var handle = verticalEl.querySelector(".bp-vbar-progressHandle");
    var timePassed = verticalEl.querySelector(".bp-vbar-timePassed");
    var durationEl = verticalEl.querySelector(".bp-vbar-duration");

    if (progressBar) progressBar.style.height = pct;
    if (handle) handle.style.top = pct;
    if (timePassed) timePassed.textContent = formatTime(currentTime);
    if (durationEl) durationEl.textContent = formatTime(totalDuration);

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

  async function init() {
    var data = await browser.storage.local.get("bpPosition");
    apply(data.bpPosition || "bottom");
  }

  return { apply, get, init, VALID };
})();

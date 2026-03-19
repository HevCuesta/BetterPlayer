/* waveform.js — Canvas-based waveform renderer with progress sync */

// eslint-disable-next-line no-var
var BPWaveform = (function () {
  "use strict";

  const BAR_WIDTH = 2;
  const BAR_GAP = 1;
  const PLAYED_COLOR = "#f50";
  const UNPLAYED_COLOR = "#666";
  /**
   * Create a waveform renderer bound to a canvas element.
   * Returns an object with update/draw/destroy methods.
   */
  function create(canvas) {
    const ctx = canvas.getContext("2d");
    let samples = [];
    let progress = 0; // 0–1
    let duration = 0; // seconds
    let commentTimestamps = []; // ms values
    let onSeek = null; // callback(seconds)
    let destroyed = false;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (destroyed) return;
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);

      if (!samples.length) return;

      const totalBars = Math.floor(w / (BAR_WIDTH + BAR_GAP));
      const step = samples.length / totalBars;
      const playedBars = Math.floor(progress * totalBars);

      for (let i = 0; i < totalBars; i++) {
        const sampleIdx = Math.floor(i * step);
        const val = samples[sampleIdx] || 0;
        const barH = Math.max(1, (val / 1.0) * h * 0.85);
        const x = i * (BAR_WIDTH + BAR_GAP);
        const y = h - barH;

        ctx.fillStyle = i <= playedBars ? PLAYED_COLOR : UNPLAYED_COLOR;
        ctx.fillRect(x, y, BAR_WIDTH, barH);
      }

      // Comment markers
      if (duration > 0 && commentTimestamps.length) {
        ctx.fillStyle = "#ff0";
        for (const ms of commentTimestamps) {
          const frac = ms / (duration * 1000);
          const x = frac * w;
          ctx.fillRect(x - 1, h - 4, 2, 4);
        }
      }
    }

    function handleClick(e) {
      if (!onSeek || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const seekTo = Math.max(0, Math.min(1, frac)) * duration;
      onSeek(seekTo);
    }

    canvas.addEventListener("click", handleClick);

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);
    resize();

    return {
      setSamples(s) {
        // Normalize: s can be heights array (0–1 or integers)
        const max = Math.max(1, ...s);
        samples = s.map((v) => v / max);
        draw();
      },

      setProgress(p) {
        progress = Math.max(0, Math.min(1, p));
        draw();
      },

      setDuration(d) {
        duration = d;
      },

      setCommentTimestamps(ts) {
        commentTimestamps = ts;
        draw();
      },

      setOnSeek(fn) {
        onSeek = fn;
      },

      destroy() {
        destroyed = true;
        canvas.removeEventListener("click", handleClick);
        ro.disconnect();
      },
    };
  }

  /**
   * Fetch and parse waveform data from a SoundCloud waveform URL.
   * Routed through background script to bypass page CSP restrictions.
   */
  async function fetchSamples(waveformUrl) {
    const result = await BPApi.fetchWaveform(waveformUrl);
    if (result.error) throw new Error(result.error);
    return result.samples || [];
  }

  return { create, fetchSamples };
})();

/* popup.js — Extension popup: position selector + settings */

(function () {
  "use strict";

  const posButtons = document.querySelectorAll(".pos-btn");
  const modeButtons = document.querySelectorAll(".mode-btn");
  const togglePanel = document.getElementById("toggle-panel");
  const toggleWaveform = document.getElementById("toggle-waveform");
  const toggleComments = document.getElementById("toggle-comments");
  const toggleInfo = document.getElementById("toggle-info");

  // --- Load saved state ---

  browser.storage.local
    .get(["bpPosition", "bpPanelEnabled", "bpSections", "bpTriggerMode"])
    .then((data) => {
      // Position
      const pos = data.bpPosition || "bottom";
      posButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.pos === pos);
      });

      // Panel toggle
      if (data.bpPanelEnabled === false) {
        togglePanel.checked = false;
      }

      // Trigger mode
      const mode = data.bpTriggerMode || "hover";
      modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
      });

      // Section toggles
      if (data.bpSections) {
        toggleWaveform.checked = data.bpSections.waveform !== false;
        toggleComments.checked = data.bpSections.comments !== false;
        toggleInfo.checked = data.bpSections.info !== false;
      }
    });

  // --- Position buttons ---

  posButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const pos = btn.dataset.pos;
      posButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      browser.storage.local.set({ bpPosition: pos });
      browser.runtime.sendMessage({
        action: "positionChanged",
        position: pos,
      });
    });
  });

  // --- Trigger mode buttons ---

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      modeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      browser.storage.local.set({ bpTriggerMode: mode });
      sendSettings();
    });
  });

  // --- Settings toggles ---

  function getSelectedMode() {
    const active = document.querySelector(".mode-btn.active");
    return active ? active.dataset.mode : "hover";
  }

  function sendSettings() {
    const settings = {
      action: "settingsChanged",
      panelEnabled: togglePanel.checked,
      triggerMode: getSelectedMode(),
      sections: {
        waveform: toggleWaveform.checked,
        comments: toggleComments.checked,
        info: toggleInfo.checked,
      },
    };

    browser.storage.local.set({
      bpPanelEnabled: settings.panelEnabled,
      bpTriggerMode: settings.triggerMode,
      bpSections: settings.sections,
    });

    browser.runtime.sendMessage(settings);
  }

  togglePanel.addEventListener("change", sendSettings);
  toggleWaveform.addEventListener("change", sendSettings);
  toggleComments.addEventListener("change", sendSettings);
  toggleInfo.addEventListener("change", sendSettings);
})();

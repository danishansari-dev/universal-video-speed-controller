"use strict";

// Use shared constants from constants.js (loaded before this script)
const SPEED_STEP = globalThis.YSC_SPEED_STEP || 0.25;
const MIN_RATE = globalThis.YSC_MIN_PLAYBACK_RATE || 0.25;
const MAX_RATE = globalThis.YSC_MAX_PLAYBACK_RATE || 10;
const DIAL_CIRCUMFERENCE = 402;
const HOLD_DELAY_MS = 260;
const HOLD_REPEAT_MS = 90;

const PRESETS = [0.25, 0.5, 1, 1.5, 2, 3, 5, 10];
const STARTUP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7.5, 10];
const DEFAULT_SHORTCUTS = globalThis.YSC_DEFAULT_SHORTCUTS || {};
// Use the shared STORAGE_KEYS from constants.js — names now match actual storage semantics
const STORAGE_KEYS = globalThis.YSC_STORAGE_KEYS || {};
if (!globalThis.YSC_DEFAULT_SHORTCUTS) {
  console.error("[Video Speed Controller] Shared constants failed to load.");
}
const SETTING_DEFS = [
  ["widgetEnabled", "Floating widget", "Inline or floating controls"],
  ["keyboardEnabled", "Shortcuts", "Keyboard layer"],
  ["mouseWheelEnabled", "Wheel / pinch", "Mouse wheel and pinch gestures"],
  ["boostEnabled", "Boost mode", "Hold X"],
  ["rememberPerChannel", "Per channel", "YouTube channel memory"],
  ["rememberGlobally", "Global memory", "Last speed everywhere"],
  ["rememberPerSite", "Per website", "Speed memory per domain"],
  ["autoApplyPreferredSpeed", "Auto apply", "New players"],
  ["compactMode", "Compact mode", "Tighter widget"],
  ["overlayEnabled", "Overlay", "Speed toast"],
  ["fullscreenOnlyControls", "Fullscreen only", "Hide inline widget"]
];
const SHORTCUT_NAMES = {
  increase: "Increase speed",
  increaseAlt: "Increase speed (alternative)",
  decrease: "Decrease speed",
  decreaseAlt: "Decrease speed (alternative)",
  reset: "Reset speed",
  boost: "Temporary boost",
  widgetToggle: "Toggle widget",
  overlayToggle: "Toggle overlay",
  preset1: "Preset 1x",
  preset2: "Preset 2x",
  preset3: "Preset 3x",
  preset4: "Preset 4x",
  preset5: "Preset 5x",
  preset10: "Preset 10x"
};

const $ = (selector) => document.querySelector(selector);
const appShell = $(".app-shell");
const els = {
  enabledToggle: $("#enabledToggle"),
  statusDot: $("#statusDot"),
  statusText: $("#statusText"),
  speedValue: $("#speedValue"),
  speedReadout: $(".speed-readout"),
  dialProgress: $("#dialProgress"),
  decreaseBtn: $("#decreaseBtn"),
  increaseBtn: $("#increaseBtn"),
  presetGrid: $("#presetGrid"),
  videoTitle: $("#videoTitle"),
  tabStatus: $("#tabStatus"),
  currentTime: $("#currentTime"),
  duration: $("#duration"),
  videoProgress: $("#videoProgress"),
  infoSpeed: $("#infoSpeed"),
  domainText: $("#domainText"),
  settingsGrid: $("#settingsGrid"),
  startupSpeed: $("#startupSpeed"),
  shortcutSearch: $("#shortcutSearch"),
  shortcutList: $("#shortcutList"),
  resetShortcuts: $("#resetShortcuts"),
  conflictWarning: $("#conflictWarning"),
  timeSaved: $("#timeSaved"),
  mostUsed: $("#mostUsed"),
  dailyUsage: $("#dailyUsage"),
  sessionAverage: $("#sessionAverage"),
  defaultNativeMode: $("#defaultNativeMode"),
  siteDomainLabel: $("#siteDomainLabel"),
  siteNativeMode: $("#siteNativeMode"),
  accessModeSelect: $("#accessModeSelect"),
  accessListInput: $("#accessListInput"),
  saveAccessList: $("#saveAccessList"),
  sitePanelHint: $("#sitePanelHint")
};

let activeTabId = null;
let state = null;
let shortcuts = {};
let recordingAction = null;
let holdDelay = 0;
let holdInterval = 0;
let holdActivated = false;
let suppressClick = false;
let pollTimer = 0;

const clampRate = (rate) => Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(Number(rate) / SPEED_STEP) * SPEED_STEP));
// Use shared formatRate from constants.js, with local fallback
const formatRate = globalThis.YSC_FORMAT_RATE || ((rate) => `${String(Number(clampRate(rate).toFixed(2)))}x`);

const formatTime = (seconds) => {
  const value = Number(seconds);

  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }

  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

const formatDuration = (seconds) => {
  const minutes = Math.round((Number(seconds) || 0) / 60);

  if (minutes < 1) {
    return "0m";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const sendMessage = (message) => new Promise((resolve) => {
  if (!activeTabId) {
    resolve(null);
    return;
  }

  // Send message to all frames so embedded videos (iframes) can respond
  chrome.tabs.sendMessage(activeTabId, message, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      resolve(null);
      return;
    }

    resolve(response.state || null);
  });
});

const parseHostList = (text) => text
  .split(/[\n,]+/)
  .map((line) => line.trim().toLowerCase())
  .filter(Boolean);

const normalizeStoredAccessList = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((host) => String(host).trim().toLowerCase()).filter(Boolean);
  }

  if (typeof raw === "string") {
    return parseHostList(raw);
  }

  return [];
};

const isLiveContentState = () => Boolean(state?.tab?.url);

const persistAccessListFallback = (mode, hosts) => {
  const normalizedMode = mode === "whitelist" || mode === "blacklist" ? mode : "all";

  saveLocal(STORAGE_KEYS.siteAccessMode, normalizedMode);
  saveLocal(STORAGE_KEYS.siteAccessList, hosts);
  state = {
    ...state,
    tab: {
      ...state.tab,
      siteAccessMode: normalizedMode,
      siteAccessList: hosts
    }
  };
  renderState();
};

const getActiveTab = () => new Promise((resolve) => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab || null));
});

const loadFallbackSettings = () => new Promise((resolve) => {
  chrome.storage.local.get(null, (values) => {
    resolve(values || {});
  });
});

const cloneDefaultShortcuts = () => JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

const saveLocal = (key, value) => {
  chrome.storage.local.set({ [key]: value });
};

const shortcutSignature = (shortcut) => [
  shortcut.ctrl ? "Ctrl" : "",
  shortcut.alt ? "Alt" : "",
  shortcut.shift ? "Shift" : "",
  shortcut.meta ? "Meta" : "",
  shortcut.code
].filter(Boolean).join("+");

/**
 * Generates a user-friendly string representation of a keydown event.
 * 
 * Why this code exists:
 * Users customize key shortcuts via keypresses in the shortcut manager.
 * This converts standard keyboard event parameters to clean visual representations.
 * 
 * @danishansari-dev event - The keyboard event object to translate.
 * @returns {string} Formatted shortcut label (e.g. "Ctrl + Shift + [").
 */
const shortcutLabelFromEvent = (event) => {
  const parts = [];

  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  const key = event.code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "Num ");

  // Map specific technical key codes to standard user-friendly characters for display
  parts.push(
    key === "Period" ? "."
    : key === "Comma" ? ","
    : key === "BracketLeft" ? "["
    : key === "BracketRight" ? "]"
    : key === "Backslash" ? "\\"
    : key
  );

  return parts.join(" + ");
};

const shortcutFromEvent = (event, existing = {}) => ({
  ...existing,
  code: event.code,
  shift: event.shiftKey,
  ctrl: event.ctrlKey,
  alt: event.altKey,
  meta: event.metaKey,
  hold: Boolean(existing.hold),
  label: existing.hold ? `${shortcutLabelFromEvent(event)} (hold)` : shortcutLabelFromEvent(event)
});

const getConflicts = () => {
  const seen = new Map();
  const conflicts = new Set();

  for (const [action, shortcut] of Object.entries(shortcuts)) {
    const signature = shortcutSignature(shortcut);

    if (seen.has(signature)) {
      conflicts.add(action);
      conflicts.add(seen.get(signature));
    } else {
      seen.set(signature, action);
    }
  }

  return conflicts;
};

const renderPresets = () => {
  els.presetGrid.innerHTML = "";

  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-chip";
    button.textContent = formatRate(preset);
    button.classList.toggle("active", Math.abs((state?.rate || 1) - preset) < 0.01);
    button.disabled = state && (!state.enabled || !state.hasVideo);
    button.addEventListener("click", () => setRate(preset));
    els.presetGrid.append(button);
  }
};

const renderSettings = () => {
  els.settingsGrid.innerHTML = "";

  for (const [key, title, subtitle] of SETTING_DEFS) {
    const label = document.createElement("label");
    label.className = "setting-toggle";

    // Build DOM safely without innerHTML to prevent XSS if data ever becomes user-editable
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(state?.settings?.[key]);

    const miniSwitch = document.createElement("span");
    miniSwitch.className = "mini-switch";

    const copy = document.createElement("span");
    copy.className = "setting-copy";

    const strong = document.createElement("strong");
    strong.textContent = title;

    const sub = document.createElement("span");
    sub.textContent = subtitle;

    copy.append(strong, sub);
    label.append(input, miniSwitch, copy);

    input.addEventListener("change", (event) => updateSetting(key, event.target.checked));
    els.settingsGrid.append(label);
  }

  // Clear any existing options in the select element
  els.startupSpeed.innerHTML = "";
  // Why this code exists:
  // Dynamically populating options using safe DOM methods instead of innerHTML
  // prevents unsafe assignment warnings and complies with store safety reviews.
  for (const speed of STARTUP_SPEEDS) {
    const option = document.createElement("option");
    option.value = String(speed);
    option.textContent = formatRate(speed);
    els.startupSpeed.append(option);
  }
  els.startupSpeed.value = String(state?.settings?.startupDefaultSpeed || 1);
};

const renderShortcuts = () => {
  const query = els.shortcutSearch.value.trim().toLowerCase();
  const conflicts = getConflicts();

  els.conflictWarning.hidden = conflicts.size === 0;
  els.shortcutList.innerHTML = "";

  for (const [action, shortcut] of Object.entries(shortcuts)) {
    const name = SHORTCUT_NAMES[action] || action;
    const searchable = `${name} ${shortcut.label}`.toLowerCase();

    if (query && !searchable.includes(query)) {
      continue;
    }

    const card = document.createElement("div");
    card.className = "shortcut-card";
    card.classList.toggle("conflict", conflicts.has(action));

    // Why this code exists:
    // Building shortcut cards safely without innerHTML ensures strict compliance
    // with browser extensions safety guidelines and avoids review rejections.
    const textGroup = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = name;
    const span = document.createElement("span");
    span.textContent = conflicts.has(action) ? "Shortcut conflict" : "Click keycap to edit";
    textGroup.append(strong, span);

    const button = document.createElement("button");
    button.className = `keycap ${recordingAction === action ? "recording" : ""}`;
    button.type = "button";
    button.textContent = recordingAction === action ? "Press keys" : shortcut.label;

    card.append(textGroup, button);

    button.addEventListener("click", () => {
      recordingAction = recordingAction === action ? null : action;
      renderShortcuts();
    });
    els.shortcutList.append(card);
  }
};

const renderTheme = () => {
  const mode = state?.settings?.themeMode || "auto";

  document.documentElement.dataset.theme = mode;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === mode);
  });
};

const renderState = () => {
  const rate = state?.rate || 1;
  const enabled = state?.enabled !== false;
  const hasVideo = Boolean(state?.hasVideo);
  const status = state?.status || "No video detected";
  const accessBlocked = Boolean(state?.tab?.accessBlockedReason);
  const canControl = enabled && hasVideo && !accessBlocked;
  const duration = state?.video?.duration || 0;
  const currentTime = state?.video?.currentTime || 0;
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const dialProgress = (rate - MIN_RATE) / (MAX_RATE - MIN_RATE);

  appShell.classList.toggle("is-disabled", !enabled);
  els.enabledToggle.checked = enabled;
  els.statusText.textContent = status;
  els.statusDot.className = `status-dot ${enabled && hasVideo ? "active" : !enabled ? "disabled" : ""}`;
  els.decreaseBtn.disabled = !canControl;
  els.increaseBtn.disabled = !canControl;
  els.speedValue.textContent = formatRate(rate);
  els.dialProgress.style.strokeDashoffset = String(DIAL_CIRCUMFERENCE * (1 - dialProgress));
  els.videoTitle.textContent = hasVideo
    ? state.video.title
    : (isLiveContentState() ? "No active video found on this page." : "Open a tab with video to sync controls.");
  els.tabStatus.textContent = hasVideo ? (state.video.paused ? "Paused" : "Playing") : "Waiting";
  els.currentTime.textContent = formatTime(currentTime);
  els.duration.textContent = formatTime(duration);
  els.videoProgress.style.width = `${progress}%`;
  els.infoSpeed.textContent = formatRate(rate);
  els.domainText.textContent = state?.tab?.domain || "-";
  els.timeSaved.textContent = formatDuration(state?.analytics?.timeSavedSeconds);
  els.mostUsed.textContent = state?.analytics?.mostUsedSpeed || formatRate(rate);
  els.dailyUsage.textContent = formatDuration(state?.analytics?.dailyUsageSeconds);
  els.sessionAverage.textContent = formatRate(state?.analytics?.sessionAverageSpeed || rate);

  shortcuts = state?.shortcuts || shortcuts;
  renderTheme();
  renderPresets();
  renderSettings();
  renderShortcuts();

  const live = isLiveContentState();
  const tab = state?.tab || {};

  els.defaultNativeMode.value = state?.settings?.defaultNativeMode === "sync" ? "sync" : "override";
  els.siteDomainLabel.textContent = live ? (tab.domain || "-") : "-";
  els.sitePanelHint.textContent = live ? "Domain rules" : "Open a web tab";

  els.siteNativeMode.value = !live
    ? "default"
    : (tab.siteNativeOverride === "override" || tab.siteNativeOverride === "sync"
      ? tab.siteNativeOverride
      : "default");
  els.siteNativeMode.disabled = !live;

  els.accessModeSelect.value = tab.siteAccessMode === "whitelist" || tab.siteAccessMode === "blacklist"
    ? tab.siteAccessMode
    : "all";
  els.accessListInput.value = Array.isArray(tab.siteAccessList) ? tab.siteAccessList.join("\n") : "";

  requestAnimationFrame(() => {
    els.speedReadout.classList.add("changed");
    setTimeout(() => els.speedReadout.classList.remove("changed"), 150);
  });
};

const refreshState = async () => {
  const nextState = await sendMessage({ type: "YSC_GET_STATE" });

  if (nextState) {
    state = nextState;
    renderState();
  }
};

const setStateFromResponse = (nextState) => {
  if (!nextState) {
    return;
  }

  state = nextState;
  renderState();
};

const setRate = async (rate) => {
  const nextState = await sendMessage({ type: "YSC_SET_RATE", rate });

  if (nextState) {
    setStateFromResponse(nextState);
    return;
  }

  state = {
    ...state,
    rate: clampRate(rate),
    preferredRate: clampRate(rate)
  };
  saveLocal(STORAGE_KEYS.rate, clampRate(rate));
  renderState();
};

const moveRate = async (direction) => {
  setStateFromResponse(await sendMessage({ type: "YSC_MOVE_RATE", direction }));
};

const updateSetting = async (key, value) => {
  const nextState = await sendMessage({ type: "YSC_UPDATE_SETTING", key, value });

  if (nextState) {
    setStateFromResponse(nextState);
    return;
  }

  state = {
    ...state,
    enabled: key === "enabled" ? Boolean(value) : state.enabled,
    settings: {
      ...state.settings,
      [key]: value
    }
  };

  // Map inverted UI keys to their actual storage key names
  const INVERTED_KEY_MAP = { widgetEnabled: "widgetHidden", overlayEnabled: "toastHidden" };
  const mappedKey = INVERTED_KEY_MAP[key] || key;
  const storageKey = STORAGE_KEYS[mappedKey];

  if (storageKey) {
    // Widget and overlay use inverted semantics: UI shows "enabled", storage stores "hidden"
    saveLocal(storageKey, INVERTED_KEY_MAP[key] ? !value : value);
  }

  renderState();
};

const resetShortcuts = async () => {
  recordingAction = null;
  const nextState = await sendMessage({ type: "YSC_RESET_SHORTCUTS" });

  if (nextState) {
    setStateFromResponse(nextState);
    return;
  }

  shortcuts = cloneDefaultShortcuts();
  state = { ...state, shortcuts };
  saveLocal(STORAGE_KEYS.shortcuts, shortcuts);
  renderState();
};

const updateShortcuts = async () => {
  const nextState = await sendMessage({ type: "YSC_UPDATE_SHORTCUTS", shortcuts });

  if (nextState) {
    setStateFromResponse(nextState);
    return;
  }

  state = { ...state, shortcuts };
  saveLocal(STORAGE_KEYS.shortcuts, shortcuts);
  renderState();
};

const stopHold = ({ suppress = holdActivated } = {}) => {
  clearTimeout(holdDelay);
  clearInterval(holdInterval);
  holdDelay = 0;
  holdInterval = 0;
  holdActivated = false;
  els.decreaseBtn.classList.remove("holding");
  els.increaseBtn.classList.remove("holding");

  if (suppress) {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 350);
  }
};

const startHold = (direction, button, event) => {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  stopHold({ suppress: false });
  button.classList.add("holding");
  holdDelay = setTimeout(() => {
    holdActivated = true;
    moveRate(direction);
    holdInterval = setInterval(() => moveRate(direction), HOLD_REPEAT_MS);
  }, HOLD_DELAY_MS);
};

const wireHoldButton = (button, direction) => {
  button.addEventListener("click", () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    moveRate(direction);
  });
  button.addEventListener("pointerdown", (event) => startHold(direction, button, event));
  button.addEventListener("pointerup", () => stopHold());
  button.addEventListener("pointercancel", () => stopHold());
  button.addEventListener("pointerleave", () => stopHold());
};

const bootstrapFallbackState = async () => {
  const values = await loadFallbackSettings();
  const enabled = values["youtubeSpeedController.enabled"] !== false;

  state = {
    status: "No video detected",
    enabled,
    hasVideo: false,
    rate: clampRate(values["youtubeSpeedController.playbackRate"] || 1),
    preferredRate: clampRate(values["youtubeSpeedController.playbackRate"] || 1),
    settings: {
      enabled,
      widgetEnabled: values["youtubeSpeedController.widgetHidden"] !== true,
      keyboardEnabled: values["youtubeSpeedController.keyboardEnabled"] !== false,
      mouseWheelEnabled: values["youtubeSpeedController.mouseWheelEnabled"] !== false,
      boostEnabled: values["youtubeSpeedController.boostEnabled"] !== false,
      rememberPerChannel: values["youtubeSpeedController.rememberPerChannel"] === true,
      rememberGlobally: values["youtubeSpeedController.rememberGlobally"] !== false,
      rememberPerSite: values["youtubeSpeedController.rememberPerSite"] !== false,
      autoApplyPreferredSpeed: values["youtubeSpeedController.autoApplyPreferredSpeed"] !== false,
      compactMode: values["youtubeSpeedController.compactMode"] === true,
      overlayEnabled: values["youtubeSpeedController.toastHidden"] !== true,
      fullscreenOnlyControls: values["youtubeSpeedController.fullscreenOnlyControls"] === true,
      themeMode: values["youtubeSpeedController.themeMode"] || "auto",
      startupDefaultSpeed: clampRate(values["youtubeSpeedController.startupDefaultSpeed"] || 1),
      defaultNativeMode: values["youtubeSpeedController.defaultNativeMode"] === "sync" ? "sync" : "override"
    },
    shortcuts: values["youtubeSpeedController.shortcuts"] || cloneDefaultShortcuts(),
    video: { title: "", duration: 0, currentTime: 0, paused: true },
    tab: {
      domain: "",
      url: "",
      isYouTube: false,
      siteDisabled: false,
      rememberPerSite: values["youtubeSpeedController.rememberPerSite"] !== false,
      sitePreferredRate: null,
      siteNativeOverride: null,
      nativeMode: values["youtubeSpeedController.defaultNativeMode"] === "sync" ? "sync" : "override",
      defaultNativeMode: values["youtubeSpeedController.defaultNativeMode"] === "sync" ? "sync" : "override",
      siteAccessMode: ["whitelist", "blacklist"].includes(values["youtubeSpeedController.siteAccessMode"])
        ? values["youtubeSpeedController.siteAccessMode"]
        : "all",
      siteAccessList: normalizeStoredAccessList(values["youtubeSpeedController.siteAccessList"]),
      accessBlockedReason: null,
      nativeControlsLikely: false
    },
    analytics: {
      timeSavedSeconds: values["youtubeSpeedController.analytics"]?.timeSavedSeconds || 0,
      dailyUsageSeconds: values["youtubeSpeedController.analytics"]?.dailyUsageSeconds || 0,
      mostUsedSpeed: "1x",
      sessionAverageSpeed: 1
    }
  };
  shortcuts = state.shortcuts;
  renderState();
};

const init = async () => {
  activeTabId = (await getActiveTab())?.id || null;
  renderPresets();

  const nextState = await sendMessage({ type: "YSC_GET_STATE" });

  if (nextState) {
    state = nextState;
    shortcuts = state.shortcuts || {};
    renderState();
  } else {
    await bootstrapFallbackState();
  }

  startPolling();

  // Retry looking for a video in the background without blocking the UI
  if (!state?.hasVideo) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      const retryState = await sendMessage({ type: "YSC_GET_STATE" });

      if (retryState?.hasVideo) {
        state = retryState;
        shortcuts = state.shortcuts || {};
        renderState();
        break;
      }
    }
  }
};

const startPolling = () => {
  if (pollTimer || document.hidden) {
    return;
  }

  pollTimer = setInterval(refreshState, 1000);
};

const stopPolling = () => {
  if (!pollTimer) {
    return;
  }

  clearInterval(pollTimer);
  pollTimer = 0;
};

els.enabledToggle.addEventListener("change", (event) => updateSetting("enabled", event.target.checked));
els.startupSpeed.addEventListener("change", (event) => updateSetting("startupDefaultSpeed", Number(event.target.value)));
els.defaultNativeMode.addEventListener("change", (event) => updateSetting("defaultNativeMode", event.target.value));
els.siteNativeMode.addEventListener("change", async (event) => {
  const responded = await sendMessage({ type: "YSC_SET_SITE_NATIVE_MODE", mode: event.target.value });

  if (responded) {
    setStateFromResponse(responded);
  }
});
els.saveAccessList.addEventListener("click", async () => {
  const mode = els.accessModeSelect.value;
  const hosts = parseHostList(els.accessListInput.value);
  const responded = await sendMessage({ type: "YSC_SET_SITE_ACCESS_LIST", mode, hosts });

  if (responded) {
    setStateFromResponse(responded);
  } else {
    persistAccessListFallback(mode, hosts);
  }
});
els.shortcutSearch.addEventListener("input", renderShortcuts);
els.resetShortcuts.addEventListener("click", resetShortcuts);
document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => updateSetting("themeMode", button.dataset.themeChoice));
});
document.addEventListener("keydown", (event) => {
  if (!recordingAction) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.code === "Escape") {
    recordingAction = null;
    renderShortcuts();
    return;
  }

  shortcuts = {
    ...shortcuts,
    [recordingAction]: shortcutFromEvent(event, shortcuts[recordingAction])
  };
  recordingAction = null;
  renderShortcuts();
  updateShortcuts();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
    return;
  }

  refreshState();
  startPolling();
});
window.addEventListener("unload", stopPolling);
wireHoldButton(els.decreaseBtn, -1);
wireHoldButton(els.increaseBtn, 1);

// Modern tab switcher logic.
// Switches active CSS states on navigation tab buttons and data-tab content containers.
document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tabTarget;
    document.querySelectorAll(".nav-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-content").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === target);
    });
  });
});

init();

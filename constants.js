/* eslint-env browser, worker */
"use strict";

/**
 * Shared constants for the Video Speed Controller extension.
 * Loaded by content scripts (via manifest), popup (via <script>), and
 * service worker (via importScripts). Must work in all three contexts.
 */

/** Shared speed constants used by content script, popup, and service worker */
const YSC_SPEED_STEP = 0.25;
const YSC_MIN_PLAYBACK_RATE = 0.25;
const YSC_MAX_PLAYBACK_RATE = 10;

/** Storage key map — single source of truth for all chrome.storage keys */
const YSC_STORAGE_KEYS = Object.freeze({
  rate: "youtubeSpeedController.playbackRate",
  widgetHidden: "youtubeSpeedController.widgetHidden",
  toastHidden: "youtubeSpeedController.toastHidden",
  enabled: "youtubeSpeedController.enabled",
  keyboardEnabled: "youtubeSpeedController.keyboardEnabled",
  mouseWheelEnabled: "youtubeSpeedController.mouseWheelEnabled",
  boostEnabled: "youtubeSpeedController.boostEnabled",
  rememberPerChannel: "youtubeSpeedController.rememberPerChannel",
  rememberGlobally: "youtubeSpeedController.rememberGlobally",
  rememberPerSite: "youtubeSpeedController.rememberPerSite",
  autoApplyPreferredSpeed: "youtubeSpeedController.autoApplyPreferredSpeed",
  compactMode: "youtubeSpeedController.compactMode",
  fullscreenOnlyControls: "youtubeSpeedController.fullscreenOnlyControls",
  themeMode: "youtubeSpeedController.themeMode",
  startupDefaultSpeed: "youtubeSpeedController.startupDefaultSpeed",
  shortcuts: "youtubeSpeedController.shortcuts",
  channelRates: "youtubeSpeedController.channelRates",
  analytics: "youtubeSpeedController.analytics",
  sitePolicies: "youtubeSpeedController.sitePolicies",
  siteAccessMode: "youtubeSpeedController.siteAccessMode",
  siteAccessList: "youtubeSpeedController.siteAccessList",
  defaultNativeMode: "youtubeSpeedController.defaultNativeMode"
});

const YSC_DEFAULT_SHORTCUTS = Object.freeze({
  increase: Object.freeze({ label: "]", code: "BracketRight" }),
  increaseAlt: Object.freeze({ label: "Shift + .", code: "Period", shift: true }),
  decrease: Object.freeze({ label: "[", code: "BracketLeft" }),
  decreaseAlt: Object.freeze({ label: "Shift + ,", code: "Comma", shift: true }),
  reset: Object.freeze({ label: "\\", code: "Backslash" }),
  boost: Object.freeze({ label: "X (hold)", code: "KeyX", hold: true }),
  widgetToggle: Object.freeze({ label: "Shift + S", code: "KeyS", shift: true }),
  overlayToggle: Object.freeze({ label: "Shift + H", code: "KeyH", shift: true }),
  preset1: Object.freeze({ label: "", code: "" }),
  preset2: Object.freeze({ label: "", code: "" }),
  preset3: Object.freeze({ label: "", code: "" }),
  preset4: Object.freeze({ label: "", code: "" }),
  preset5: Object.freeze({ label: "", code: "" }),
  preset10: Object.freeze({ label: "", code: "" })
});

const YSC_PRESET_ACTION_RATES = Object.freeze({
  preset1: 1,
  preset2: 2,
  preset3: 3,
  preset4: 4,
  preset5: 5,
  preset10: 10
});

/**
 * Formats a playback rate for display (e.g. 2 → "2x", 1.5 → "1.5x")
 * @param {number} rate - The playback rate to format
 * @returns {string} Formatted rate string
 */
const YSC_FORMAT_RATE = (rate) => {
  const clamped = Math.min(
    YSC_MAX_PLAYBACK_RATE,
    Math.max(YSC_MIN_PLAYBACK_RATE, Math.round(Number(rate) / YSC_SPEED_STEP) * YSC_SPEED_STEP)
  );

  return `${String(Number(clamped.toFixed(2)))}x`;
};

// Expose to globalThis so content scripts (running inside an IIFE) can access them
if (typeof globalThis !== "undefined") {
  globalThis.YSC_SPEED_STEP = YSC_SPEED_STEP;
  globalThis.YSC_MIN_PLAYBACK_RATE = YSC_MIN_PLAYBACK_RATE;
  globalThis.YSC_MAX_PLAYBACK_RATE = YSC_MAX_PLAYBACK_RATE;
  globalThis.YSC_STORAGE_KEYS = YSC_STORAGE_KEYS;
  globalThis.YSC_DEFAULT_SHORTCUTS = YSC_DEFAULT_SHORTCUTS;
  globalThis.YSC_PRESET_ACTION_RATES = YSC_PRESET_ACTION_RATES;
  globalThis.YSC_FORMAT_RATE = YSC_FORMAT_RATE;
}

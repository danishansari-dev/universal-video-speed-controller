"use strict";

const STORAGE_PREFIX = "youtubeSpeedController.";

// Why we inline default shortcuts in background.js instead of importing from constants.js:
// Manifest V3 service workers on Chrome can throw a DOMException or fail to register during updates
// when calling importScripts() synchronously at startup. Since background.js only needs the
// shortcuts object for seeding default values, inlining the default values eliminates this
// unstable importScripts dependency and ensures reliable service worker registration.
const DEFAULT_SHORTCUTS = {
  increase: { label: "]", code: "BracketRight" },
  increaseAlt: { label: "Shift + .", code: "Period", shift: true },
  decrease: { label: "[", code: "BracketLeft" },
  decreaseAlt: { label: "Shift + ,", code: "Comma", shift: true },
  reset: { label: "\\", code: "Backslash" },
  boost: { label: "X (hold)", code: "KeyX", hold: true },
  widgetToggle: { label: "Shift + S", code: "KeyS", shift: true },
  overlayToggle: { label: "Shift + H", code: "KeyH", shift: true },
  preset1: { label: "", code: "" },
  preset2: { label: "", code: "" },
  preset3: { label: "", code: "" },
  preset4: { label: "", code: "" },
  preset5: { label: "", code: "" },
  preset10: { label: "", code: "" }
};

const DEFAULT_STORAGE = {
  "youtubeSpeedController.enabled": true,
  "youtubeSpeedController.keyboardEnabled": true,
  "youtubeSpeedController.mouseWheelEnabled": true,
  "youtubeSpeedController.boostEnabled": true,
  "youtubeSpeedController.rememberGlobally": true,
  "youtubeSpeedController.rememberPerSite": true,
  "youtubeSpeedController.rememberPerChannel": false,
  "youtubeSpeedController.autoApplyPreferredSpeed": true,
  "youtubeSpeedController.compactMode": false,
  "youtubeSpeedController.fullscreenOnlyControls": false,
  "youtubeSpeedController.themeMode": "auto",
  "youtubeSpeedController.defaultNativeMode": "override",
  "youtubeSpeedController.siteAccessMode": "all",
  "youtubeSpeedController.siteAccessList": [],
  "youtubeSpeedController.startupDefaultSpeed": 1,
  "youtubeSpeedController.playbackRate": 1,
  "youtubeSpeedController.shortcuts": DEFAULT_SHORTCUTS,
  "youtubeSpeedController.channelRates": {},
  "youtubeSpeedController.sitePolicies": {},
  "youtubeSpeedController.widgetHidden": false,
  "youtubeSpeedController.toastHidden": false,
  "youtubeSpeedController.reviewPromptDismissed": false
};

let broadcastTimer = 0;
let pendingChangedKeys = new Set();

/**
 * Seeds fallback default settings to chrome.storage.local and migrates legacy shortcuts.
 * 
 * Why this code exists:
 * The extension must function immediately with default configurations on first run or update.
 * If users have legacy defaults stored (Shift+. , Shift+, , Shift+Backspace), this migrates
 * them automatically to the new bracket-based and backslash defaults (`[`, `]`, `\`).
 * 
 * @danishansari-dev - None
 * @returns {void}
 */
const seedDefaults = () => {
  chrome.storage.local.get(Object.keys(DEFAULT_STORAGE), (values) => {
    if (chrome.runtime.lastError) {
      console.error("[Video Speed Controller] Could not read settings.", chrome.runtime.lastError);
      return;
    }

    const updates = {};

    for (const [key, value] of Object.entries(DEFAULT_STORAGE)) {
      if (values[key] === undefined) {
        updates[key] = value;
      }
    }

    // Check for existing shortcuts and migrate them if they are unchanged from the old defaults.
    // Why this logic exists:
    // We updated the default shortcuts in this release. Users who had the old default keys configured
    // should automatically be transitioned to the new defaults ([ for decrease, ] for increase, \ for reset)
    // while keeping the traditional Shift + . / , as alternative shortcuts.
    const currentShortcuts = values["youtubeSpeedController.shortcuts"];
    if (currentShortcuts) {
      let migrated = false;
      const nextShortcuts = { ...currentShortcuts };

      // Ensure alternative shortcuts (increaseAlt, decreaseAlt) are populated if missing.
      // Why this exists:
      // When users upgrade from a version without alternative shortcuts, we must add these new keys
      // to their settings so they can use both the primary brackets and the traditional Shift + . / , keys.
      if (nextShortcuts.increaseAlt === undefined) {
        nextShortcuts.increaseAlt = { label: "Shift + .", code: "Period", shift: true };
        migrated = true;
      }

      if (nextShortcuts.decreaseAlt === undefined) {
        nextShortcuts.decreaseAlt = { label: "Shift + ,", code: "Comma", shift: true };
        migrated = true;
      }

      if (
        nextShortcuts.increase
        && nextShortcuts.increase.code === "Period"
        && nextShortcuts.increase.shift === true
      ) {
        nextShortcuts.increase = { label: "]", code: "BracketRight" };
        migrated = true;
      }

      if (
        nextShortcuts.decrease
        && nextShortcuts.decrease.code === "Comma"
        && nextShortcuts.decrease.shift === true
      ) {
        nextShortcuts.decrease = { label: "[", code: "BracketLeft" };
        migrated = true;
      }

      if (
        nextShortcuts.reset
        && nextShortcuts.reset.code === "Backspace"
        && nextShortcuts.reset.shift === true
      ) {
        nextShortcuts.reset = { label: "\\", code: "Backslash" };
        migrated = true;
      }

      if (migrated) {
        updates["youtubeSpeedController.shortcuts"] = nextShortcuts;
      }
    }

    if (Object.keys(updates).length) {
      chrome.storage.local.set(updates);
    }
  });
};

const broadcastSettingsChanged = () => {
  const keys = [...pendingChangedKeys];

  pendingChangedKeys = new Set();
  broadcastTimer = 0;

  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) {
      return;
    }

    for (const tab of tabs) {
      if (!tab.id) {
        continue;
      }

      chrome.tabs.sendMessage(tab.id, {
        type: "YSC_STORAGE_CHANGED",
        keys
      }, () => {
        chrome.runtime.lastError;
      });
    }
  });
};

chrome.runtime.onInstalled.addListener(seedDefaults);
chrome.runtime.onStartup.addListener(seedDefaults);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  for (const key of Object.keys(changes)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      pendingChangedKeys.add(key);
    }
  }

  if (!pendingChangedKeys.size || broadcastTimer) {
    return;
  }

  broadcastTimer = setTimeout(broadcastSettingsChanged, 150);
});

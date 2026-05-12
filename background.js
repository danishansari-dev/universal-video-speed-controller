"use strict";

try {
  importScripts("constants.js");
} catch (error) {
  console.error("[Video Speed Controller] Failed to load shared constants.", error);
}

const STORAGE_PREFIX = "youtubeSpeedController.";
const DEFAULT_STORAGE = {
  "youtubeSpeedController.enabled": true,
  "youtubeSpeedController.keyboardEnabled": true,
  "youtubeSpeedController.mouseWheelEnabled": true,
  "youtubeSpeedController.boostEnabled": true,
  "youtubeSpeedController.rememberGlobally": true,
  "youtubeSpeedController.rememberPerSite": true,
  "youtubeSpeedController.autoApplyPreferredSpeed": true,
  "youtubeSpeedController.defaultNativeMode": "override",
  "youtubeSpeedController.siteAccessMode": "all",
  "youtubeSpeedController.startupDefaultSpeed": 1,
  "youtubeSpeedController.playbackRate": 1,
  "youtubeSpeedController.shortcuts": globalThis.YSC_DEFAULT_SHORTCUTS || {}
};

let broadcastTimer = 0;
let pendingChangedKeys = new Set();

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

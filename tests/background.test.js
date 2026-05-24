"use strict";

// Set up worker mock APIs before requiring the background script
global.importScripts = (path) => {
  if (path === "constants.js") {
    require("../constants.js");
  }
};

let storageData = {};
let installedListener = null;
let startupListener = null;
let storageOnChangedListener = null;

// Mock chrome extension API
global.chrome = {
  runtime: {
    lastError: null,
    onInstalled: {
      addListener: (fn) => {
        installedListener = fn;
      }
    },
    onStartup: {
      addListener: (fn) => {
        startupListener = fn;
      }
    }
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(k => {
            result[k] = storageData[k];
          });
        } else if (typeof keys === "string") {
          result[keys] = storageData[keys];
        } else if (keys === null) {
          Object.assign(result, storageData);
        }
        callback(result);
      }),
      set: jest.fn((updates, callback) => {
        Object.assign(storageData, updates);
        if (callback) callback();
      })
    },
    onChanged: {
      addListener: (fn) => {
        storageOnChangedListener = fn;
      }
    }
  },
  tabs: {
    query: jest.fn((queryInfo, callback) => {
      callback([{ id: 1 }, { id: 2 }]);
    }),
    sendMessage: jest.fn((tabId, message, callback) => {
      if (callback) callback({ ok: true });
    })
  }
};

// Require background.js to execute its setup and listener registrations
require("../background.js");

describe("background.js seeding and migration tests", () => {
  beforeEach(() => {
    storageData = {};
    jest.clearAllMocks();
  });

  test("seeds default values when storage is empty", () => {
    // Trigger installed callback (equivalent to first-time install)
    installedListener();

    // Verify storage has defaults seeded
    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(storageData["youtubeSpeedController.enabled"]).toBe(true);
    expect(storageData["youtubeSpeedController.playbackRate"]).toBe(1);
    expect(storageData["youtubeSpeedController.shortcuts"]).toBeDefined();
  });

  test("migrates legacy shortcuts to brackets while maintaining alternates", () => {
    // Seed storage with legacy shortcuts
    storageData["youtubeSpeedController.shortcuts"] = {
      increase: { label: "Shift + .", code: "Period", shift: true },
      decrease: { label: "Shift + ,", code: "Comma", shift: true },
      reset: { label: "Shift + Backspace", code: "Backspace", shift: true }
    };

    // Trigger installation migration
    installedListener();

    const migrated = storageData["youtubeSpeedController.shortcuts"];
    expect(migrated).toBeDefined();
    // Brackets should be set as primary
    expect(migrated.increase.code).toBe("BracketRight");
    expect(migrated.decrease.code).toBe("BracketLeft");
    expect(migrated.reset.code).toBe("Backslash");
    // Alternates should be added
    expect(migrated.increaseAlt.code).toBe("Period");
    expect(migrated.decreaseAlt.code).toBe("Comma");
  });
});

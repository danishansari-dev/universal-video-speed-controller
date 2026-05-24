/**
 * @jest-environment jsdom
 */
"use strict";

const fs = require("fs");
const path = require("path");

let mockState = null;
let mockLocalStorage = {};

describe("popup.js tests", () => {
  beforeAll(() => {
    // 1. Mock Chrome API
    global.chrome = {
      tabs: {
        query: jest.fn((info, callback) => {
          callback([{ id: 123, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }]);
        }),
        sendMessage: jest.fn((tabId, msg, callback) => {
          callback({ ok: true, state: mockState });
        })
      },
      storage: {
        local: {
          get: jest.fn((keys, callback) => {
            callback(mockLocalStorage);
          }),
          set: jest.fn((values, callback) => {
            Object.assign(mockLocalStorage, values);
            if (callback) callback();
          })
        }
      },
      runtime: {
        lastError: null
      }
    };

    // 2. Load constants.js
    require("../constants.js");

    // 3. Load popup.html into the jsdom document body
    const htmlPath = path.resolve(__dirname, "../popup.html");
    const html = fs.readFileSync(htmlPath, "utf8");
    document.documentElement.innerHTML = html;

    // 4. Mock window events that require browser context/extension context
    window.addEventListener = jest.fn();

    // 5. Load and execute popup.js with exports appended for verification
    const scriptPath = path.resolve(__dirname, "../popup.js");
    let scriptContent = fs.readFileSync(scriptPath, "utf8");
    scriptContent += `
      global.test_formatTime = formatTime;
      global.test_formatDuration = formatDuration;
      global.test_clampRate = clampRate;
      global.test_shortcutLabelFromEvent = shortcutLabelFromEvent;
      global.renderState = renderState;
      global.setPopupState = (s) => { state = s; };
    `;
    
    // Evaluate the script in this global environment
    eval(scriptContent);
  });

  beforeEach(() => {
    mockLocalStorage = {
      "youtubeSpeedController.enabled": true,
      "youtubeSpeedController.playbackRate": 1.5,
      "youtubeSpeedController.themeMode": "dark"
    };

    mockState = {
      rate: 1.5,
      enabled: true,
      hasVideo: true,
      status: "Playing",
      video: {
        title: "Rick Astley - Never Gonna Give You Up",
        duration: 212,
        currentTime: 42,
        paused: false
      },
      tab: {
        domain: "youtube.com",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      },
      analytics: {
        timeSavedSeconds: 120,
        dailyUsageSeconds: 300,
        mostUsedSpeed: "1.5x",
        sessionAverageSpeed: 1.5
      },
      settings: {
        enabled: true,
        widgetEnabled: true,
        themeMode: "dark"
      },
      shortcuts: globalThis.YSC_DEFAULT_SHORTCUTS
    };
  });

  test("formatTime formats seconds into human readable duration", () => {
    const formatTime = global.test_formatTime;
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3665)).toBe("1:01:05");
  });

  test("formatDuration formats seconds into simplified minutes/hours description", () => {
    const formatDuration = global.test_formatDuration;
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("1m");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(3700)).toBe("1h 2m");
  });

  test("clampRate restricts playback speed inside boundaries", () => {
    const clampRate = global.test_clampRate;
    expect(clampRate(1)).toBe(1);
    expect(clampRate(0.1)).toBe(0.25);
    expect(clampRate(11)).toBe(10);
    expect(clampRate(1.15)).toBe(1.25); // rounds to nearest 0.25 step
  });

  test("shortcutLabelFromEvent translates KeyboardEvent modifiers and codes", () => {
    const labelFromEvent = global.test_shortcutLabelFromEvent;
    
    expect(labelFromEvent({ code: "KeyS", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })).toBe("Shift + S");
    expect(labelFromEvent({ code: "BracketRight", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe("]");
    expect(labelFromEvent({ code: "KeyA", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })).toBe("Ctrl + Alt + A");
  });

  test("popup syncs state values directly to the DOM elements", () => {
    // Trigger global renderState function defined in popup.js with mock state
    global.setPopupState(mockState);
    global.renderState();

    expect(document.getElementById("speedValue").textContent).toBe("1.5x");
    expect(document.getElementById("videoTitle").textContent).toBe("Rick Astley - Never Gonna Give You Up");
    expect(document.getElementById("currentTime").textContent).toBe("0:42");
    expect(document.getElementById("duration").textContent).toBe("3:32");
    expect(document.getElementById("domainText").textContent).toBe("youtube.com");
    expect(document.getElementById("timeSaved").textContent).toBe("2m");
  });
});

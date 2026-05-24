# Universal Video Speed Controller

A modern Chrome extension for fast, precise HTML5 video playback speed control.

The extension adds a native-feeling floating speed widget on video players and a polished toolbar popup for advanced controls, settings, shortcuts, live video status, and usage insights.

## Features

- Floating `- / speed / +` widget on detected HTML5 video players.
- Speed range from `0.25x` to `10x` in `0.25x` steps.
- Single-click speed changes and press-and-hold acceleration on the widget buttons.
- Premium neutral frosted-glass speed overlay toast in the center of the video player with specular glare reflections, high background blur, and a dynamic progress slider whenever playback speed changes.
- Modern toolbar popup with speed dial, presets, live video info, settings, shortcuts, and analytics.
- Real-time sync with the active video when the popup is open.
- Works with dynamically loaded players and single-page navigation.
- Avoids shortcut triggers while typing in search, comments, inputs, and editable fields.
- Persists preferences with Chrome storage.

## Toolbar Popup

Click the extension icon in the Chrome toolbar to open the popup.

The popup includes:

- Current extension status: `Active`, `Disabled`, or `No video detected`.
- Quick ON/OFF toggle.
- Large speed display with circular dial visualization.
- `+` and `-` controls with press-and-hold acceleration.
- Preset buttons for `0.25x`, `0.5x`, `1x`, `1.5x`, `2x`, `3x`, `5x`, and `10x`.
- Live video title, timestamp, duration, playback speed, and tab domain.
- Smart settings for widget, shortcuts, mouse wheel, boost mode, memory behavior, overlay animation, compact mode, fullscreen-only controls, theme, and startup speed.
- Shortcut manager with editable shortcut cards, reset, search, and conflict warnings.
- Lightweight usage insights such as time saved, most used speed, daily usage, and current session average.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `]` or `Shift + .` | Increase speed by `0.25x` |
| `[` or `Shift + ,` | Decrease speed by `0.25x` |
| `\` | Reset speed to `1x` |
| Hold `X` | Temporarily boost to `2x; release to restore` |
| `Shift + S` | Toggle the floating widget |
| `Shift + H` | Toggle the speed overlay |
| *Customizable* (Unmapped by default) | Preset speed steps (`1x`, `2x`, `3x`, `4x`, `5x`, `10x`) |
| `Ctrl + mouse wheel` | Increase or decrease speed by `0.25x` over the player |

Shortcuts can be fully customized from the popup.

## Floating Widget

The widget appears as a lightweight floating control on detected video players. On YouTube, it still aims to blend with the player chrome.

Controls:

- Click `+` to increase speed once.
- Click `-` to decrease speed once.
- Press and hold `+` or `-` to rapidly step through speeds.
- Click the speed pill to increase by one step.

The widget follows YouTube's hover/autohide behavior and can be hidden from the popup or with `Shift + S`.

## Install Locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder: `D:\Projects\youtube-speed-controller`.
6. Open a page with an HTML5 video.
7. Hover over the video controls or click the extension icon in the toolbar.

After making code changes, click **Reload** on the extension card in `chrome://extensions`.

## Project Files

- `manifest.json` defines the Manifest V3 extension, permissions, popup, icons, service worker, and content scripts.
- `background.js` seeds defaults on install/update and broadcasts storage changes to open tabs.
- `constants.js` stores shared shortcut defaults used by the content script, popup, and service worker.
- `content.js` is the core content script, fully refactored into a high-performance, modular class-based architecture (`SettingsManager`, `DOMObserver`, `VideoController`, `WidgetUI`, `ToastUI`, `ShortcutManager`, `WheelManager`, `AnalyticsManager`, `AppController`).
- `styles.css` styles the in-player widget and YouTube-style overlay.
- `popup.html` defines the toolbar popup markup.
- `popup.css` styles the modern popup UI.
- `popup.js` syncs popup state with the active video tab and persists settings.
- `assets/icons/` contains extension icons referenced by the manifest.
- `assets/store/` contains promotional PNG assets for store listing preparation.

## Architecture & Engineering

This extension is built to meet startup-grade production standards, prioritizing performance, readability, and reliability:

- **Modular Design**: Code is encapsulated within single-responsibility classes under a central orchestrating `AppController`. This allows each manager (Shortcuts, UI, Analytics, Settings) to operate independently.
- **High-Performance DOM Scanning**: Instead of periodic expensive `querySelectorAll("*")` deep scans that trigger CPU spikes and layout thrashing, a custom tree walker traverses the DOM while skipping layout-only nodes. It listens to event-driven mutations to observe shadow roots dynamically, reducing CPU usage to nearly 0%.
- **Zero-Leak Lifecycle & Teardown**: To solve extension context invalidation errors and double-event registrations during hot reloads/updates, the script registers a global `__youtubeSpeedControllerCleanup` callback. It completely tears down previous handlers, MutationObservers, timers, and DOM nodes before starting the new instance.
- **Smooth 60 FPS Layouts**: UI updates, coordinate recalculations, and obstacle avoidance checking (using corner penalties and overlapping rect areas) are debounced and batched using `requestAnimationFrame`.
- **Compositing & Layout Glitch Mitigation**: Forcing hardware-accelerated GPU compositing (`transform: translate3d(0,0,0)`) on primary popup panels prevents Chromium subpixel layout rendering offsets on Windows. Additionally, block-level form fields and scrollbar-hidden containers prevent broken border-radius rendering artifacts.
- **Fault-Tolerant Storage**: All storage queries and runtime actions are wrapped in error boundaries. If context invalidates after an extension reload, storage APIs degrade gracefully to defaults.


## Development Notes

This extension uses plain JavaScript, HTML, and CSS. There is no build step.

Useful validation commands:

```powershell
node --check content.js
node --check popup.js
node --check background.js
node --check constants.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

## Current Limitations

- The popup can only control playback when the active tab has a detected HTML5 video player.
- Some very high playback speeds may depend on browser and YouTube player behavior.
- Visual QA should be done by loading the unpacked extension in Chrome, since Chrome extension popups require the browser extension runtime.

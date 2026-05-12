# YouTube Speed Controller

A modern Chrome extension for fast, precise YouTube playback speed control.

The extension adds a native-feeling floating speed widget beside YouTube's captions button and a polished toolbar popup for advanced controls, settings, shortcuts, live video status, and usage insights.

## Features

- Floating `- / speed / +` widget inside YouTube's bottom-right player controls.
- Speed range from `0.25x` to `10x` in `0.25x` steps.
- Single-click speed changes and press-and-hold acceleration on the widget buttons.
- YouTube-style centered speed overlay whenever playback speed changes.
- Modern toolbar popup with speed dial, presets, live video info, settings, shortcuts, and analytics.
- Real-time sync with the active YouTube video when the popup is open.
- Works with YouTube's single-page navigation and dynamically loaded players.
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
| `Shift + .` | Increase speed by `0.25x` |
| `Shift + ,` | Decrease speed by `0.25x` |
| `Alt + 1` | Set speed to `1x` |
| `Alt + 2` | Set speed to `2x` |
| `Alt + 3` | Set speed to `3x` |
| `Alt + 4` | Set speed to `4x` |
| `Alt + 5` | Set speed to `5x` |
| `Alt + 0` | Set speed to `10x` |
| `Shift + Backspace` | Reset speed to `1x` |
| Hold `X` | Temporarily boost to `2x`; release to restore |
| `Shift + S` | Toggle the floating widget |
| `Shift + H` | Toggle the speed overlay |
| `Ctrl + mouse wheel` | Increase or decrease speed by `0.25x` over the player |

Shortcuts can be edited from the popup.

## Floating Widget

The widget is inserted into YouTube's native player controls beside the captions button when available. If captions are not present, it falls back near the settings button.

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
6. Open a YouTube video.
7. Hover over the video controls or click the extension icon in the toolbar.

After making code changes, click **Reload** on the extension card in `chrome://extensions`.

## Project Files

- `manifest.json` defines the Manifest V3 extension, permissions, popup, and YouTube content script.
- `content.js` injects the floating widget, manages playback speed, shortcuts, settings, popup messaging, and analytics.
- `styles.css` styles the in-player widget and YouTube-style overlay.
- `popup.html` defines the toolbar popup markup.
- `popup.css` styles the modern popup UI.
- `popup.js` syncs popup state with the active YouTube tab and persists settings.

## Development Notes

This extension uses plain JavaScript, HTML, and CSS. There is no build step.

Useful validation commands:

```powershell
node --check content.js
node --check popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

## Current Limitations

- The popup can only control playback when the active tab is a YouTube page with a detected video player.
- Some very high playback speeds may depend on browser and YouTube player behavior.
- Visual QA should be done by loading the unpacked extension in Chrome, since Chrome extension popups require the browser extension runtime.

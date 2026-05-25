"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tempDir = path.join(os.tmpdir(), "uvsc-brand-assets");

const chromeCandidates = [
  process.env.CHROME_PATH,
  path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env.LocalAppData || "", "Google", "Chrome", "Application", "chrome.exe")
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error("Google Chrome was not found. Set CHROME_PATH to render brand assets.");
}

fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });

const toFileUrl = (filePath) => `file:///${filePath.replace(/\\/g, "/").replace(/ /g, "%20")}`;

const ensureParentDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const escapeAttr = (value) => String(value).replace(/"/g, "&quot;");

const readPngSize = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
};

const logoSvg = (className = "") => `
  <svg class="logo-svg ${className}" viewBox="0 0 1024 1024" aria-hidden="true">
    <circle cx="512" cy="512" r="452" fill="#080a0f"></circle>
    <circle cx="512" cy="512" r="452" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="30"></circle>
    <path d="M276 722a348 348 0 1 1 486 0" fill="none" stroke="#ff315a" stroke-width="104" stroke-linecap="round"></path>
    <path d="M420 322v380l292-190z" fill="#f8fbff"></path>
  </svg>
`;

const brandBlock = (modifier = "", name = "Universal Video Speed Controller", tagline = "Premium control for HTML5 video") => `
  <div class="brand-lockup ${modifier}">
    ${logoSvg("brand-logo")}
    <div>
      <strong>${name}</strong>
      <span>${tagline}</span>
    </div>
  </div>
`;

const speedGauge = (value = "3x", label = "Playback speed") => `
  <div class="speed-gauge">
    <div class="speed-gauge-inner">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  </div>
`;

const featureCard = ({ title, text, tone = "accent", key = "" }) => `
  <div class="feature-card">
    <span class="feature-dot ${tone}"></span>
    <div>
      <strong>${title}</strong>
      <p>${text}</p>
    </div>
    ${key ? `<kbd>${key}</kbd>` : ""}
  </div>
`;

const compactControl = (style = "") => `
  <div class="compact-control" style="${escapeAttr(style)}">
    <div class="compact-head">
      ${logoSvg("compact-logo")}
      <span>Universal Speed</span>
      <i></i>
    </div>
    <div class="compact-body">
      <button>-</button>
      ${speedGauge("3x")}
      <button>+</button>
    </div>
    <div class="compact-presets">
      <span>0.5x</span><span>1x</span><span class="active">3x</span><span>5x</span>
    </div>
  </div>
`;

const popupMock = (variant = "control", style = "", className = "") => {
  const tabs = ["Control", "Shortcuts", "Site", "Settings", "Insights"];
  const active = {
    control: "Control",
    shortcuts: "Shortcuts",
    settings: "Settings",
    insights: "Insights"
  }[variant] || "Control";

  const body = {
    control: `
      <div class="popup-speed-panel">
        <button>-</button>
        ${speedGauge("3x")}
        <button>+</button>
      </div>
      <div class="popup-preset-grid">
        <span>0.25x</span><span>0.5x</span><span>1x</span><span>1.5x</span>
        <span>2x</span><span class="active">3x</span><span>5x</span><span>10x</span>
      </div>
      <div class="popup-now">
        <div><b>Now Playing</b><em>Playing</em></div>
        <p>Product demo video for focused playback</p>
        <div class="mini-progress"><i></i></div>
      </div>
    `,
    shortcuts: `
      <div class="popup-list-head"><b>Shortcuts</b><span>Editable</span></div>
      ${["Increase speed", "Decrease speed", "Reset speed", "Temporary boost", "Toggle overlay"].map((label, index) => `
        <div class="popup-row">
          <span>${label}<small>Click keycap to edit</small></span>
          <kbd>${["]", "[", "\\", "X", "Shift H"][index]}</kbd>
        </div>
      `).join("")}
    `,
    settings: `
      <div class="popup-list-head"><b>Smart Settings</b><span>Synced</span></div>
      <div class="popup-toggle-grid">
        ${[
          ["Floating widget", true],
          ["Wheel / pinch", true],
          ["Per website", true],
          ["Overlay", true],
          ["Per channel", false],
          ["Fullscreen only", false]
        ].map(([label, enabled]) => `
          <div class="toggle-tile">
            <i class="${enabled ? "on" : ""}"></i>
            <span>${label}<small>${enabled ? "Enabled" : "Optional"}</small></span>
          </div>
        `).join("")}
      </div>
    `,
    insights: `
      <div class="popup-list-head"><b>Usage Insights</b><span>Local</span></div>
      <div class="popup-metrics">
        <div><span>Saved</span><strong>42m</strong></div>
        <div><span>Most used</span><strong>2x</strong></div>
        <div><span>Today</span><strong>18m</strong></div>
        <div><span>Average</span><strong>2.25x</strong></div>
      </div>
      <div class="popup-bars"><i style="height:34%"></i><i style="height:62%"></i><i style="height:48%"></i><i style="height:78%"></i><i style="height:56%"></i></div>
    `
  }[variant];

  return `
    <div class="popup-mock ${className}" style="${escapeAttr(style)}">
      <div class="popup-top">
        ${logoSvg("popup-logo")}
        <div><b>Universal Speed</b><span><i></i>Active</span></div>
        <div class="mock-toggle"></div>
      </div>
      <div class="popup-tabs">
        ${tabs.map((tab) => `<span class="${tab === active ? "active" : ""}">${tab}</span>`).join("")}
      </div>
      ${body}
    </div>
  `;
};

const browserMock = ({ style = "", className = "", overlay = false, sidebar = true, inline = true } = {}) => `
  <div class="browser-mock ${className}" style="${escapeAttr(style)}">
    <div class="browser-bar">
      <div class="window-dots"><i></i><i></i><i></i></div>
      <div class="address">video.example/player/html5</div>
      <div class="browser-actions"><i></i><i></i></div>
    </div>
    <div class="browser-page">
      <div class="video-area">
        <div class="video-scene">
          <div class="scene-grid"></div>
          <div class="play-mark"></div>
          <div class="scene-panel one"></div>
          <div class="scene-panel two"></div>
        </div>
        ${inline ? `<div class="video-widget"><span>Speed</span><strong>3x</strong><i></i></div>` : ""}
        ${overlay ? `<div class="video-toast"><strong>3.75x</strong><span>Playback speed</span><i></i></div>` : ""}
        <div class="player-line"><span></span></div>
      </div>
      ${sidebar ? `
        <div class="video-sidebar">
          <b>Up next</b>
          <i></i><i></i><i></i><i></i>
        </div>
      ` : ""}
    </div>
  </div>
`;

const shortcutPanel = (style = "") => `
  <div class="shortcut-panel" style="${escapeAttr(style)}">
    <div class="panel-title"><b>Shortcut Manager</b><span>No conflicts</span></div>
    <div class="search-pill">Search shortcuts</div>
    ${[
      ["Increase speed", "]"],
      ["Decrease speed", "["],
      ["Reset speed", "\\"],
      ["Temporary boost", "X"],
      ["Toggle widget", "Shift S"],
      ["Toggle overlay", "Shift H"]
    ].map(([label, key]) => `
      <div class="shortcut-line"><span>${label}<small>Click keycap to edit</small></span><kbd>${key}</kbd></div>
    `).join("")}
  </div>
`;

const sitePanel = (style = "") => `
  <div class="settings-focus-panel site-focus" style="${escapeAttr(style)}">
    <div class="panel-title"><b>Website Rules</b><span>Per domain</span></div>
    <div class="domain-pill">video.example</div>
    <div class="select-row"><span>Speed control mode</span><b>Sync with native</b></div>
    <div class="select-row"><span>Access mode</span><b>All websites</b></div>
    <div class="host-list"><i>learning.example</i><i>studio.example</i></div>
  </div>
`;

const settingsFocusPanel = (style = "") => `
  <div class="settings-focus-panel" style="${escapeAttr(style)}">
    <div class="panel-title"><b>Smart Settings</b><span>Essential</span></div>
    ${[
      ["Wheel / pinch", "Mouse wheel and pinch in / pinch out gesture"],
      ["Per website", "Remember domain speeds"],
      ["Floating widget", "Inline video controls"],
      ["Overlay", "Quiet speed feedback"],
      ["Auto apply", "New players use saved speed"]
    ].map(([title, text]) => `
      <div class="setting-focus-row"><i></i><span>${title}<small>${text}</small></span></div>
    `).join("")}
  </div>
`;

const analyticsDashboard = (style = "") => `
  <div class="analytics-dashboard" style="${escapeAttr(style)}">
    <div class="panel-title"><b>Playback Insights</b><span>Stored locally</span></div>
    <div class="analytics-layout">
      <div class="large-ring"><strong>42m</strong><span>Time saved</span></div>
      <div class="analytics-copy">
        <h3>Speed that compounds</h3>
        <p>See which speeds actually save time across your daily sessions.</p>
      </div>
    </div>
    <div class="bar-chart">
      ${["1x", "1.5x", "2x", "2.5x", "3x", "5x"].map((label, index) => `
        <div><i style="height:${[28, 52, 78, 64, 42, 22][index]}%"></i><span>${label}</span></div>
      `).join("")}
    </div>
    <div class="metric-strip">
      <div><span>Today</span><b>18m</b></div>
      <div><span>Most used</span><b>2x</b></div>
      <div><span>Average</span><b>2.25x</b></div>
    </div>
  </div>
`;

const frame = ({ id, width, height, transparent = false, body }) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=${width}, initial-scale=1">
    <style>
      :root {
        --bg: #08090d;
        --panel: rgba(18, 20, 28, .88);
        --panel-strong: rgba(26, 29, 38, .94);
        --soft: rgba(255, 255, 255, .07);
        --line: rgba(255, 255, 255, .09);
        --text: #f7f8fb;
        --muted: rgba(247, 248, 251, .68);
        --quiet: rgba(247, 248, 251, .48);
        --accent: #ff315a;
        --cyan: #3fd5e8;
        --green: #35d99d;
        --violet: #8b5cf6;
      }

      * { box-sizing: border-box; }

      html,
      body {
        width: ${width}px;
        height: ${height}px;
        margin: 0;
        overflow: hidden;
      }

      body {
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
        background: ${transparent ? "transparent" : "var(--bg)"};
      }

      .asset {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background:
          radial-gradient(circle at 16% -8%, rgba(255, 49, 90, .16), transparent 36%),
          radial-gradient(circle at 100% 0%, rgba(63, 213, 232, .1), transparent 32%),
          linear-gradient(135deg, #090a0f 0%, #11131b 58%, #090b10 100%);
      }

      .asset::after {
        position: absolute;
        inset: 0;
        content: "";
        pointer-events: none;
        background-image: radial-gradient(rgba(255, 255, 255, .32) .5px, transparent .5px);
        background-size: 4px 4px;
        opacity: .035;
      }

      .asset > * { position: relative; z-index: 1; }

      .logo-svg { display: block; overflow: visible; }
      .icon-stage {
        display: grid;
        width: ${width}px;
        height: ${height}px;
        place-items: center;
        background: transparent;
      }
      .icon-stage .logo-svg {
        width: ${Math.min(width, height)}px;
        height: ${Math.min(width, height)}px;
      }

      .brand-lockup {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .brand-logo {
        width: 56px;
        height: 56px;
        filter: drop-shadow(0 12px 22px rgba(255, 49, 90, .16));
      }
      .brand-lockup strong {
        display: block;
        font-size: 28px;
        font-weight: 780;
        letter-spacing: 0;
        line-height: 1;
      }
      .brand-lockup span {
        display: block;
        margin-top: 5px;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.1;
      }
      .brand-lockup.small .brand-logo {
        width: 34px;
        height: 34px;
      }
      .brand-lockup.small strong {
        font-size: 15px;
      }
      .brand-lockup.small span {
        display: none;
      }

      h1 {
        margin: 0;
        color: var(--text);
        font-size: 58px;
        font-weight: 790;
        letter-spacing: 0;
        line-height: 1.05;
      }
      .subcopy {
        margin-top: 18px;
        max-width: 600px;
        color: var(--muted);
        font-size: 25px;
        font-weight: 420;
        line-height: 1.34;
      }

      .feature-card {
        display: grid;
        grid-template-columns: 16px 1fr auto;
        align-items: center;
        min-height: 74px;
        padding: 16px 18px;
        gap: 14px;
        border-radius: 16px;
        background: rgba(255, 255, 255, .07);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .06), 0 16px 32px rgba(0, 0, 0, .2);
      }
      .feature-card strong {
        display: block;
        font-size: 20px;
        font-weight: 740;
        line-height: 1.1;
      }
      .feature-card p {
        margin: 7px 0 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.2;
      }
      .feature-dot {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent);
      }
      .feature-dot.cyan { background: var(--cyan); }
      .feature-dot.green { background: var(--green); }
      .feature-dot.violet { background: var(--violet); }
      kbd {
        min-width: 74px;
        padding: 11px 14px;
        border-radius: 12px;
        color: var(--text);
        background: rgba(255, 255, 255, .12);
        font: 700 15px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        text-align: center;
        box-shadow: inset 0 -2px 0 rgba(0, 0, 0, .24);
      }

      .speed-gauge {
        display: grid;
        width: 116px;
        height: 116px;
        padding: 11px;
        border-radius: 50%;
        place-items: center;
        background: conic-gradient(var(--accent) 0 104deg, rgba(255, 255, 255, .12) 104deg 360deg);
        box-shadow: 0 18px 36px rgba(0, 0, 0, .26);
      }
      .speed-gauge-inner {
        display: grid;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        place-items: center;
        align-content: center;
        background: #191c24;
      }
      .speed-gauge strong {
        font-size: 34px;
        font-weight: 820;
        line-height: 1;
      }
      .speed-gauge span {
        margin-top: 5px;
        color: var(--muted);
        font-size: 11px;
      }

      .browser-mock {
        position: absolute;
        width: 640px;
        height: 420px;
        overflow: hidden;
        border-radius: 24px;
        background: #08090d;
        box-shadow: 0 34px 70px rgba(0, 0, 0, .38), inset 0 0 0 1px rgba(255, 255, 255, .1);
      }
      .browser-bar {
        display: flex;
        align-items: center;
        height: 42px;
        padding: 0 16px;
        gap: 14px;
        background: rgba(255, 255, 255, .06);
      }
      .window-dots {
        display: flex;
        gap: 6px;
      }
      .window-dots i,
      .browser-actions i {
        display: block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255, 255, 255, .28);
      }
      .address {
        flex: 1;
        min-width: 0;
        padding: 7px 12px;
        border-radius: 999px;
        color: rgba(255, 255, 255, .56);
        background: rgba(0, 0, 0, .28);
        font-size: 12px;
      }
      .browser-actions {
        display: flex;
        gap: 8px;
      }
      .browser-page {
        display: grid;
        grid-template-columns: 1fr 150px;
        height: calc(100% - 42px);
        gap: 16px;
        padding: 16px;
      }
      .browser-mock.no-sidebar .browser-page {
        grid-template-columns: 1fr;
      }
      .video-area {
        position: relative;
        overflow: hidden;
        min-width: 0;
        border-radius: 18px;
        background: #0d1118;
      }
      .video-scene {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background:
          radial-gradient(circle at 26% 24%, rgba(63, 213, 232, .26), transparent 24%),
          radial-gradient(circle at 72% 45%, rgba(255, 49, 90, .2), transparent 28%),
          linear-gradient(135deg, #141b25, #0c1018 62%, #161827);
      }
      .scene-grid {
        position: absolute;
        inset: 0;
        opacity: .2;
        background-image: linear-gradient(rgba(255, 255, 255, .12) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, .12) 1px, transparent 1px);
        background-size: 46px 46px;
      }
      .play-mark {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: rgba(255, 255, 255, .1);
        transform: translate(-50%, -50%);
      }
      .play-mark::after {
        position: absolute;
        top: 34px;
        left: 45px;
        content: "";
        border-top: 26px solid transparent;
        border-bottom: 26px solid transparent;
        border-left: 40px solid rgba(255, 255, 255, .92);
      }
      .scene-panel {
        position: absolute;
        border-radius: 24px;
        background: rgba(255, 255, 255, .1);
      }
      .scene-panel.one {
        right: 48px;
        bottom: 70px;
        width: 150px;
        height: 72px;
      }
      .scene-panel.two {
        left: 42px;
        top: 48px;
        width: 190px;
        height: 88px;
      }
      .video-widget {
        position: absolute;
        right: 32px;
        bottom: 76px;
        width: 104px;
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(16, 18, 24, .72);
        box-shadow: 0 18px 36px rgba(0, 0, 0, .28), inset 0 1px 0 rgba(255, 255, 255, .1);
      }
      .video-widget span {
        display: block;
        color: var(--quiet);
        font-size: 10px;
        font-weight: 740;
        letter-spacing: .06em;
        text-transform: uppercase;
      }
      .video-widget strong {
        display: block;
        margin-top: 4px;
        font-size: 25px;
        line-height: 1;
      }
      .video-widget i,
      .video-toast i {
        display: block;
        height: 4px;
        margin-top: 12px;
        border-radius: 999px;
        background: linear-gradient(90deg, #fff 48%, rgba(255, 255, 255, .18) 48%);
      }
      .video-toast {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 144px;
        padding: 16px;
        border-radius: 16px;
        background: rgba(13, 15, 20, .72);
        box-shadow: 0 20px 42px rgba(0, 0, 0, .36), inset 0 1px 0 rgba(255, 255, 255, .1);
        transform: translate(-50%, -50%);
        text-align: center;
      }
      .video-toast strong {
        display: block;
        font-size: 32px;
        line-height: 1;
      }
      .video-toast span {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
      }
      .player-line {
        position: absolute;
        right: 24px;
        bottom: 28px;
        left: 24px;
        height: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .16);
      }
      .player-line span {
        display: block;
        width: 48%;
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
      }
      .video-sidebar {
        display: grid;
        align-content: start;
        gap: 12px;
      }
      .video-sidebar b {
        color: var(--muted);
        font-size: 13px;
      }
      .video-sidebar i {
        height: 54px;
        border-radius: 12px;
        background: rgba(255, 255, 255, .08);
      }

      .popup-mock {
        position: absolute;
        width: 356px;
        overflow: hidden;
        padding: 10px;
        border-radius: 26px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .05), transparent),
          rgba(14, 16, 22, .94);
        box-shadow: 0 32px 72px rgba(0, 0, 0, .42), inset 0 0 0 1px rgba(255, 255, 255, .11);
      }
      .popup-top {
        display: grid;
        grid-template-columns: 40px 1fr 46px;
        align-items: center;
        height: 58px;
        padding: 0 10px;
        gap: 10px;
        border-radius: 18px;
        background: linear-gradient(90deg, rgba(255, 49, 90, .14), rgba(63, 213, 232, .08));
      }
      .popup-logo,
      .compact-logo {
        width: 36px;
        height: 36px;
      }
      .popup-top b {
        display: block;
        font-size: 16px;
        line-height: 1;
      }
      .popup-top span {
        display: flex;
        align-items: center;
        margin-top: 5px;
        gap: 5px;
        color: var(--muted);
        font-size: 11px;
      }
      .popup-top span i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--green);
      }
      .mock-toggle {
        width: 46px;
        height: 28px;
        border-radius: 999px;
        background: var(--accent);
      }
      .mock-toggle::after {
        display: block;
        width: 22px;
        height: 22px;
        margin: 3px 3px 3px auto;
        border-radius: 50%;
        background: #fff;
        content: "";
      }
      .popup-tabs {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px;
        margin-top: 10px;
        padding: 4px;
        border-radius: 14px;
        background: rgba(255, 255, 255, .05);
      }
      .popup-tabs span {
        padding: 10px 4px;
        border-radius: 10px;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        text-align: center;
      }
      .popup-tabs .active {
        color: var(--text);
        background: rgba(255, 255, 255, .12);
      }
      .popup-speed-panel {
        display: grid;
        grid-template-columns: 48px 1fr 48px;
        align-items: center;
        justify-items: center;
        margin-top: 10px;
        padding: 20px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, .045);
      }
      .popup-speed-panel button,
      .compact-body button {
        display: grid;
        width: 46px;
        height: 46px;
        border: 0;
        border-radius: 50%;
        place-items: center;
        color: var(--text);
        background: rgba(255, 255, 255, .1);
        font-size: 22px;
      }
      .popup-preset-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-top: 10px;
      }
      .popup-preset-grid span {
        padding: 12px 0;
        border-radius: 12px;
        background: rgba(255, 255, 255, .08);
        color: var(--muted);
        font-size: 12px;
        text-align: center;
      }
      .popup-preset-grid .active {
        color: #fff;
        background: var(--accent);
      }
      .popup-now,
      .popup-row,
      .toggle-tile,
      .popup-metrics div {
        border-radius: 14px;
        background: rgba(255, 255, 255, .065);
      }
      .popup-now {
        margin-top: 10px;
        padding: 14px;
      }
      .popup-now div {
        display: flex;
        justify-content: space-between;
        color: var(--muted);
        font-size: 11px;
      }
      .popup-now b {
        color: var(--text);
        font-size: 12px;
      }
      .popup-now p {
        margin: 10px 0;
        font-size: 13px;
        font-weight: 690;
      }
      .mini-progress {
        height: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .12);
      }
      .mini-progress i {
        display: block;
        width: 42%;
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
      }
      .popup-list-head,
      .panel-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: var(--muted);
      }
      .popup-list-head {
        margin: 14px 4px 10px;
      }
      .popup-list-head b,
      .panel-title b {
        color: var(--text);
        font-size: 15px;
      }
      .popup-list-head span,
      .panel-title span {
        font-size: 12px;
      }
      .popup-row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        margin-top: 8px;
        padding: 12px;
        gap: 10px;
      }
      .popup-row span,
      .toggle-tile span {
        font-size: 13px;
        font-weight: 710;
      }
      .popup-row small,
      .toggle-tile small,
      .setting-focus-row small,
      .shortcut-line small {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 450;
      }
      .popup-toggle-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .toggle-tile {
        display: grid;
        grid-template-columns: 34px 1fr;
        align-items: center;
        min-height: 62px;
        padding: 10px;
        gap: 10px;
      }
      .toggle-tile i {
        width: 34px;
        height: 20px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .16);
      }
      .toggle-tile i.on {
        background: var(--accent);
      }
      .popup-metrics {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .popup-metrics div {
        padding: 14px;
      }
      .popup-metrics span {
        display: block;
        color: var(--muted);
        font-size: 11px;
      }
      .popup-metrics strong {
        display: block;
        margin-top: 6px;
        font-size: 20px;
      }
      .popup-bars {
        display: flex;
        align-items: end;
        height: 86px;
        margin-top: 10px;
        padding: 14px;
        gap: 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, .045);
      }
      .popup-bars i {
        flex: 1;
        border-radius: 999px 999px 0 0;
        background: linear-gradient(180deg, var(--cyan), var(--accent));
      }

      .compact-control {
        position: absolute;
        width: 224px;
        padding: 10px;
        border-radius: 22px;
        background: rgba(14, 16, 22, .95);
        box-shadow: 0 28px 58px rgba(0, 0, 0, .38), inset 0 0 0 1px rgba(255, 255, 255, .1);
      }
      .compact-head {
        display: grid;
        grid-template-columns: 34px 1fr 36px;
        align-items: center;
        gap: 8px;
      }
      .compact-head span {
        font-size: 13px;
        font-weight: 760;
      }
      .compact-head i {
        width: 36px;
        height: 22px;
        border-radius: 999px;
        background: var(--accent);
      }
      .compact-body {
        display: grid;
        grid-template-columns: 38px 1fr 38px;
        align-items: center;
        justify-items: center;
        margin-top: 12px;
      }
      .compact-body .speed-gauge {
        width: 96px;
        height: 96px;
      }
      .compact-body .speed-gauge strong {
        font-size: 29px;
      }
      .compact-body .speed-gauge span {
        font-size: 9px;
      }
      .compact-body button {
        width: 38px;
        height: 38px;
      }
      .compact-presets {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin-top: 12px;
      }
      .compact-presets span {
        padding: 8px 0;
        border-radius: 9px;
        background: rgba(255, 255, 255, .08);
        color: var(--muted);
        font-size: 10px;
        text-align: center;
      }
      .compact-presets .active {
        color: #fff;
        background: var(--accent);
      }

      .shortcut-panel,
      .settings-focus-panel,
      .analytics-dashboard {
        position: absolute;
        padding: 22px;
        border-radius: 24px;
        background: rgba(15, 17, 24, .9);
        box-shadow: 0 28px 64px rgba(0, 0, 0, .32), inset 0 0 0 1px rgba(255, 255, 255, .08);
      }
      .search-pill {
        margin-top: 18px;
        padding: 14px 16px;
        border-radius: 14px;
        color: var(--quiet);
        background: rgba(255, 255, 255, .07);
      }
      .shortcut-line {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        margin-top: 10px;
        padding: 14px 16px;
        gap: 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, .065);
      }
      .shortcut-line span {
        font-size: 16px;
        font-weight: 720;
      }

      .domain-pill {
        display: inline-flex;
        margin-top: 18px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .08);
        font-size: 16px;
        font-weight: 720;
      }
      .select-row,
      .setting-focus-row {
        margin-top: 14px;
        border-radius: 16px;
        background: rgba(255, 255, 255, .065);
      }
      .select-row {
        padding: 16px;
      }
      .select-row span {
        display: block;
        color: var(--muted);
        font-size: 13px;
      }
      .select-row b {
        display: block;
        margin-top: 7px;
        font-size: 17px;
      }
      .host-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        margin-top: 14px;
        gap: 10px;
      }
      .host-list i {
        padding: 14px;
        border-radius: 14px;
        color: var(--muted);
        background: rgba(255, 255, 255, .045);
        font-style: normal;
      }
      .setting-focus-row {
        display: grid;
        grid-template-columns: 40px 1fr;
        align-items: center;
        min-height: 72px;
        padding: 14px;
        gap: 14px;
      }
      .setting-focus-row i {
        width: 40px;
        height: 24px;
        border-radius: 999px;
        background: var(--accent);
      }
      .setting-focus-row span {
        font-size: 17px;
        font-weight: 740;
      }

      .analytics-layout {
        display: grid;
        grid-template-columns: 170px 1fr;
        align-items: center;
        margin-top: 20px;
        gap: 24px;
      }
      .large-ring {
        display: grid;
        width: 170px;
        height: 170px;
        padding: 16px;
        border-radius: 50%;
        place-items: center;
        align-content: center;
        background: conic-gradient(var(--accent) 0 258deg, rgba(255, 255, 255, .1) 258deg 360deg);
      }
      .large-ring::before {
        position: absolute;
        content: "";
      }
      .large-ring strong {
        display: block;
        width: 100%;
        padding-top: 50px;
        border-radius: 50%;
        font-size: 40px;
        line-height: 1;
        text-align: center;
      }
      .large-ring span {
        display: block;
        width: 100%;
        margin-top: 8px;
        color: var(--muted);
        font-size: 15px;
        text-align: center;
      }
      .analytics-copy h3 {
        margin: 0;
        font-size: 30px;
        line-height: 1.06;
      }
      .analytics-copy p {
        margin: 12px 0 0;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.36;
      }
      .bar-chart {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        align-items: end;
        height: 106px;
        margin-top: 20px;
        gap: 14px;
      }
      .bar-chart div {
        display: grid;
        height: 100%;
        align-items: end;
        gap: 9px;
      }
      .bar-chart i {
        display: block;
        min-height: 18px;
        border-radius: 999px 999px 4px 4px;
        background: linear-gradient(180deg, var(--cyan), var(--accent));
      }
      .bar-chart span {
        color: var(--muted);
        font-size: 12px;
        text-align: center;
      }
      .metric-strip {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-top: 16px;
      }
      .metric-strip div {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, .065);
      }
      .metric-strip span {
        display: block;
        color: var(--muted);
        font-size: 13px;
      }
      .metric-strip b {
        display: block;
        margin-top: 6px;
        font-size: 24px;
      }

      .asset-promo-small .brand-lockup {
        position: absolute;
        top: 24px;
        left: 24px;
      }
      .asset-promo-small h1 {
        position: absolute;
        top: 78px;
        left: 24px;
        width: 168px;
        font-size: 30px;
        line-height: 1.04;
      }
      .asset-promo-wide .brand-lockup {
        position: absolute;
        top: 62px;
        left: 76px;
      }
      .asset-promo-wide h1 {
        position: absolute;
        top: 178px;
        left: 76px;
        width: 500px;
      }
      .asset-promo-wide .subcopy {
        position: absolute;
        top: 314px;
        left: 76px;
        width: 460px;
      }
      .asset-main .brand-lockup {
        position: absolute;
        top: 64px;
        left: 72px;
      }
      .asset-main h1 {
        position: absolute;
        top: 174px;
        left: 72px;
        width: 580px;
      }
      .asset-main .subcopy {
        position: absolute;
        top: 366px;
        left: 72px;
        width: 560px;
      }
      .feature-rail {
        position: absolute;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
      }
      .feature-rail.three {
        grid-template-columns: repeat(3, 1fr);
      }
      .section-title {
        position: absolute;
      }
      .section-title h1 {
        position: static;
        width: auto;
      }
      .section-title p {
        margin-top: 16px;
        color: var(--muted);
        font-size: 25px;
        line-height: 1.34;
      }
      .asset-overlay .video-toast {
        left: 42%;
        top: 57%;
        width: 176px;
        padding: 20px 22px;
        border-radius: 18px;
      }
      .asset-overlay .video-toast strong {
        font-size: 40px;
      }
      .asset-overlay .video-toast span {
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    ${transparent ? body : `<main class="asset asset-${id}">${body}</main>`}
  </body>
</html>`;

const assets = [
  ...[16, 32, 48, 128].map((size) => ({
    id: `icon-${size}`,
    width: size,
    height: size,
    transparent: true,
    out: path.join("assets", "icons", `icon-${size}.png`),
    body: `<div class="icon-stage">${logoSvg()}</div>`
  })),
  {
    id: "logo-transparent",
    width: 1024,
    height: 1024,
    transparent: true,
    out: path.join("assets", "icons", "logo-transparent.png"),
    body: `<div class="icon-stage">${logoSvg()}</div>`
  },
  {
    id: "icon-preview-strip",
    width: 196,
    height: 64,
    transparent: true,
    out: path.join("assets", "icons", "icon-preview-strip.png"),
    body: `
      <div class="icon-stage" style="display:flex;gap:12px;align-items:center;justify-content:center;background:transparent;">
        ${[16, 32, 48, 56].map((size) => `<div style="width:${size}px;height:${size}px">${logoSvg()}</div>`).join("")}
      </div>
    `
  },
  {
    id: "promo-small",
    width: 440,
    height: 280,
    out: path.join("assets", "store", "promo-440x280.png"),
    body: `
      ${brandBlock("small", "Universal Speed")}
      <h1>Speed control<br>for every video</h1>
      ${browserMock({ style: "right:-150px;top:46px;width:318px;height:212px;", className: "no-sidebar", sidebar: false })}
      ${compactControl("right:16px;top:58px;")}
    `
  },
  {
    id: "promo-wide",
    width: 1400,
    height: 560,
    out: path.join("assets", "store", "promo-1400x560.png"),
    body: `
      ${brandBlock()}
      <h1>Speed control for every input</h1>
      <p class="subcopy">Popup presets, shortcuts, mouse wheel, and pinch in / pinch out.</p>
      ${browserMock({ style: "right:118px;top:62px;width:600px;height:406px;" })}
      ${popupMock("control", "right:76px;top:42px;width:332px;")}
      <div class="feature-rail three" style="left:76px;bottom:32px;width:674px;">
        ${featureCard({ title: "Keyboard", text: "Editable speed steps", key: "] / [", tone: "violet" })}
        ${featureCard({ title: "Mouse wheel", text: "Control while hovering", tone: "cyan" })}
        ${featureCard({ title: "Pinch in / out", text: "Pinch in / pinch out", tone: "green" })}
      </div>
    `
  },
  {
    id: "main",
    width: 1280,
    height: 800,
    out: path.join("assets", "store", "promo-1280x800.png"),
    body: `
      ${brandBlock()}
      <h1>Universal speed control for any video</h1>
      <p class="subcopy">Shortcuts, gestures, smart rules,<br>and fullscreen feedback.</p>
      ${browserMock({ style: "right:102px;top:116px;width:616px;height:424px;" })}
      ${popupMock("control", "right:78px;top:96px;width:350px;")}
      <div class="feature-rail" style="left:72px;right:72px;bottom:64px;">
        ${featureCard({ title: "0.25x to 10x", text: "Fine-grained speed range" })}
        ${featureCard({ title: "Pinch gesture", text: "Pinch in / pinch out", tone: "green" })}
        ${featureCard({ title: "Site memory", text: "Rules per domain", tone: "cyan" })}
        ${featureCard({ title: "Local insights", text: "Private usage stats", tone: "violet" })}
      </div>
    `
  },
  {
    id: "control",
    width: 1280,
    height: 800,
    out: path.join("assets", "store", "screenshot-01-control-1280x800.png"),
    body: `
      <div class="section-title" style="left:72px;top:78px;width:620px;">
        <h1>Precise speed control</h1>
        <p>Jump between presets, nudge by 0.25x, and see the active speed instantly.</p>
      </div>
      ${browserMock({ style: "left:72px;top:304px;width:642px;height:346px;" })}
      ${popupMock("control", "right:92px;top:118px;width:342px;")}
      <div class="feature-rail three" style="left:120px;bottom:56px;width:714px;">
        ${featureCard({ title: "Active speed", text: "3x selected" })}
        ${featureCard({ title: "Domain memory", text: "video.example", tone: "cyan" })}
        ${featureCard({ title: "Fast presets", text: "0.25x through 10x", tone: "green" })}
      </div>
    `
  },
  {
    id: "shortcuts",
    width: 1280,
    height: 800,
    out: path.join("assets", "store", "screenshot-02-shortcuts-1280x800.png"),
    body: `
      ${shortcutPanel("left:80px;top:112px;width:430px;height:566px;")}
      <div class="section-title" style="left:580px;top:108px;width:560px;">
        <h1>Speed control for every input</h1>
        <p>Choose the fastest control method for the way you are watching.</p>
      </div>
      <div class="feature-rail" style="left:580px;top:304px;width:560px;grid-template-columns:1fr;gap:14px;">
        ${featureCard({ title: "Keyboard speed steps", text: "Increase or decrease by 0.25x", key: "] / [", tone: "violet" })}
        ${featureCard({ title: "Hold X temporary boost", text: "Release to restore the previous speed", key: "X" })}
        ${featureCard({ title: "Ctrl + mouse wheel", text: "Scroll over the player to change speed", tone: "cyan" })}
        ${featureCard({ title: "Pinch in / pinch out gesture", text: "Adjust speed on supported touchpads", tone: "green" })}
      </div>
    `
  },
  {
    id: "rules",
    width: 1280,
    height: 800,
    out: path.join("assets", "store", "screenshot-03-rules-settings-1280x800.png"),
    body: `
      <div class="section-title" style="left:72px;top:72px;width:990px;">
        <h1>Rules without clutter</h1>
        <p>Keep preferred speeds where they belong: globally, per website, or per channel.</p>
      </div>
      ${sitePanel("left:88px;top:238px;width:386px;height:410px;")}
      ${settingsFocusPanel("left:510px;top:214px;width:396px;height:464px;")}
      <div class="feature-rail" style="right:84px;top:246px;width:300px;grid-template-columns:1fr;gap:20px;">
        ${featureCard({ title: "Per website", text: "Speed memory per domain" })}
        ${featureCard({ title: "Per channel", text: "YouTube channel memory", tone: "violet" })}
        ${featureCard({ title: "Auto apply", text: "New players use saved speed", tone: "green" })}
      </div>
    `
  },
  {
    id: "insights",
    width: 1280,
    height: 800,
    out: path.join("assets", "store", "screenshot-04-insights-1280x800.png"),
    body: `
      <div class="section-title" style="left:72px;top:76px;width:620px;">
        <h1 style="font-size:52px;">Understand your saved time</h1>
        <p>Local analytics make every saved minute visible.</p>
      </div>
      ${analyticsDashboard("left:72px;top:286px;width:704px;height:452px;")}
      ${popupMock("insights", "right:92px;top:122px;width:348px;")}
      <div class="feature-rail" style="right:92px;bottom:76px;width:348px;grid-template-columns:1fr;gap:14px;">
        ${featureCard({ title: "Private by design", text: "Stored locally in Chrome", tone: "green" })}
        ${featureCard({ title: "Speed distribution", text: "Know which rates you use", tone: "cyan" })}
      </div>
    `
  },
  {
    id: "overlay",
    width: 1280,
    height: 800,
    out: path.join("assets", "store", "screenshot-05-overlay-1280x800.png"),
    body: `
      <div class="section-title" style="left:72px;top:70px;width:610px;">
        <h1 style="font-size:52px;">Floating speed overlay</h1>
        <p style="font-size:23px;">Visible feedback without leaving fullscreen.</p>
      </div>
      ${browserMock({ style: "left:72px;top:218px;width:1136px;height:500px;", className: "no-sidebar", sidebar: false, overlay: true, inline: false })}
      ${popupMock("control", "right:112px;top:264px;width:292px;")}
    `
  }
];

const renderAsset = (asset) => {
  const outPath = path.join(rootDir, asset.out);
  const htmlPath = path.join(tempDir, `${asset.id}.html`);
  ensureParentDir(outPath);

  fs.writeFileSync(htmlPath, frame(asset), "utf8");

  const profilePath = path.join(tempDir, `profile-${asset.id}`);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    `--user-data-dir=${profilePath}`,
    `--window-size=${asset.width},${asset.height}`,
    `--screenshot=${outPath}`,
    "--virtual-time-budget=1000",
    "--default-background-color=00000000",
    toFileUrl(htmlPath)
  ];

  console.log(`rendering ${asset.out}...`);
  const result = spawnSync(chromePath, args, { encoding: "utf8", timeout: 20000 });
  const renderedSize = fs.existsSync(outPath) ? readPngSize(outPath) : null;
  const screenshotCompleted = renderedSize?.width === asset.width && renderedSize?.height === asset.height;

  if (result.status !== 0 && !screenshotCompleted) {
    throw new Error(`Failed to render ${asset.out}: ${result.error?.message || result.stderr || result.stdout}`);
  }

  if (!screenshotCompleted) {
    throw new Error(`Rendered ${asset.out} at ${renderedSize?.width || 0}x${renderedSize?.height || 0}; expected ${asset.width}x${asset.height}.`);
  }

  console.log(`rendered ${asset.out} (${asset.width}x${asset.height})`);
};

const requestedAssets = new Set(process.argv.slice(2));

for (const asset of assets) {
  if (requestedAssets.size && !requestedAssets.has(asset.id) && !requestedAssets.has(asset.out)) {
    continue;
  }

  renderAsset(asset);
}

fs.rmSync(tempDir, { recursive: true, force: true });

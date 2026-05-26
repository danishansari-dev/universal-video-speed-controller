# Universal Video Speed Controller — Store Publishing Guide

This guide details the preparation, packaging, and step-by-step submission process to publish **Universal Video Speed Controller** on the Chrome Web Store, Microsoft Edge Add-ons, and Mozilla Firefox Add-ons (AMO). It also explains how to target Brave browser users.

---

## Table of Contents
1. [Pre-Flight Checklist & Testing](#1-pre-flight-checklist--testing)
2. [Generating Brand & Store Assets](#2-generating-brand--store-assets)
3. [Packaging the Extension](#3-packaging-the-extension)
4. [Publishing to Google Chrome Web Store & Brave](#4-publishing-to-google-chrome-web-store--brave)
5. [Publishing to Microsoft Edge Add-ons](#5-publishing-to-microsoft-edge-add-ons)
6. [Publishing to Mozilla Firefox Add-ons (AMO)](#6-publishing-to-mozilla-firefox-add-ons-amo)
7. [Submitting Updates](#7-submitting-updates)

---

## 1. Pre-Flight Checklist & Testing

Before packaging the extension, ensure that all unit tests pass, syntax checks succeed, and the versioning is aligned.

### A. Run Automated Unit Tests
Run the Jest-based test suite to ensure no regressions in settings, the background service worker, or constants:
```bash
npm install
npm test
```

### B. Perform JavaScript Syntax Verification
Run syntax validation checks to prevent runtime syntax errors:
```powershell
node --check content.js
node --check popup.js
node --check background.js
node --check constants.js
```

Verify that the `manifest.json` is valid JSON:
```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

### C. Verify Version Consistency
Ensure that the version in `manifest.json` matches the version in `package.json` exactly.
- [manifest.json](file:///d:/Projects/youtube-speed-controller/manifest.json) (`"version": "0.3.0"`)
- [package.json](file:///d:/Projects/youtube-speed-controller/package.json) (`"version": "0.3.0"`)

---

## 2. Generating Brand & Store Assets

The repository contains an automated Node.js asset renderer (`scripts/render-brand-assets.js`) that uses Google Chrome in headless mode to render high-resolution promotional banners and screenshots with a premium visual design.

### How to Run the Asset Generator
1. Make sure Google Chrome is installed on your system.
2. If Google Chrome is installed in a non-standard directory, set the `CHROME_PATH` environment variable.
3. Run the generator:
   ```bash
   node scripts/render-brand-assets.js
   ```

This script will automatically generate the following images in the `assets/store/` directory:
*   `promo-440x280.png`: Standard small promo tile
*   `promo-1400x560.png`: Wide marquee promo tile
*   `promo-1280x800.png`: Main promotional banner
*   `screenshot-01-control-1280x800.png`: Screenshot showing speed control and presets
*   `screenshot-02-shortcuts-1280x800.png`: Screenshot showing keyboard/wheel shortcut controls
*   `screenshot-03-rules-settings-1280x800.png`: Screenshot highlighting website rules and smart settings
*   `screenshot-04-insights-1280x800.png`: Screenshot displaying local usage insights
*   `screenshot-05-overlay-1280x800.png`: Screenshot displaying the fullscreen speed overlay toast

---

## 3. Packaging the Extension

Because this extension uses vanilla JavaScript, CSS, and HTML without a build/bundler stage, packaging involves compressing the source files into a standard `.zip` archive. 

> [!WARNING]
> You **MUST** exclude developer-only files like `node_modules`, test files, configuration files, and script directories to keep the bundle size small and avoid rejection during automated review.

### Recommended ZIP Bundle File Structure
Your published archive should contain only the following files and folders:
```text
├── assets/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       └── icon-128.png
├── background.js
├── constants.js
├── content.js
├── inject.js
├── manifest.json
├── popup.css
├── popup.html
├── popup.js
└── styles.css
```

### Packaging Commands
Run one of the following commands in the root of the project to create a clean `universal-video-speed-controller.zip` archive.

#### On Windows (PowerShell):
```powershell
Compress-Archive -Path manifest.json, background.js, constants.js, content.js, inject.js, styles.css, popup.html, popup.js, popup.css, assets -DestinationPath universal-video-speed-controller.zip -Force
```

#### On macOS/Linux (Bash):
```bash
zip -r universal-video-speed-controller.zip manifest.json background.js constants.js content.js inject.js styles.css popup.html popup.js popup.css assets/icons
```

---

## 4. Publishing to Google Chrome Web Store & Brave

Brave browser uses the Chrome Web Store natively. By publishing to the Chrome Web Store, your extension is automatically available to all Brave users.

### Step-by-Step Submission
1.  **Register a Developer Account:**
    *   Go to the [Chrome Developer Console](https://chrome.google.com/webstore/devconsole).
    *   Log in with a Google account and pay the one-time $5 developer registration fee.
2.  **Create a New Item:**
    *   Click the **Add new item** button in the top right.
    *   Upload the `universal-video-speed-controller.zip` file you created.
3.  **Fill Out Store Listing details:**
    *   **Description:** Use a detailed description of features, settings, shortcuts, and privacy assurances.
    *   **Icons:** Upload the `icon-128.png` asset if prompted (otherwise it automatically parses from the zip file).
    *   **Screenshots:** Upload the five screenshots from `assets/store/` (each 1280x800).
    *   **Promo Tiles:** Upload `promo-440x280.png` and `promo-1400x560.png` assets.
4.  **Configure Privacy & Permissions:**
    *   **Single-Purpose Description:** Provide a short explanation: *"Provides simple, customizable speed controls and gestures for HTML5 video playback on any website."*
    *   **Permission Justifications:** The Google review team requires explanation for permissions declared in `manifest.json`.
        *   `activeTab`: *"Allows the extension to read and sync video speed controls on the active video tab when the user interacts with the extension popup."*
        *   `storage`: *"Used to persist user settings, customized keyboard shortcuts, domain-specific memory rules, and local usage insights."*
        *   `tabs`: *"Allows the background script to detect when a video tab is updated or loaded to automatically apply saved playback preferences."*
        *   `http://*/*` and `https://*/*` (Broad Host Permissions): *"Necessary to inject the speed control widget, main observer, and gesture events onto any web page that contains HTML5 video elements."*
5.  **Submit for Review:**
    *   Click **Submit for review**. Chrome Web Store approval for broad permissions usually takes between 1 to 5 business days.

---

## 5. Publishing to Microsoft Edge Add-ons

Microsoft Edge is Chromium-based and fully supports the Manifest V3 zip package.

### Step-by-Step Submission
1.  **Register a Developer Account:**
    *   Go to the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login).
    *   Log in with a Microsoft account and register as an Edge developer (Registration is **free**).
2.  **Create a New Submission:**
    *   Click **Create new extension** and choose **Upload zip package**.
    *   Upload `universal-video-speed-controller.zip`.
3.  **Fill Out Product Details:**
    *   Use the same description, category (e.g., *Productivity*), and support links.
    *   Upload store icons (`assets/icons/icon-128.png`) and screenshots (`assets/store/screenshot-...-1280x800.png`).
4.  **Add a Privacy Policy Link:**
    *   Microsoft Edge Add-ons **requires** a Privacy Policy URL because the extension asks for permissions like `storage` and host access.
    *   Use the privacy policy template hosted in your docs folder: `https://<your-username>.github.io/youtube-speed-controller/privacy.html` (or host it on a public gist/website).
5.  **Submit:**
    *   Click **Submit**. The Microsoft review team usually takes 2 to 5 business days to approve.

---

## 6. Publishing to Mozilla Firefox Add-ons (AMO)

Firefox supports Manifest V3 extensions, but has a few minor manifest differences.

### A. Adjust Manifest for Firefox Compatibility (Recommended)
While modern Firefox versions support standard Chromium Manifest V3 service workers, it is highly recommended to declare a **Gecko extension ID** under `browser_specific_settings` in `manifest.json` to prevent updates and sync errors on Mozilla's store.

Create a temporary Firefox manifest by copying `manifest.json` to `manifest.firefox.json` and adding:
```json
"browser_specific_settings": {
  "gecko": {
    "id": "universal-video-speed-controller@danishansari.dev"
  }
}
```

Pack the zip archive replacing `manifest.json` with the Firefox-ready version:
```powershell
# Copy manifest.firefox.json as manifest.json temporarily
Copy-Item manifest.firefox.json manifest.json -Force

# Zip the bundle
Compress-Archive -Path manifest.json, background.js, constants.js, content.js, inject.js, styles.css, popup.html, popup.js, popup.css, assets -DestinationPath universal-video-speed-controller-firefox.zip -Force

# Restore original manifest
git checkout manifest.json
```

### Step-by-Step Submission
1.  **Register a Developer Account:**
    *   Go to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
    *   Log in or create a Firefox accounts profile.
2.  **Submit a New Add-on:**
    *   Click **Submit a New Add-on** and select **On this site** (to host it on AMO).
    *   Upload `universal-video-speed-controller-firefox.zip`.
3.  **Source Code Disclosure:**
    *   Firefox will ask: *"Do you need to submit source code to meet our policy?"*
    *   Select **No**, since the extension consists of plain, non-minified, non-obfuscated JavaScript, CSS, and HTML.
4.  **Add Description & Imagery:**
    *   Fill in the metadata, select categories, and add screenshots/icons.
5.  **Review & Publish:**
    *   Submit the add-on. Firefox reviews are often fast (ranging from a few hours to 2 days).

---

## 7. Submitting Updates

When updating the extension (e.g., fixing bugs or introducing features):

1.  **Increment Version Numbers:**
    *   Update `manifest.json` (e.g., from `0.2.0` to `0.2.1`).
    *   Update `package.json` (e.g., from `0.2.0` to `0.2.1`).
2.  **Re-Run Validation & Build:**
    *   Run `npm test` to verify logic.
    *   Run packaging scripts to build a new `.zip` archive.
3.  **Upload the New Zip:**
    *   Go to the dashboard of each developer portal.
    *   Select your extension and click **Upload new version** / **Create new submission**.
    *   Provide a short changelog (e.g., *"Added pinch gesture support and resolved layout offsets"*).
    *   Submit for review. (Updates are typically approved much faster than initial submissions).

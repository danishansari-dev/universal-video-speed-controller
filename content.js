(() => {
  "use strict";

  const SCRIPT_INSTANCE_KEY = "__youtubeSpeedControllerLoaded";

  if (window[SCRIPT_INSTANCE_KEY]) {
    return;
  }

  window[SCRIPT_INSTANCE_KEY] = true;

  // Use shared constants from constants.js (loaded before this script)
  const STORAGE_KEYS = globalThis.YSC_STORAGE_KEYS || {};

  const EPSILON = 0.01;
  const SPEED_STEP = 0.25;
  const MIN_PLAYBACK_RATE = 0.25;
  const MAX_PLAYBACK_RATE = 10;
  const BOOST_RATE = 2;
  const TOAST_TIMEOUT_MS = 900;
  const WHEEL_THROTTLE_MS = 120;
  const HOLD_START_DELAY_MS = 260;
  const HOLD_REPEAT_MS = 85;
  const SUPPRESS_CLICK_AFTER_HOLD_MS = 500;
  const MAX_VIDEO_SCAN = 140;
  const FLOATING_HIDE_DELAY_MS = 520;
  const FLOATING_HOVER_EXPAND_PX = 12;
  const FLOATING_BOTTOM_CHROME_PAD = 100;
  const FLOATING_LAYOUT_MIN_MS = 100;
  const FLOATING_WIDGET_FALLBACK_W = 118;
  const FLOATING_WIDGET_FALLBACK_H = 36;
  const FLOATING_EDGE_MARGIN = 10;
  const FLOATING_COLLISION_PAD = 8;
  const YOUTUBE_COMPACT_CONTAINER_SELECTOR = [
    "ytd-rich-grid-media",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-watch-card-compact-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-miniplayer",
    "ytd-thumbnail",
    "yt-thumbnail-view-model",
    "yt-lockup-view-model",
    "#thumbnail"
  ].join(",");
  const YOUTUBE_COMPACT_OBSTACLE_SELECTOR = [
    ".ytp-chrome-top",
    ".ytp-gradient-top",
    ".ytp-chrome-bottom",
    ".ytp-gradient-bottom",
    ".ytp-right-controls",
    ".ytp-left-controls",
    ".ytp-subtitles-button",
    ".ytp-settings-button",
    ".ytp-mute-button",
    ".ytp-volume-panel",
    ".ytp-time-display",
    ".ytp-progress-bar-container",
    ".ytp-title",
    ".ytp-cards-button",
    ".ytp-watch-later-button",
    ".ytp-ce-element",
    ".ytp-paid-content-overlay",
    "ytd-thumbnail-overlay-time-status-renderer",
    "ytd-thumbnail-overlay-toggle-button-renderer",
    "ytd-thumbnail-overlay-button-renderer",
    "ytd-thumbnail-overlay-resume-playback-renderer",
    "ytd-thumbnail-overlay-now-playing-renderer",
    "ytd-thumbnail-overlay-bottom-panel-renderer",
    "ytd-thumbnail-overlay-side-panel-renderer",
    "ytd-menu-renderer",
    "ytd-badge-supported-renderer",
    "ytd-channel-name",
    "ytd-video-owner-renderer",
    "yt-icon-button",
    "#avatar",
    "button[aria-label*='Watch later' i]",
    "button[aria-label*='Add to queue' i]",
    "button[aria-label*='More actions' i]",
    "button[aria-label*='Subtitles' i]",
    "button[aria-label*='Closed captions' i]",
    "button[aria-label*='Volume' i]",
    "button[aria-label*='Mute' i]",
    "[aria-label*='Watch later' i]",
    "[aria-label*='Add to queue' i]",
    "[aria-label*='More actions' i]",
    "[aria-label*='Subtitles' i]",
    "[aria-label*='Closed captions' i]",
    "[aria-label*='Volume' i]",
    "[aria-label*='Mute' i]"
  ].join(",");
  const SPEEDS = Array.from(
    { length: Math.round((MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE) / SPEED_STEP) + 1 },
    (_, index) => Number((MIN_PLAYBACK_RATE + (index * SPEED_STEP)).toFixed(2))
  );
  const DEFAULT_SHORTCUTS = globalThis.YSC_DEFAULT_SHORTCUTS || {};
  const PRESET_ACTION_RATES = globalThis.YSC_PRESET_ACTION_RATES || {};
  const ANALYTICS_RETENTION_DAYS = 90;
  const DEFAULT_ANALYTICS = {
    dailyDate: "",
    dailyUsageSeconds: 0,
    timeSavedSeconds: 0,
    speedUsageSeconds: {},
    speedUsageByDate: {}
  };

  if (!globalThis.YSC_DEFAULT_SHORTCUTS || !globalThis.YSC_PRESET_ACTION_RATES) {
    console.error("[Video Speed Controller] Shared constants failed to load.");
  }

  let preferredRate = 1;
  let extensionEnabled = true;
  let widgetHidden = false;
  let toastHidden = false;
  let keyboardEnabled = true;
  let mouseWheelEnabled = true;
  let boostEnabled = true;
  let rememberPerChannel = false;
  let rememberGlobally = true;
  let rememberPerSite = true;
  let autoApplyPreferredSpeed = true;
  let compactMode = false;
  let fullscreenOnlyControls = false;
  let themeMode = "auto";
  let startupDefaultSpeed = 1;
  let shortcuts = { ...DEFAULT_SHORTCUTS };
  let channelRates = {};
  let analytics = { ...DEFAULT_ANALYTICS };
  let sitePolicies = {};
  let siteAccessMode = "all";
  let siteAccessList = [];
  let defaultNativeMode = "override";
  let analyticsLastAt = 0;
  let analyticsLastSaveAt = 0;
  let sessionRateWeightedSeconds = 0;
  let sessionActiveSeconds = 0;
  let widget = null;
  let widgetPlacement = "floating";
  let toast = null;
  let toastLabelText = null;
  let toastValueText = null;
  let activeVideo = null;
  let mutationTimer = 0;
  let saveTimer = 0;
  let toastTimer = 0;
  let pendingProgrammaticRates = new Set();
  let pendingProgrammaticTimer = 0;
  let lastWheelAt = 0;
  let isBoosting = false;
  let boostRestoreRate = null;
  let holdDelayTimer = 0;
  let holdIntervalTimer = 0;
  let holdDirection = 0;
  let holdButton = null;
  let holdActivated = false;
  let suppressedClickButton = null;
  let suppressedClickTimer = 0;
  const videoRegistry = new Set();
  let lastPointerVideo = null;
  let lastPointerClientX = 0;
  let lastPointerClientY = 0;
  let pointerMoveTimer = 0;
  let floatingHideTimer = 0;
  let floatingHoverActive = false;
  let lastFloatingLayoutAt = 0;
  let cachedObstacleRects = [];
  let cachedObstacleKey = "";
  let themeSampleTimer = 0;
  let observedShadowRoots = new WeakSet();
  let rootObserver = null;

  const getChromeStorage = () => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        return null;
      }

      return chrome.storage.local;
    } catch {
      // Extension context was invalidated after reload
      return null;
    }
  };

  const getHostname = () => (typeof location !== "undefined" ? location.hostname : "");

  const normalizeHost = (host) => String(host || "").trim().toLowerCase();

  const isYouTubeHost = () => {
    const host = getHostname();

    return host === "youtube.com" || host.endsWith(".youtube.com");
  };

  const asPlainObject = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value;
  };

  const normalizeSitePolicies = (raw) => {
    const next = {};
    const source = asPlainObject(raw);

    for (const [host, policy] of Object.entries(source)) {
      const key = normalizeHost(host);

      if (!key) {
        continue;
      }

      const plain = asPlainObject(policy);

      next[key] = {
        disabled: plain.disabled === true,
        preferredRate: Number.isFinite(Number(plain.preferredRate))
          ? normalizePlaybackRate(plain.preferredRate)
          : null,
        nativeMode: ["override", "sync"].includes(plain.nativeMode)
          ? plain.nativeMode
          : null
      };
    }

    return next;
  };

  const normalizeAccessList = (raw) => {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.map(normalizeHost).filter(Boolean);
  };

  const getSitePolicy = () => sitePolicies[normalizeHost(getHostname())] || {};

  const getEffectiveNativeMode = () => {
    const policyMode = getSitePolicy().nativeMode;

    if (policyMode === "override" || policyMode === "sync") {
      return policyMode;
    }

    return defaultNativeMode === "sync" ? "sync" : "override";
  };

  const passesSiteAccessGate = () => {
    const host = normalizeHost(getHostname());
    const list = siteAccessList.map(normalizeHost).filter(Boolean);

    if (siteAccessMode === "whitelist") {
      return list.includes(host);
    }

    if (siteAccessMode === "blacklist") {
      return !list.includes(host);
    }

    return true;
  };

  const isSiteDisabled = () => {
    if (!passesSiteAccessGate()) {
      return true;
    }

    return getSitePolicy().disabled === true;
  };

  const isExtensionControllingPage = () => extensionEnabled && !isSiteDisabled();

  const roundToStep = (rate) => Number((Math.round(rate / SPEED_STEP) * SPEED_STEP).toFixed(2));

  const normalizePlaybackRate = (rate) => {
    const parsed = Number(rate);

    if (!Number.isFinite(parsed)) {
      return 1;
    }

    return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, roundToStep(parsed)));
  };

  const formatRate = (rate) => {
    const normalized = normalizePlaybackRate(rate);

    return `${String(normalized).replace(/\.?0+$/, "")}x`;
  };

  const getTodayKey = () => new Date().toISOString().slice(0, 10);

  const getRetentionCutoffKey = () => {
    const cutoff = new Date();

    cutoff.setDate(cutoff.getDate() - ANALYTICS_RETENTION_DAYS);

    return cutoff.toISOString().slice(0, 10);
  };

  const normalizeShortcut = (shortcut, fallback) => ({
    ...fallback,
    ...asPlainObject(shortcut),
    label: String(shortcut?.label || fallback.label),
    code: String(shortcut?.code || fallback.code),
    shift: Boolean(shortcut?.shift ?? fallback.shift),
    ctrl: Boolean(shortcut?.ctrl ?? fallback.ctrl),
    alt: Boolean(shortcut?.alt ?? fallback.alt),
    meta: Boolean(shortcut?.meta ?? fallback.meta),
    hold: Boolean(shortcut?.hold ?? fallback.hold)
  });

  const normalizeShortcuts = (storedShortcuts) => Object.fromEntries(
    Object.entries(DEFAULT_SHORTCUTS).map(([action, fallback]) => [
      action,
      normalizeShortcut(asPlainObject(storedShortcuts)[action], fallback)
    ])
  );

  const normalizeAnalytics = (storedAnalytics) => {
    const todayKey = getTodayKey();
    const cutoffKey = getRetentionCutoffKey();
    const rawDailyUsage = asPlainObject(storedAnalytics?.speedUsageByDate);
    const trimmedDailyUsage = {};

    for (const [dateKey, usageBySpeed] of Object.entries(rawDailyUsage)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey < cutoffKey) {
        continue;
      }

      const cleanUsage = {};

      for (const [rateLabel, seconds] of Object.entries(asPlainObject(usageBySpeed))) {
        const numericSeconds = Number(seconds);

        if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
          cleanUsage[rateLabel] = numericSeconds;
        }
      }

      if (Object.keys(cleanUsage).length) {
        trimmedDailyUsage[dateKey] = cleanUsage;
      }
    }

    if (!Object.keys(trimmedDailyUsage).length) {
      const legacyUsage = asPlainObject(storedAnalytics?.speedUsageSeconds);
      const cleanLegacyUsage = {};

      for (const [rateLabel, seconds] of Object.entries(legacyUsage)) {
        const numericSeconds = Number(seconds);

        if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
          cleanLegacyUsage[rateLabel] = numericSeconds;
        }
      }

      if (Object.keys(cleanLegacyUsage).length) {
        trimmedDailyUsage[todayKey] = cleanLegacyUsage;
      }
    }

    const aggregateUsage = {};

    for (const usageBySpeed of Object.values(trimmedDailyUsage)) {
      for (const [rateLabel, seconds] of Object.entries(usageBySpeed)) {
        aggregateUsage[rateLabel] = (aggregateUsage[rateLabel] || 0) + seconds;
      }
    }

    const nextAnalytics = {
      ...DEFAULT_ANALYTICS,
      ...asPlainObject(storedAnalytics),
      speedUsageSeconds: aggregateUsage,
      speedUsageByDate: trimmedDailyUsage
    };

    if (nextAnalytics.dailyDate !== todayKey) {
      nextAnalytics.dailyDate = todayKey;
      nextAnalytics.dailyUsageSeconds = 0;
    }

    nextAnalytics.dailyUsageSeconds = Number(nextAnalytics.dailyUsageSeconds) || 0;
    nextAnalytics.timeSavedSeconds = Number(nextAnalytics.timeSavedSeconds) || 0;

    return nextAnalytics;
  };

  const readStoredSettings = () => new Promise((resolve) => {
    const storage = getChromeStorage();

    if (!storage) {
      resolve({
        rate: 1,
        enabled: true,
        widgetHidden: false,
        toastHidden: false,
        keyboardEnabled: true,
        mouseWheelEnabled: true,
        boostEnabled: true,
        rememberPerChannel: false,
        rememberGlobally: true,
        rememberPerSite: true,
        autoApplyPreferredSpeed: true,
        compactMode: false,
        fullscreenOnlyControls: false,
        themeMode: "auto",
        startupDefaultSpeed: 1,
        shortcuts: normalizeShortcuts({}),
        channelRates: {},
        analytics: normalizeAnalytics({}),
        sitePolicies: {},
        siteAccessMode: "all",
        siteAccessList: [],
        defaultNativeMode: "override"
      });
      return;
    }

    storage.get(Object.values(STORAGE_KEYS), (result) => {
      if (chrome.runtime?.lastError) {
        resolve({
          rate: 1,
          enabled: true,
          widgetHidden: false,
          toastHidden: false,
          keyboardEnabled: true,
          mouseWheelEnabled: true,
          boostEnabled: true,
          rememberPerChannel: false,
          rememberGlobally: true,
          rememberPerSite: true,
          autoApplyPreferredSpeed: true,
          compactMode: false,
          fullscreenOnlyControls: false,
          themeMode: "auto",
          startupDefaultSpeed: 1,
          shortcuts: normalizeShortcuts({}),
          channelRates: {},
          analytics: normalizeAnalytics({}),
          sitePolicies: {},
          siteAccessMode: "all",
          siteAccessList: [],
          defaultNativeMode: "override"
        });
        return;
      }

      resolve({
        rate: normalizePlaybackRate(result[STORAGE_KEYS.rate]),
        enabled: result[STORAGE_KEYS.enabled] !== false,
        widgetHidden: result[STORAGE_KEYS.widgetHidden] === true,
        toastHidden: result[STORAGE_KEYS.toastHidden] === true
          || result[STORAGE_KEYS.toastHidden] === "true",
        keyboardEnabled: result[STORAGE_KEYS.keyboardEnabled] !== false,
        mouseWheelEnabled: result[STORAGE_KEYS.mouseWheelEnabled] !== false,
        boostEnabled: result[STORAGE_KEYS.boostEnabled] !== false,
        rememberPerChannel: result[STORAGE_KEYS.rememberPerChannel] === true,
        rememberGlobally: result[STORAGE_KEYS.rememberGlobally] !== false,
        rememberPerSite: result[STORAGE_KEYS.rememberPerSite] !== false,
        autoApplyPreferredSpeed: result[STORAGE_KEYS.autoApplyPreferredSpeed] !== false,
        compactMode: result[STORAGE_KEYS.compactMode] === true,
        fullscreenOnlyControls: result[STORAGE_KEYS.fullscreenOnlyControls] === true,
        themeMode: ["auto", "dark", "light"].includes(result[STORAGE_KEYS.themeMode])
          ? result[STORAGE_KEYS.themeMode]
          : "auto",
        startupDefaultSpeed: normalizePlaybackRate(result[STORAGE_KEYS.startupDefaultSpeed] || 1),
        shortcuts: normalizeShortcuts(result[STORAGE_KEYS.shortcuts]),
        channelRates: asPlainObject(result[STORAGE_KEYS.channelRates]),
        analytics: normalizeAnalytics(result[STORAGE_KEYS.analytics]),
        sitePolicies: normalizeSitePolicies(result[STORAGE_KEYS.sitePolicies]),
        siteAccessMode: ["all", "whitelist", "blacklist"].includes(result[STORAGE_KEYS.siteAccessMode])
          ? result[STORAGE_KEYS.siteAccessMode]
          : "all",
        siteAccessList: normalizeAccessList(result[STORAGE_KEYS.siteAccessList]),
        defaultNativeMode: ["override", "sync"].includes(result[STORAGE_KEYS.defaultNativeMode])
          ? result[STORAGE_KEYS.defaultNativeMode]
          : "override"
      });
    });
  });

  const saveSetting = (key, value) => {
    const storage = getChromeStorage();

    if (!storage) {
      return;
    }

    // Wrapped in try/catch to handle "Extension context invalidated" after reload
    try {
      storage.set({ [key]: value });
    } catch {
      // Extension was reloaded — this content script is orphaned, ignore silently
    }
  };

  const persistSitePolicies = () => {
    saveSetting(STORAGE_KEYS.sitePolicies, sitePolicies);
  };

  const updateSitePolicy = (partial) => {
    const host = normalizeHost(getHostname());

    if (!host) {
      return;
    }

    const current = asPlainObject(sitePolicies[host]);
    const next = { ...current, ...partial };
    const empty = !next.disabled
      && (next.preferredRate === null || next.preferredRate === undefined)
      && (next.nativeMode == null || next.nativeMode === "");

    if (empty) {
      delete sitePolicies[host];
    } else {
      sitePolicies = { ...sitePolicies, [host]: next };
    }

    persistSitePolicies();
  };

  const getChannelKey = () => {
    const channelLink = document.querySelector("ytd-watch-metadata ytd-channel-name a")
      || document.querySelector("#upload-info #channel-name a")
      || document.querySelector("ytd-video-owner-renderer a[href^='/@']")
      || document.querySelector("ytd-video-owner-renderer a[href^='/channel/']");

    const channelPath = channelLink?.getAttribute("href");

    if (channelPath) {
      return channelPath;
    }

    const channelName = channelLink?.textContent?.trim();

    return channelName || "";
  };

  const savePreferredRate = (rate) => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const normalizedRate = normalizePlaybackRate(rate);
      const nextStorage = {};
      const host = normalizeHost(getHostname());

      if (rememberGlobally) {
        nextStorage[STORAGE_KEYS.rate] = normalizedRate;
      }

      if (rememberPerChannel && isYouTubeHost()) {
        const channelKey = getChannelKey();

        if (channelKey) {
          channelRates = {
            ...channelRates,
            [channelKey]: normalizedRate
          };
          nextStorage[STORAGE_KEYS.channelRates] = channelRates;
        }
      }

      if (rememberPerSite && host) {
        const policy = asPlainObject(sitePolicies[host]);

        sitePolicies = {
          ...sitePolicies,
          [host]: {
            ...policy,
            preferredRate: normalizedRate
          }
        };
        nextStorage[STORAGE_KEYS.sitePolicies] = sitePolicies;
      }

      const storage = getChromeStorage();

      if (storage && Object.keys(nextStorage).length) {
        // Wrapped in try/catch to handle "Extension context invalidated" after reload
        try {
          storage.set(nextStorage);
        } catch {
          // Extension was reloaded — this content script is orphaned, ignore silently
        }
      }
    }, 100);
  };

  let lastDeepScanAt = 0;

  const collectVideosFromRoot = (root, bucket, deepScan = false) => {
    if (!root || !root.querySelectorAll) {
      return;
    }

    root.querySelectorAll("video").forEach((video) => {
      bucket.add(video);
    });

    if (!deepScan) {
      return;
    }

    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot && !observedShadowRoots.has(element.shadowRoot)) {
        observedShadowRoots.add(element.shadowRoot);
        rootObserver?.observe(element.shadowRoot, { childList: true, subtree: true });
        collectVideosFromRoot(element.shadowRoot, bucket, deepScan);
      }
    });
  };

  const syncVideoRegistry = () => {
    const next = new Set();
    const now = performance.now();
    const deepScan = (now - lastDeepScanAt) > 5000;

    if (deepScan) {
      lastDeepScanAt = now;
    }

    collectVideosFromRoot(document, next, deepScan);

    for (const video of videoRegistry) {
      if (video.isConnected) {
        next.add(video);
      }
    }

    videoRegistry.clear();
    let count = 0;

    for (const video of next) {
      if (count >= MAX_VIDEO_SCAN) {
        break;
      }

      if (video.isConnected) {
        videoRegistry.add(video);
        count += 1;
      }
    }
  };

  const isVideoUsable = (video) => {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) {
      return false;
    }

    const rect = video.getBoundingClientRect();

    if (rect.width < 32 || rect.height < 32) {
      return false;
    }

    const style = window.getComputedStyle(video);

    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    return true;
  };

  const videoVisibleScore = (video) => {
    const rect = video.getBoundingClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const ix = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const iy = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));

    return ix * iy;
  };

  const pickLargestVideo = (videos) => {
    let best = null;
    let bestScore = -1;

    for (const video of videos) {
      const score = videoVisibleScore(video);

      if (score > bestScore) {
        bestScore = score;
        best = video;
      }
    }

    return best;
  };

  const pointInRect = (clientX, clientY, rect) => {
    if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return false;
    }

    return clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom;
  };

  const isBottomOverlayStackOpen = (video, videoRect) => {
    if (!video || !videoRect?.width) {
      return true;
    }

    const sampleY = videoRect.bottom - Math.max(8, Math.min(40, videoRect.height * 0.09));
    const xs = [
      videoRect.left + videoRect.width * 0.18,
      videoRect.left + videoRect.width * 0.5,
      videoRect.right - videoRect.width * 0.18
    ];

    for (const x of xs) {
      const stack = document.elementsFromPoint(x, sampleY);

      for (const el of stack.slice(0, 16)) {
        if (!(el instanceof Element)) {
          continue;
        }

        if (widget && widget.contains(el)) {
          return true;
        }

        if (el === video || video.contains(el)) {
          continue;
        }

        const style = window.getComputedStyle(el);

        if (style.pointerEvents === "none") {
          continue;
        }

        if (style.visibility === "hidden" || style.display === "none") {
          continue;
        }

        const opacity = parseFloat(style.opacity);

        if (Number.isFinite(opacity) && opacity < 0.04) {
          continue;
        }

        return true;
      }
    }

    return false;
  };

  const shouldRevealFloatingWidget = (clientX, clientY) => {
    if (!widget || widgetPlacement !== "floating") {
      return false;
    }

    const video = getVideo();

    if (!video || !isVideoUsable(video)) {
      return false;
    }

    const vr = video.getBoundingClientRect();
    const bottomPad = Math.min(
      FLOATING_BOTTOM_CHROME_PAD,
      Math.max(64, vr.height * 0.26)
    );

    const hoverZone = {
      left: vr.left - FLOATING_HOVER_EXPAND_PX,
      top: vr.top - FLOATING_HOVER_EXPAND_PX,
      right: vr.right + FLOATING_HOVER_EXPAND_PX,
      bottom: vr.bottom + bottomPad
    };

    const wr = widget.getBoundingClientRect();

    if (wr.width > 0 && wr.height > 0 && pointInRect(clientX, clientY, wr)) {
      return true;
    }

    const inVideoRect = pointInRect(clientX, clientY, vr);
    const inHoverZone = pointInRect(clientX, clientY, hoverZone);
    const chromeOpen = isBottomOverlayStackOpen(video, vr);

    return inVideoRect || (chromeOpen && inHoverZone);
  };

  const clearFloatingHideTimer = () => {
    window.clearTimeout(floatingHideTimer);
    floatingHideTimer = 0;
  };

  const applyFloatingAmbientClass = () => {
    if (!widget || widgetPlacement !== "floating") {
      return;
    }

    const hideForFullscreen = fullscreenOnlyControls && !isFullscreenMode();
    const blocked = !isExtensionControllingPage() || widgetHidden || hideForFullscreen;

    if (blocked) {
      widget.classList.remove("ysc-speed-widget--ambient");
      return;
    }

    widget.classList.toggle("ysc-speed-widget--ambient", floatingHoverActive);
  };

  const scheduleFloatingHide = () => {
    clearFloatingHideTimer();
    floatingHideTimer = window.setTimeout(() => {
      floatingHideTimer = 0;
      floatingHoverActive = false;
      applyFloatingAmbientClass();
    }, FLOATING_HIDE_DELAY_MS);
  };

  const resetFloatingHoverState = () => {
    clearFloatingHideTimer();
    floatingHoverActive = false;

    if (widget) {
      widget.classList.remove("ysc-speed-widget--ambient");
    }
  };

  const updateFloatingHoverFromClientPoint = (clientX, clientY) => {
    if (widgetPlacement !== "floating") {
      return;
    }

    const hideForFullscreen = fullscreenOnlyControls && !isFullscreenMode();
    const blocked = !isExtensionControllingPage() || widgetHidden || hideForFullscreen;

    if (blocked) {
      resetFloatingHoverState();
      return;
    }

    const reveal = shouldRevealFloatingWidget(clientX, clientY);

    if (reveal) {
      clearFloatingHideTimer();

      if (!floatingHoverActive) {
        floatingHoverActive = true;
        applyFloatingAmbientClass();
      }
    } else if (floatingHoverActive && !floatingHideTimer) {
      scheduleFloatingHide();
    }
  };

  const getPlayer = () => {
    if (!isYouTubeHost()) {
      return null;
    }

    // On watch pages, prioritize the main movie player directly
    // This ensures detection works even before the user moves their mouse
    if (location.pathname === "/watch" || location.pathname.startsWith("/shorts")) {
      const mainPlayer = document.getElementById("movie_player");

      if (mainPlayer) {
        const rect = mainPlayer.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          return mainPlayer;
        }
      }
    }

    const hoveredPlayer = lastPointerVideo?.closest?.(".html5-video-player");

    if (hoveredPlayer && isVideoUsable(lastPointerVideo)) {
      const rect = lastPointerVideo.getBoundingClientRect();
      const hoverZone = {
        left: rect.left - FLOATING_HOVER_EXPAND_PX,
        top: rect.top - FLOATING_HOVER_EXPAND_PX,
        right: rect.right + FLOATING_HOVER_EXPAND_PX,
        bottom: rect.bottom + FLOATING_HOVER_EXPAND_PX
      };

      if (rect.width > 0 && rect.height > 0 && pointInRect(lastPointerClientX, lastPointerClientY, hoverZone)) {
        return hoveredPlayer;
      }
    }

    const players = Array.from(document.querySelectorAll(".html5-video-player"));

    return players.find((player) => {
      const video = player.querySelector("video.html5-main-video, video");
      const rect = player.getBoundingClientRect();

      return video && rect.width > 0 && rect.height > 0;
    }) || null;
  };

  const getYouTubeVideo = () => {
    const player = getPlayer();

    return player?.querySelector("video.html5-main-video, video") || null;
  };

  const isYouTubeWatchPlayer = (player) => {
    if (!player || !isYouTubeHost()) {
      return false;
    }

    if (player.classList.contains("ytp-miniplayer")) {
      return false;
    }

    if (document.fullscreenElement && (document.fullscreenElement === player || document.fullscreenElement.contains(player))) {
      return true;
    }

    if (player.id === "movie_player") {
      return true;
    }

    if (player.closest("#player-container, #player-theater-container")) {
      return true;
    }

    if (location.pathname.startsWith("/shorts") && player.closest("ytd-reel-video-renderer, ytd-shorts, ytd-shorts-player-controls")) {
      return true;
    }

    const rect = player.getBoundingClientRect();
    const wideEnough = rect.width >= Math.min(560, window.innerWidth * 0.48);
    const tallEnough = rect.height >= Math.min(315, window.innerHeight * 0.36);

    return wideEnough && tallEnough && !player.closest(YOUTUBE_COMPACT_CONTAINER_SELECTOR);
  };

  const getYouTubeCompactRoot = (video) => {
    if (!video || !isYouTubeHost()) {
      return null;
    }

    return video.closest(YOUTUBE_COMPACT_CONTAINER_SELECTOR)
      || video.closest(".html5-video-player")
      || null;
  };

  const isYouTubeCompactPreview = (video, rect, fullscreenUi = false) => {
    if (!video || !isYouTubeHost() || fullscreenUi) {
      return false;
    }

    const player = video.closest(".html5-video-player");

    if (player && isYouTubeWatchPlayer(player)) {
      return false;
    }

    if (getYouTubeCompactRoot(video)?.matches?.(YOUTUBE_COMPACT_CONTAINER_SELECTOR)) {
      return true;
    }

    if (!rect?.width || !rect?.height) {
      return false;
    }

    return rect.width < 640 || rect.height < 360;
  };

  const pickUniversalVideo = () => {
    syncVideoRegistry();

    const pip = document.pictureInPictureElement;

    if (pip instanceof HTMLVideoElement && isVideoUsable(pip)) {
      return pip;
    }

    const fs = document.fullscreenElement;

    if (fs instanceof HTMLVideoElement && isVideoUsable(fs)) {
      return fs;
    }

    if (fs?.querySelector) {
      const nested = fs.querySelector("video");

      if (nested && isVideoUsable(nested)) {
        return nested;
      }
    }

    if (lastPointerVideo && isVideoUsable(lastPointerVideo)) {
      return lastPointerVideo;
    }

    const active = document.activeElement;

    if (active instanceof HTMLVideoElement && isVideoUsable(active)) {
      return active;
    }

    const candidates = Array.from(videoRegistry).filter(isVideoUsable);
    const playing = candidates.filter((video) => !video.paused && !video.ended && video.readyState > 1);

    if (playing.length) {
      return pickLargestVideo(playing);
    }

    return pickLargestVideo(candidates);
  };

  const getVideo = () => {
    if (activeVideo && isVideoUsable(activeVideo)) {
      return activeVideo;
    }

    if (isYouTubeHost()) {
      const yt = getYouTubeVideo();

      if (yt) {
        return yt;
      }
    }

    return pickUniversalVideo();
  };

  const hasActiveVideoPlayer = () => {
    const video = getVideo();

    return Boolean(video && isVideoUsable(video));
  };

  const detectNativeSpeedHeuristic = (video) => {
    if (!(video instanceof HTMLVideoElement)) {
      return false;
    }

    const root = video.closest(
      [
        "[class*='playback-rate' i]",
        "[class*='playbackRate' i]",
        "[data-testid*='playback' i]",
        "[aria-label*='playback speed' i]",
        "[aria-label*='speed' i]"
      ].join(", ")
    );

    if (root) {
      return true;
    }

    const settingsMenus = video.closest("div")?.querySelectorAll("button, [role='menuitem']");

    if (!settingsMenus) {
      return false;
    }

    return Array.from(settingsMenus).some((node) => /speed|playback/i.test(node.textContent || ""));
  };

  const parseRgbToLuminance = (value) => {
    if (!value || value === "transparent") {
      return 0.12;
    }

    const parts = value.match(/rgba?\(([^)]+)\)/i);

    if (!parts) {
      return 0.12;
    }

    const nums = parts[1].split(",").map((part) => Number(part.trim()));

    if (nums.length < 3) {
      return 0.12;
    }

    const [r, g, b] = nums;
    const a = nums.length > 3 ? nums[3] : 1;

    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      return 0.12;
    }

    const rs = r / 255;
    const gs = g / 255;
    const bs = b / 255;

    return (0.2126 * rs + 0.7152 * gs + 0.0722 * bs) * (Number.isFinite(a) ? a : 1);
  };

  const resolveFloatingTheme = () => {
    if (themeMode === "dark") {
      return "dark";
    }

    if (themeMode === "light") {
      return "light";
    }

    const video = getVideo();
    const sample = video?.parentElement || document.body;
    const bg = window.getComputedStyle(sample).backgroundColor;
    const lum = parseRgbToLuminance(bg);

    if (lum > 0.55) {
      return "light";
    }

    if (lum < 0.35) {
      return "dark";
    }

    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  };

  const rectsIntersect = (a, b) => {
    if (!a || !b) {
      return false;
    }

    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  };

  const inflateRect = (rect, pad) => ({
    left: rect.left - pad,
    top: rect.top - pad,
    right: rect.right + pad,
    bottom: rect.bottom + pad
  });

  const overlapArea = (a, b) => {
    if (!rectsIntersect(a, b)) {
      return 0;
    }

    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);

    return Math.max(0, right - left) * Math.max(0, bottom - top);
  };

  const getPlayerRootForLayout = (video) => {
    if (!video) {
      return null;
    }

    const hints = [
      ".html5-video-player",
      "[data-player]",
      "[data-testid*='player' i]",
      ".plyr",
      ".plyr__video-wrapper",
      ".video-js",
      "[class*='video-player' i]",
      "[class*='VideoPlayer' i]",
      "[class*='watch-video' i]"
    ].join(",");

    const direct = video.closest(hints);

    if (direct) {
      return direct;
    }

    let el = video.parentElement;
    const vrect = video.getBoundingClientRect();

    for (let i = 0; i < 9 && el; i += 1) {
      const b = el.getBoundingClientRect?.();

      if (b && vrect.width > 0 && b.width >= vrect.width * 0.82 && b.height >= vrect.height * 0.7) {
        return el;
      }

      el = el.parentElement;
    }

    return video.parentElement || video;
  };

  const gatherObstacleRects = (video, vr, { compactPreview = false } = {}) => {
    if (!video || !vr?.width) {
      return [];
    }

    const root = getPlayerRootForLayout(video);
    const roots = new Set([root]);
    const out = [];

    const push = (r) => {
      if (!r || r.width < 14 || r.height < 3) {
        return;
      }

      if (!rectsIntersect(r, vr)) {
        return;
      }

      out.push(r);
    };

    const baseSelectors = [
      ".ytp-chrome-top",
      ".ytp-gradient-top",
      ".ytp-chrome-bottom",
      ".ytp-gradient-bottom",
      ".ytp-right-controls",
      ".ytp-left-controls",
      ".ytp-caption-window-container",
      ".ytp-caption-window",
      ".vjs-control-bar",
      ".vjs-progress-control",
      ".vjs-text-track-display",
      "[class*='control-bar' i]",
      "[class*='ControlBar' i]",
      "[class*='progress' i]",
      "[class*='Progress' i]",
      "[class*='seekbar' i]",
      "[class*='scrub' i]",
      "[class*='Seek' i]",
      "[class*='timeline' i]",
      "[class*='caption' i]",
      "[class*='subtitle' i]",
      "[class*='timedtext' i]",
      "[class*='BottomControls' i]",
      ".shaka-bottom-controls",
      ".shaka-text-container",
      "[data-uia*='control' i]"
    ];

    if (compactPreview && isYouTubeHost()) {
      roots.add(getYouTubeCompactRoot(video));
      baseSelectors.push(YOUTUBE_COMPACT_OBSTACLE_SELECTOR);
    }

    const sel = baseSelectors.join(",");

    roots.forEach((scope) => {
      if (!scope?.querySelectorAll) {
        return;
      }

      scope.querySelectorAll(sel).forEach((el) => {
        if (!(el instanceof HTMLElement)) {
          return;
        }

        if (widget && (widget === el || widget.contains(el) || el.contains(widget))) {
          return;
        }

        const style = window.getComputedStyle(el);

        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }

        const opacity = parseFloat(style.opacity);

        if (Number.isFinite(opacity) && opacity < 0.03) {
          return;
        }

        push(el.getBoundingClientRect());
      });
    });

    push({
      left: vr.left,
      top: compactPreview
        ? vr.bottom - Math.min(48, Math.max(24, vr.height * 0.24))
        : vr.top + vr.height * 0.56,
      right: vr.right,
      bottom: vr.bottom
    });

    return out;
  };

  const sampleCornerOccupancyPenalty = (left, top, w, h, video) => {
    const pts = [
      [left + w * 0.22, top + h * 0.38],
      [left + w * 0.5, top + h * 0.45],
      [left + w * 0.78, top + h * 0.38]
    ];

    let penalty = 0;

    for (const [x, y] of pts) {
      const stack = document.elementsFromPoint(x, y);

      for (let i = 0; i < Math.min(14, stack.length); i += 1) {
        const el = stack[i];

        if (!(el instanceof Element)) {
          continue;
        }

        if (widget && widget.contains(el)) {
          return penalty;
        }

        if (video && (el === video || video.contains(el))) {
          break;
        }

        const tag = el.tagName;

        if (tag === "HTML" || tag === "BODY") {
          continue;
        }

        const cls = el.className?.toString?.() || "";

        if (/topbar|navbar|header|app-bar|site-header|masthead/i.test(cls)) {
          penalty += 5;
        }

        if (/share|reaction|comment|social|pip-button|cast|airplay|chromecast/i.test(cls)) {
          penalty += 3;
        }

        penalty += 0.35;
      }
    }

    return penalty;
  };

  const pickBestFloatingPosition = (video, vr, ww, wh, fullscreenUi, verticalLayout, obstacles) => {
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const edge = FLOATING_EDGE_MARGIN + (fullscreenUi ? 6 : 0);
    const pad = FLOATING_COLLISION_PAD;
    const list = Array.isArray(obstacles) ? obstacles : [];

    const corners = [
      { id: "tr", ox: 1, oy: 0 },
      { id: "tl", ox: 0, oy: 0 },
      { id: "br", ox: 1, oy: 1 },
      { id: "bl", ox: 0, oy: 1 }
    ];

    const slotFor = (corner) => {
      let left = corner.ox ? vr.right - ww - edge : vr.left + edge;
      let top = corner.oy ? vr.bottom - wh - edge : vr.top + edge;

      if (verticalLayout) {
        if (corner.id === "tr" || corner.id === "tl") {
          top = vr.top + edge + (fullscreenUi ? 28 : 16);
        } else {
          top = vr.top + edge + vr.height * (fullscreenUi ? 0.12 : 0.08);
        }
      }

      left = Math.min(Math.max(left, edge), vw - ww - edge);
      top = Math.min(Math.max(top, edge), vh - wh - edge);

      return { left, top, right: left + ww, bottom: top + wh, id: corner.id };
    };

    let best = null;
    let bestScore = Infinity;

    for (const corner of corners) {
      const slot = slotFor(corner);
      const inflated = inflateRect(slot, pad);
      let score = 0;

      for (const ob of list) {
        const hit = overlapArea(inflated, ob);

        if (hit > 0) {
          score += hit;

          if (ob.top > vr.top + vr.height * 0.48) {
            score += hit * 0.9;
          }
        }
      }

      if (verticalLayout && (corner.id === "br" || corner.id === "bl")) {
        score += ww * wh * 0.06;
      }

      score += sampleCornerOccupancyPenalty(slot.left, slot.top, ww, wh, video) * 10;

      const preference = { tr: 0, tl: 1, br: 2, bl: 3 }[corner.id];

      score += preference * (ww * 0.15);

      if (score < bestScore) {
        bestScore = score;
        best = slot;
      }
    }

    if (!best) {
      return {
        left: Math.min(Math.max(vr.right - ww - edge, edge), vw - ww - edge),
        top: Math.min(Math.max(vr.top + edge, edge), vh - wh - edge),
        id: "tr"
      };
    }

    return best;
  };

  const applyFloatingPresentation = () => {
    if (!widget || widgetPlacement !== "floating") {
      return;
    }

    const theme = resolveFloatingTheme();

    widget.dataset.yscTheme = theme;
    toast?.setAttribute("data-ysc-theme", theme);

    const fullscreenUi = Boolean(document.fullscreenElement || getPlayer()?.classList.contains("ytp-fullscreen"));

    widget.classList.toggle("ysc-speed-widget--fs", fullscreenUi);

    const video = getVideo();
    const rect = video?.getBoundingClientRect();

    widget.style.right = "auto";
    widget.style.bottom = "auto";

    if (!rect || rect.width < 80 || rect.height < 80) {
      widget.style.left = "";
      widget.style.top = "";
      widget.classList.remove("ysc-speed-widget--vertical");
      widget.classList.remove("ysc-speed-widget--yt-preview");
      applyFloatingAmbientClass();
      return;
    }

    const youtubePreviewLayout = isYouTubeCompactPreview(video, rect, fullscreenUi);

    if (youtubePreviewLayout) {
      widget.style.display = "none";
      resetFloatingHoverState();
      return;
    } else {
      widget.style.display = "";
    }

    const verticalLayout = rect.height / rect.width >= 1.18;

    widget.classList.remove("ysc-speed-widget--yt-preview");
    widget.classList.toggle("ysc-speed-widget--vertical", verticalLayout);

    const now = performance.now();
    const runHeavy = now - lastFloatingLayoutAt >= FLOATING_LAYOUT_MIN_MS;
    const srcTag = String(video.currentSrc || video.src || "").slice(-48);
    const obsKey = `standard_${srcTag}_${Math.round(rect.left)}_${Math.round(rect.top)}_${Math.round(rect.width)}_${Math.round(rect.height)}`;

    if (runHeavy || cachedObstacleKey !== obsKey) {
      cachedObstacleRects = gatherObstacleRects(video, rect, { compactPreview: false });
      cachedObstacleKey = obsKey;
    }

    if (runHeavy) {
      lastFloatingLayoutAt = now;
    }

    const ww = widget.offsetWidth || FLOATING_WIDGET_FALLBACK_W;
    const wh = widget.offsetHeight || FLOATING_WIDGET_FALLBACK_H;
    const pos = pickBestFloatingPosition(
        video,
        rect,
        ww,
        wh,
        fullscreenUi,
        verticalLayout,
        cachedObstacleRects
      );

    widget.style.left = `${Math.round(pos.left)}px`;
    widget.style.top = `${Math.round(pos.top)}px`;

    applyFloatingAmbientClass();
  };

  const ensureToast = () => {
    if (toast) {
      return;
    }

    toast = document.createElement("div");
    toast.className = "ysc-speed-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    toastLabelText = document.createElement("span");
    toastLabelText.className = "ysc-speed-toast-label";

    toastValueText = document.createElement("span");
    toastValueText.className = "ysc-speed-toast-rate";

    toast.append(toastLabelText, toastValueText);
  };

  const getToastParent = () => {
    const player = getPlayer();

    if (player) {
      return player;
    }

    const fs = document.fullscreenElement;

    if (fs) {
      return fs;
    }

    return document.body;
  };

  const showToast = ({ label = "Speed", value, force = false }) => {
    if (toastHidden && !force) {
      return;
    }

    const parent = getToastParent();

    if (!parent) {
      return;
    }

    ensureToast();

    if (toast.parentElement !== parent) {
      parent.append(toast);
    }

    if (widgetPlacement === "floating") {
      applyFloatingPresentation();
    }

    toastLabelText.textContent = label;
    toastValueText.textContent = value;
    toast.classList.add("ysc-speed-toast-visible");

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast?.classList.remove("ysc-speed-toast-visible");
    }, TOAST_TIMEOUT_MS);
  };

  const showSpeedToast = (rate, { label = "Speed", force = false } = {}) => {
    showToast({
      label,
      value: formatRate(rate),
      force
    });
  };

  const isFullscreenMode = () => Boolean(
    document.fullscreenElement
    || getPlayer()?.classList.contains("ytp-fullscreen")
  );

  const updateWidgetVisibility = () => {
    const hideForFullscreen = fullscreenOnlyControls && !isFullscreenMode();
    const shouldHide = !isExtensionControllingPage() || widgetHidden || hideForFullscreen;

    widget?.classList.toggle("ysc-speed-widget-hidden", shouldHide);
    widget?.classList.toggle("ysc-speed-widget-compact", compactMode);

    if (shouldHide && widgetPlacement === "floating") {
      resetFloatingHoverState();
    } else {
      applyFloatingAmbientClass();
    }
  };

  const updateWidget = (rate = getCurrentRate()) => {
    if (!widget) {
      return;
    }

    const displayRate = formatRate(rate);
    const rateButton = widget.querySelector(".ysc-speed-rate");

    rateButton.textContent = displayRate;
    rateButton.setAttribute("aria-label", `Current speed ${displayRate}. Click to increase.`);
    rateButton.title = `Playback speed ${displayRate}`;

    widget.querySelector(".ysc-speed-decrease").disabled = rate <= SPEEDS[0] + EPSILON;
    widget.querySelector(".ysc-speed-increase").disabled = rate >= SPEEDS[SPEEDS.length - 1] - EPSILON;
    updateWidgetVisibility();
    applyFloatingPresentation();
  };

  const getRateKey = (rate) => normalizePlaybackRate(rate).toFixed(2);

  const markProgrammaticRate = (rate) => {
    pendingProgrammaticRates.add(getRateKey(rate));
    window.clearTimeout(pendingProgrammaticTimer);
    pendingProgrammaticTimer = window.setTimeout(() => {
      pendingProgrammaticRates = new Set();
    }, 500);
  };

  const setVideoRate = (video, rate) => {
    markProgrammaticRate(rate);

    try {
      video.playbackRate = rate;
      return true;
    } catch {
      pendingProgrammaticRates.delete(getRateKey(rate));
      return false;
    }
  };

  const applyRate = (
    rate,
    {
      persist = true,
      notify = false,
      notifyAlways = false,
      label = "Speed",
      forceToast = false
    } = {}
  ) => {
    if (!isExtensionControllingPage()) {
      return false;
    }

    const nextRate = normalizePlaybackRate(rate);
    const video = getVideo();
    const currentRate = normalizePlaybackRate(video?.playbackRate || preferredRate);
    const changed = Math.abs(currentRate - nextRate) > EPSILON;

    if (!video && !persist) {
      return false;
    }

    if (persist) {
      preferredRate = nextRate;
    }

    if (video && changed && !setVideoRate(video, nextRate)) {
      return false;
    }

    updateWidget(nextRate);

    if (persist) {
      savePreferredRate(nextRate);
    }

    if (notify && (changed || notifyAlways)) {
      showSpeedToast(nextRate, { label, force: forceToast });
    }

    return changed;
  };

  const getCurrentRate = () => normalizePlaybackRate(getVideo()?.playbackRate || preferredRate);

  const moveRate = (direction, options = {}) => {
    const currentRate = getCurrentRate();
    const nextRate = normalizePlaybackRate(currentRate + (direction * SPEED_STEP));

    return applyRate(nextRate, options);
  };

  const clearSuppressedClick = () => {
    suppressedClickButton = null;
    window.clearTimeout(suppressedClickTimer);
    suppressedClickTimer = 0;
  };

  const suppressNextClickFor = (button) => {
    if (!button) {
      return;
    }

    suppressedClickButton = button;
    window.clearTimeout(suppressedClickTimer);
    suppressedClickTimer = window.setTimeout(clearSuppressedClick, SUPPRESS_CLICK_AFTER_HOLD_MS);
  };

  const clearHoldTimers = () => {
    window.clearTimeout(holdDelayTimer);
    window.clearInterval(holdIntervalTimer);
    holdDelayTimer = 0;
    holdIntervalTimer = 0;
  };

  const stopSpeedHold = ({ suppressClick = true } = {}) => {
    const activeButton = holdButton;
    const shouldSuppressClick = suppressClick && holdActivated;

    clearHoldTimers();
    activeButton?.classList.remove("ysc-speed-holding");

    holdDirection = 0;
    holdButton = null;
    holdActivated = false;

    if (shouldSuppressClick) {
      suppressNextClickFor(activeButton);
    }
  };

  const runHoldStep = () => {
    if (!holdDirection) {
      return;
    }

    const changed = moveRate(holdDirection, { notify: true });

    if (!changed) {
      stopSpeedHold({ suppressClick: true });
    }
  };

  const startSpeedHold = (event, direction, button) => {
    if (button.disabled || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    event.stopPropagation();
    stopSpeedHold({ suppressClick: false });

    holdDirection = direction;
    holdButton = button;
    holdActivated = false;
    button.classList.add("ysc-speed-holding");

    holdDelayTimer = window.setTimeout(() => {
      holdActivated = true;
      runHoldStep();

      if (holdDirection) {
        holdIntervalTimer = window.setInterval(runHoldStep, HOLD_REPEAT_MS);
      }
    }, HOLD_START_DELAY_MS);
  };

  const createIcon = (type) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");

    svg.classList.add("ysc-speed-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-width", "2.4");
    line.setAttribute("d", type === "plus" ? "M12 5v14M5 12h14" : "M5 12h14");

    svg.append(line);

    return svg;
  };

  const createButton = ({ className, text, icon, label, title, holdDirection: direction, onClick }) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = `ysc-speed-button ${className}`;
    button.setAttribute("aria-label", label);
    button.title = title;

    if (icon) {
      button.append(createIcon(icon));
    } else {
      button.textContent = text;
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (suppressedClickButton === button) {
        clearSuppressedClick();
        return;
      }

      onClick();
    });

    if (direction) {
      button.addEventListener("pointerdown", (event) => startSpeedHold(event, direction, button));
      button.addEventListener("pointerup", () => stopSpeedHold());
      button.addEventListener("pointercancel", () => stopSpeedHold());
      button.addEventListener("pointerleave", () => stopSpeedHold());
      button.addEventListener("touchend", () => stopSpeedHold());
    }

    return button;
  };

  const createWidget = () => {
    const container = document.createElement("div");

    container.className = "ysc-speed-widget";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Playback speed controls");

    const decrease = createButton({
      className: "ysc-speed-decrease",
      icon: "minus",
      label: "Decrease playback speed",
      title: "Decrease playback speed",
      holdDirection: -1,
      onClick: () => moveRate(-1, { notify: true })
    });

    const rate = createButton({
      className: "ysc-speed-rate",
      text: formatRate(preferredRate),
      label: `Current speed ${formatRate(preferredRate)}. Click to increase.`,
      title: `Playback speed ${formatRate(preferredRate)}`,
      onClick: () => moveRate(1, { notify: true })
    });

    const increase = createButton({
      className: "ysc-speed-increase",
      icon: "plus",
      label: "Increase playback speed",
      title: "Increase playback speed",
      holdDirection: 1,
      onClick: () => moveRate(1, { notify: true })
    });

    container.append(decrease, rate, increase);

    for (const eventName of ["click", "dblclick", "mousedown", "pointerdown", "touchstart"]) {
      container.addEventListener(eventName, (event) => event.stopPropagation());
    }

    container.addEventListener("pointerenter", () => {
      if (!container.classList.contains("ysc-speed-widget--floating")) {
        return;
      }

      clearFloatingHideTimer();

      if (!floatingHoverActive) {
        floatingHoverActive = true;
        applyFloatingAmbientClass();
      }
    });

    container.addEventListener("pointerleave", () => {
      if (!container.classList.contains("ysc-speed-widget--floating")) {
        return;
      }

      scheduleFloatingHide();
    });

    return container;
  };

  const isVisibleControl = (element) => {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);

    return style.display !== "none" && style.visibility !== "hidden";
  };

  const placeYouTubeWidget = () => {
    const player = getPlayer();
    const rightControls = player?.querySelector(".ytp-right-controls");

    if (!rightControls || !isYouTubeWatchPlayer(player)) {
      return false;
    }

    if (!widget) {
      widget = createWidget();
    }

    widget.classList.remove("ysc-speed-widget--floating");
    widget.classList.remove("ysc-speed-widget--yt-preview");
    widget.classList.remove("ysc-speed-widget--vertical");
    // Clear any inline display:none left from homepage preview hiding
    widget.style.display = "";
    widgetPlacement = "youtube";
    resetFloatingHoverState();
    cachedObstacleKey = "";
    lastFloatingLayoutAt = 0;

    const captionsButton = rightControls.querySelector(".ytp-subtitles-button");
    const settingsButton = rightControls.querySelector(".ytp-settings-button");

    if (captionsButton && isVisibleControl(captionsButton)) {
      if (captionsButton.nextElementSibling !== widget) {
        captionsButton.insertAdjacentElement("afterend", widget);
      }
    } else if (settingsButton) {
      if (settingsButton.previousElementSibling !== widget) {
        rightControls.insertBefore(widget, settingsButton);
      }
    } else if (widget.parentElement !== rightControls || widget.nextElementSibling) {
      rightControls.append(widget);
    }

    return true;
  };

  const placeFloatingWidget = () => {
    if (!widget) {
      widget = createWidget();
    }

    widget.classList.add("ysc-speed-widget--floating");
    widgetPlacement = "floating";
    cachedObstacleKey = "";
    lastFloatingLayoutAt = 0;

    if (widget.parentElement !== document.body) {
      document.body.append(widget);
    }

    applyFloatingPresentation();
  };

  const placeWidget = () => {
    if (isYouTubeHost() && placeYouTubeWidget()) {
      updateWidget(getCurrentRate());
      return;
    }

    placeFloatingWidget();
    updateWidget(getCurrentRate());
  };

  const handleRateChange = () => {
    const video = getVideo();

    if (!video) {
      return;
    }

    const changedRate = normalizePlaybackRate(video.playbackRate);
    const changedRateKey = getRateKey(changedRate);

    if (pendingProgrammaticRates.has(changedRateKey)) {
      updateWidget(changedRate);
      return;
    }

    const mode = getEffectiveNativeMode();

    if (mode === "sync") {
      preferredRate = changedRate;
      updateWidget(changedRate);
      savePreferredRate(changedRate);
      return;
    }

    // Override mode: something external changed the rate (YouTube ad, native menu).
    // Re-apply the user's preferred rate instead of silently saving the external value.
    const changed = Math.abs(preferredRate - changedRate) > EPSILON;

    if (changed) {
      setVideoRate(video, preferredRate);
      updateWidget(preferredRate);
    }
  };

  const getPreferredRateForCurrentVideo = () => {
    const host = normalizeHost(getHostname());
    const siteRate = rememberPerSite && host ? sitePolicies[host]?.preferredRate : null;

    if (rememberPerSite && Number.isFinite(siteRate)) {
      return normalizePlaybackRate(siteRate);
    }

    const channelKey = getChannelKey();
    const channelRate = channelKey ? channelRates[channelKey] : null;

    if (rememberPerChannel && isYouTubeHost() && channelRate) {
      return normalizePlaybackRate(channelRate);
    }

    if (rememberGlobally) {
      return preferredRate;
    }

    return startupDefaultSpeed;
  };

  const enforcePreferredRate = () => {
    if (!isExtensionControllingPage() || !autoApplyPreferredSpeed) {
      return;
    }

    if (getEffectiveNativeMode() === "sync") {
      return;
    }

    applyRate(isBoosting ? BOOST_RATE : getPreferredRateForCurrentVideo(), { persist: false });
  };

  const touchAmbientStart = (event) => {
    if (widgetPlacement !== "floating") {
      return;
    }

    const touch = event.touches?.[0];

    if (touch) {
      lastPointerClientX = touch.clientX;
      lastPointerClientY = touch.clientY;
    }

    clearFloatingHideTimer();
    floatingHoverActive = true;
    applyFloatingAmbientClass();
  };

  const touchAmbientEnd = () => {
    if (widgetPlacement !== "floating") {
      return;
    }

    scheduleFloatingHide();
  };

  const detachVideoListeners = () => {
    if (!activeVideo) {
      return;
    }

    activeVideo.removeEventListener("ratechange", handleRateChange);
    activeVideo.removeEventListener("loadedmetadata", enforcePreferredRate);
    activeVideo.removeEventListener("canplay", enforcePreferredRate);
    activeVideo.removeEventListener("play", enforcePreferredRate);
    activeVideo.removeEventListener("playing", enforcePreferredRate);
    activeVideo.removeEventListener("touchstart", touchAmbientStart);
    activeVideo.removeEventListener("touchend", touchAmbientEnd);
  };

  const watchVideo = () => {
    const video = getVideo();

    if (!video || video === activeVideo) {
      return;
    }

    detachVideoListeners();

    activeVideo = video;
    activeVideo.addEventListener("ratechange", handleRateChange);
    activeVideo.addEventListener("loadedmetadata", enforcePreferredRate);
    activeVideo.addEventListener("canplay", enforcePreferredRate);
    activeVideo.addEventListener("play", enforcePreferredRate);
    activeVideo.addEventListener("playing", enforcePreferredRate);
    activeVideo.addEventListener("touchstart", touchAmbientStart, { passive: true });
    activeVideo.addEventListener("touchend", touchAmbientEnd, { passive: true });

    enforcePreferredRate();
  };

  const refresh = () => {
    if (!isExtensionControllingPage()) {
      widget?.classList.add("ysc-speed-widget-hidden");
      resetFloatingHoverState();
      detachVideoListeners();
      activeVideo = null;
      return;
    }

    placeWidget();
    watchVideo();
  };

  const isEditableElement = (element) => {
    if (!(element instanceof Element)) {
      return false;
    }

    const textInputSelector = [
      "input",
      "textarea",
      "select",
      "[role='textbox']",
      "[role='searchbox']"
    ].join(",");

    return element.isContentEditable
      || element.matches(textInputSelector)
      || Boolean(element.closest(textInputSelector));
  };

  const isTypingContext = (event) => {
    if (isEditableElement(document.activeElement)) {
      return true;
    }

    return event.composedPath().some(isEditableElement);
  };

  const consumeEvent = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const shortcutMatches = (event, shortcut) => {
    if (!shortcut || event.isComposing) {
      return false;
    }

    return event.code === shortcut.code
      && event.shiftKey === Boolean(shortcut.shift)
      && event.ctrlKey === Boolean(shortcut.ctrl)
      && event.altKey === Boolean(shortcut.alt)
      && event.metaKey === Boolean(shortcut.meta);
  };

  /**
   * Identifies if a keyboard event matches the increase or decrease shortcuts (including alternatives) and returns the direction.
   * 
   * Why this code exists:
   * Playback speed control should be responsive to user keyboard input.
   * Supporting both primary and alternative shortcut mappings gives users flexibility.
   * 
   * @danishansari-dev event - The keydown event to evaluate.
   * @returns {number} 1 for speed increase, -1 for speed decrease, 0 otherwise.
   */
  const getShortcutDirection = (event) => {
    if (shortcutMatches(event, shortcuts.increase) || shortcutMatches(event, shortcuts.increaseAlt)) {
      return 1;
    }

    if (shortcutMatches(event, shortcuts.decrease) || shortcutMatches(event, shortcuts.decreaseAlt)) {
      return -1;
    }

    return 0;
  };

  const getPresetRate = (event) => {
    for (const [action, rate] of Object.entries(PRESET_ACTION_RATES)) {
      if (shortcutMatches(event, shortcuts[action])) {
        return rate;
      }
    }

    return null;
  };

  const isResetShortcut = (event) => shortcutMatches(event, shortcuts.reset);

  const isWidgetToggleShortcut = (event) => shortcutMatches(event, shortcuts.widgetToggle);

  const isToastToggleShortcut = (event) => shortcutMatches(event, shortcuts.overlayToggle);

  const isBoostKey = (event) => shortcutMatches(event, shortcuts.boost);

  const isBoostReleaseKey = (event) => event.code === shortcuts.boost.code;

  const startTemporaryBoost = () => {
    if (isBoosting) {
      return;
    }

    isBoosting = true;
    boostRestoreRate = getCurrentRate();
    applyRate(BOOST_RATE, {
      persist: false,
      notify: true,
      notifyAlways: true,
      label: "Boost"
    });
  };

  const stopTemporaryBoost = () => {
    if (!isBoosting) {
      return;
    }

    const restoreRate = boostRestoreRate ?? preferredRate;

    isBoosting = false;
    boostRestoreRate = null;
    applyRate(restoreRate, {
      persist: false,
      notify: true
    });
  };

  const toggleWidgetVisibility = () => {
    widgetHidden = !widgetHidden;
    updateWidgetVisibility();
    saveSetting(STORAGE_KEYS.widgetHidden, widgetHidden);
    showToast({
      label: "Widget",
      value: widgetHidden ? "Off" : "On",
      force: true
    });
  };

  const toggleToastVisibility = () => {
    toastHidden = !toastHidden;
    saveSetting(STORAGE_KEYS.toastHidden, toastHidden);
    showToast({
      label: "Overlay",
      value: toastHidden ? "Off" : "On",
      force: true
    });
  };

  const handleKeyboardShortcut = (event) => {
    if (!extensionEnabled || !keyboardEnabled || isTypingContext(event) || !hasActiveVideoPlayer()) {
      return;
    }

    if (!isExtensionControllingPage()) {
      return;
    }

    if (isBoostKey(event)) {
      if (!boostEnabled) {
        return;
      }

      consumeEvent(event);

      if (!event.repeat) {
        startTemporaryBoost();
      }

      return;
    }

    const direction = getShortcutDirection(event);

    if (direction) {
      consumeEvent(event);
      moveRate(direction, { notify: true });
      return;
    }

    const presetRate = getPresetRate(event);

    if (presetRate !== null) {
      consumeEvent(event);

      if (!event.repeat) {
        applyRate(presetRate, {
          notify: true,
          notifyAlways: true
        });
      }

      return;
    }

    if (isResetShortcut(event)) {
      consumeEvent(event);

      if (!event.repeat) {
        applyRate(1, {
          notify: true,
          notifyAlways: true,
          label: "Reset"
        });
      }

      return;
    }

    if (isWidgetToggleShortcut(event)) {
      consumeEvent(event);

      if (!event.repeat) {
        toggleWidgetVisibility();
      }

      return;
    }

    if (isToastToggleShortcut(event)) {
      consumeEvent(event);

      if (!event.repeat) {
        toggleToastVisibility();
      }
    }
  };

  const handleKeyUp = (event) => {
    if (!isBoosting || !isBoostReleaseKey(event)) {
      return;
    }

    consumeEvent(event);
    stopTemporaryBoost();
  };

  const pathTouchesVideo = (event, video) => {
    if (!video) {
      return false;
    }

    return event.composedPath().includes(video);
  };

  const handleWheel = (event) => {
    if (
      !extensionEnabled
      || !mouseWheelEnabled
      || !event.ctrlKey
      || event.altKey
      || event.metaKey
      || event.shiftKey
      || event.deltaY === 0
    ) {
      return;
    }

    if (!isExtensionControllingPage() || isTypingContext(event)) {
      return;
    }

    const pathVideo = event.composedPath().find(
      (node) => node instanceof HTMLVideoElement && isVideoUsable(node)
    );

    if (pathVideo) {
      lastPointerVideo = pathVideo;
    }

    const targetVideo = getVideo();
    const player = getPlayer();
    const overYoutubeChrome = player && event.composedPath().includes(player);
    const overVideo = pathVideo || pathTouchesVideo(event, targetVideo);

    if (!overYoutubeChrome && !overVideo) {
      return;
    }

    consumeEvent(event);

    const now = performance.now();

    if (now - lastWheelAt < WHEEL_THROTTLE_MS) {
      return;
    }

    lastWheelAt = now;
    moveRate(event.deltaY < 0 ? 1 : -1, { notify: true });
  };

  const getVideoTitle = () => {
    if (isYouTubeHost()) {
      const title = document.querySelector("ytd-watch-metadata h1 yt-formatted-string")?.textContent?.trim()
        || document.querySelector("h1.title yt-formatted-string")?.textContent?.trim()
        || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

      return title || "Untitled video";
    }

    const video = getVideo();
    const aria = video?.getAttribute("aria-label")?.trim();
    const trackLabel = video?.textTracks?.[0]?.label?.trim();

    return aria || trackLabel || document.title.trim() || "Video";
  };

  const getMostUsedSpeed = () => {
    const entries = Object.entries(analytics.speedUsageSeconds || {});

    if (!entries.length) {
      return formatRate(getCurrentRate());
    }

    return entries.sort((a, b) => b[1] - a[1])[0][0];
  };

  const saveAnalytics = () => {
    saveSetting(STORAGE_KEYS.analytics, analytics);
    analyticsLastSaveAt = performance.now();
  };

  const trackAnalytics = () => {
    const now = performance.now();
    const video = getVideo();

    if (!analyticsLastAt) {
      analyticsLastAt = now;
      return;
    }

    const deltaSeconds = Math.min(5, Math.max(0, (now - analyticsLastAt) / 1000));
    analyticsLastAt = now;

    if (!isExtensionControllingPage() || !video || video.paused || video.ended || deltaSeconds <= 0) {
      return;
    }

    if (analytics.dailyDate !== getTodayKey()) {
      analytics.dailyDate = getTodayKey();
      analytics.dailyUsageSeconds = 0;
      analytics = normalizeAnalytics(analytics);
    }

    const rate = normalizePlaybackRate(video.playbackRate || preferredRate);
    const rateLabel = formatRate(rate);
    const todayUsage = {
      ...asPlainObject(analytics.speedUsageByDate?.[analytics.dailyDate])
    };

    todayUsage[rateLabel] = (todayUsage[rateLabel] || 0) + deltaSeconds;

    analytics.dailyUsageSeconds += deltaSeconds;
    analytics.timeSavedSeconds += Math.max(0, deltaSeconds * (rate - 1));
    analytics.speedUsageSeconds = {
      ...analytics.speedUsageSeconds,
      [rateLabel]: (analytics.speedUsageSeconds[rateLabel] || 0) + deltaSeconds
    };
    analytics.speedUsageByDate = {
      ...analytics.speedUsageByDate,
      [analytics.dailyDate]: todayUsage
    };

    sessionActiveSeconds += deltaSeconds;
    sessionRateWeightedSeconds += rate * deltaSeconds;

    if (now - analyticsLastSaveAt > 15000) {
      saveAnalytics();
    }
  };

  const getAccessBlockReason = () => {
    const host = normalizeHost(getHostname());
    const list = siteAccessList.map(normalizeHost).filter(Boolean);

    if (siteAccessMode === "whitelist" && !list.includes(host)) {
      return "whitelist";
    }

    if (siteAccessMode === "blacklist" && list.includes(host)) {
      return "blacklist";
    }

    if (getSitePolicy().disabled) {
      return "site_disabled";
    }

    return null;
  };

  const getSettingsSnapshot = () => ({
    enabled: extensionEnabled,
    widgetEnabled: !widgetHidden,
    keyboardEnabled,
    mouseWheelEnabled,
    boostEnabled,
    rememberPerChannel,
    rememberGlobally,
    rememberPerSite,
    autoApplyPreferredSpeed,
    compactMode,
    overlayEnabled: !toastHidden,
    fullscreenOnlyControls,
    themeMode,
    startupDefaultSpeed,
    siteAccessMode,
    defaultNativeMode
  });

  const collectState = () => {
    const video = getVideo();
    const hasVideo = Boolean(video && isVideoUsable(video));
    const rate = getCurrentRate();
    const sessionAverageSpeed = sessionActiveSeconds
      ? sessionRateWeightedSeconds / sessionActiveSeconds
      : rate;
    const host = getHostname();
    const policy = getSitePolicy();
    const nativeMode = getEffectiveNativeMode();

    let status = "Active";

    if (!extensionEnabled) {
      status = "Disabled";
    } else if (getAccessBlockReason()) {
      status = "Disabled on this site";
    } else if (!hasVideo) {
      status = "No active video found";
    }

    return {
      status,
      enabled: extensionEnabled,
      hasVideo,
      rate,
      preferredRate,
      minRate: MIN_PLAYBACK_RATE,
      maxRate: MAX_PLAYBACK_RATE,
      step: SPEED_STEP,
      video: {
        title: hasVideo ? getVideoTitle() : "",
        duration: hasVideo && Number.isFinite(video.duration) ? video.duration : 0,
        currentTime: hasVideo && Number.isFinite(video.currentTime) ? video.currentTime : 0,
        paused: hasVideo ? video.paused : true
      },
      tab: {
        domain: host,
        url: location.href,
        isYouTube: isYouTubeHost(),
        siteDisabled: policy.disabled === true,
        rememberPerSite,
        sitePreferredRate: policy.preferredRate ?? null,
        siteNativeOverride: policy.nativeMode ?? null,
        nativeMode,
        defaultNativeMode,
        siteAccessMode,
        siteAccessList,
        accessBlockedReason: getAccessBlockReason(),
        nativeControlsLikely: hasVideo ? detectNativeSpeedHeuristic(video) : false
      },
      settings: getSettingsSnapshot(),
      shortcuts,
      analytics: {
        dailyUsageSeconds: analytics.dailyUsageSeconds || 0,
        timeSavedSeconds: analytics.timeSavedSeconds || 0,
        mostUsedSpeed: getMostUsedSpeed(),
        sessionAverageSpeed
      }
    };
  };

  const updateExtensionSetting = (key, value) => {
    switch (key) {
      case "enabled":
        extensionEnabled = Boolean(value);
        saveSetting(STORAGE_KEYS.enabled, extensionEnabled);
        if (!extensionEnabled) {
          stopTemporaryBoost();
          stopSpeedHold({ suppressClick: false });
        } else {
          enforcePreferredRate();
        }
        break;
      case "widgetEnabled":
        widgetHidden = !value;
        saveSetting(STORAGE_KEYS.widgetHidden, widgetHidden);
        break;
      case "keyboardEnabled":
        keyboardEnabled = Boolean(value);
        saveSetting(STORAGE_KEYS.keyboardEnabled, keyboardEnabled);
        break;
      case "mouseWheelEnabled":
        mouseWheelEnabled = Boolean(value);
        saveSetting(STORAGE_KEYS.mouseWheelEnabled, mouseWheelEnabled);
        break;
      case "boostEnabled":
        boostEnabled = Boolean(value);
        saveSetting(STORAGE_KEYS.boostEnabled, boostEnabled);
        if (!boostEnabled) {
          stopTemporaryBoost();
        }
        break;
      case "rememberPerChannel":
        rememberPerChannel = Boolean(value);
        saveSetting(STORAGE_KEYS.rememberPerChannel, rememberPerChannel);
        break;
      case "rememberGlobally":
        rememberGlobally = Boolean(value);
        saveSetting(STORAGE_KEYS.rememberGlobally, rememberGlobally);
        break;
      case "rememberPerSite":
        rememberPerSite = Boolean(value);
        saveSetting(STORAGE_KEYS.rememberPerSite, rememberPerSite);
        break;
      case "autoApplyPreferredSpeed":
        autoApplyPreferredSpeed = Boolean(value);
        saveSetting(STORAGE_KEYS.autoApplyPreferredSpeed, autoApplyPreferredSpeed);
        if (autoApplyPreferredSpeed) {
          enforcePreferredRate();
        }
        break;
      case "compactMode":
        compactMode = Boolean(value);
        saveSetting(STORAGE_KEYS.compactMode, compactMode);
        break;
      case "overlayEnabled":
        toastHidden = !value;
        saveSetting(STORAGE_KEYS.toastHidden, toastHidden);
        break;
      case "fullscreenOnlyControls":
        fullscreenOnlyControls = Boolean(value);
        saveSetting(STORAGE_KEYS.fullscreenOnlyControls, fullscreenOnlyControls);
        break;
      case "themeMode":
        themeMode = ["auto", "dark", "light"].includes(value) ? value : "auto";
        saveSetting(STORAGE_KEYS.themeMode, themeMode);
        break;
      case "startupDefaultSpeed":
        startupDefaultSpeed = normalizePlaybackRate(value);
        saveSetting(STORAGE_KEYS.startupDefaultSpeed, startupDefaultSpeed);
        break;
      case "siteAccessMode":
        siteAccessMode = ["all", "whitelist", "blacklist"].includes(value) ? value : "all";
        saveSetting(STORAGE_KEYS.siteAccessMode, siteAccessMode);
        break;
      case "defaultNativeMode":
        defaultNativeMode = ["override", "sync"].includes(value) ? value : "override";
        saveSetting(STORAGE_KEYS.defaultNativeMode, defaultNativeMode);
        break;
      default:
        return false;
    }

    updateWidgetVisibility();
    applyFloatingPresentation();
    return true;
  };

  const handleRuntimeMessage = (message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string" || !message.type.startsWith("YSC_")) {
      return false;
    }

    if (message.type === "YSC_GET_STATE") {
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_SET_RATE") {
      applyRate(message.rate, {
        notify: true,
        notifyAlways: true
      });
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_MOVE_RATE") {
      moveRate(Number(message.direction) > 0 ? 1 : -1, { notify: true });
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_UPDATE_SETTING") {
      const updated = updateExtensionSetting(message.key, message.value);
      sendResponse({ ok: updated, state: collectState() });
      return true;
    }

    if (message.type === "YSC_UPDATE_SHORTCUTS") {
      shortcuts = normalizeShortcuts(message.shortcuts);
      saveSetting(STORAGE_KEYS.shortcuts, shortcuts);
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_RESET_SHORTCUTS") {
      shortcuts = normalizeShortcuts({});
      saveSetting(STORAGE_KEYS.shortcuts, shortcuts);
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_SET_SITE_DISABLED") {
      updateSitePolicy({ disabled: Boolean(message.disabled) });
      refresh();
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_SET_SITE_NATIVE_MODE") {
      const mode = message.mode === "default"
        ? null
        : (message.mode === "override" || message.mode === "sync" ? message.mode : null);

      updateSitePolicy({
        nativeMode: mode
      });
      refresh();
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_SET_SITE_ACCESS_LIST") {
      siteAccessMode = ["all", "whitelist", "blacklist"].includes(message.mode) ? message.mode : "all";
      siteAccessList = normalizeAccessList(message.hosts);
      saveSetting(STORAGE_KEYS.siteAccessMode, siteAccessMode);
      saveSetting(STORAGE_KEYS.siteAccessList, siteAccessList);
      refresh();
      sendResponse({ ok: true, state: collectState() });
      return true;
    }

    if (message.type === "YSC_STORAGE_CHANGED") {
      readStoredSettings()
        .then((settings) => {
          applyStoredSettings(settings);
          refresh();
          sendResponse({ ok: true, state: collectState() });
        })
        .catch((error) => {
          console.error("[Video Speed Controller] Failed to refresh settings.", error);
          sendResponse({ ok: false });
        });
      return true;
    }

    return false;
  };

  const scheduleRefresh = () => {
    if (mutationTimer) {
      return;
    }

    mutationTimer = window.setTimeout(() => {
      mutationTimer = 0;
      refresh();
    }, 500);
  };

  const handlePointerMove = (event) => {
    if (pointerMoveTimer) {
      return;
    }

    pointerMoveTimer = window.requestAnimationFrame(() => {
      pointerMoveTimer = 0;
      lastPointerClientX = event.clientX;
      lastPointerClientY = event.clientY;
      const path = event.composedPath();
      const hovered = path.find((node) => node instanceof HTMLVideoElement && isVideoUsable(node));

      lastPointerVideo = hovered || lastPointerVideo;
      updateFloatingHoverFromClientPoint(lastPointerClientX, lastPointerClientY);

      if (!isYouTubeHost()) {
        return;
      }

      const hoveredPlayer = hovered?.closest?.(".html5-video-player");

      // Don't place the widget on YouTube homepage/preview players at all
      if (hoveredPlayer && !isYouTubeWatchPlayer(hoveredPlayer)) {
        return;
      }

      if (hoveredPlayer && isYouTubeWatchPlayer(hoveredPlayer) && widgetPlacement !== "youtube") {
        placeWidget();
        return;
      }

      if (widgetPlacement === "floating") {
        applyFloatingPresentation();
      }
    });
  };

  /**
   * Sets up event listeners to respond to SPA routing events.
   * 
   * Why this code exists:
   * The MAIN world script (inject.js) detects routing events and posts
   * a window message. This function listens to those messages to trigger
   * video detection refreshes in the isolated world.
   * 
   * @danishansari-dev - None
   * @returns {void}
   */
  const hookHistory = () => {
    window.addEventListener("message", (event) => {
      if (event.source === window && event.data?.type === "YSC_SPA_NAVIGATE") {
        scheduleRefresh();
      }
    });
  };

  const applyStoredSettings = (settings) => {
    preferredRate = settings.rate;
    extensionEnabled = settings.enabled;
    widgetHidden = settings.widgetHidden;
    toastHidden = settings.toastHidden;
    keyboardEnabled = settings.keyboardEnabled;
    mouseWheelEnabled = settings.mouseWheelEnabled;
    boostEnabled = settings.boostEnabled;
    rememberPerChannel = settings.rememberPerChannel;
    rememberGlobally = settings.rememberGlobally;
    rememberPerSite = settings.rememberPerSite;
    autoApplyPreferredSpeed = settings.autoApplyPreferredSpeed;
    compactMode = settings.compactMode;
    fullscreenOnlyControls = settings.fullscreenOnlyControls;
    themeMode = settings.themeMode;
    startupDefaultSpeed = settings.startupDefaultSpeed;
    shortcuts = settings.shortcuts;
    channelRates = settings.channelRates;
    analytics = settings.analytics;
    sitePolicies = settings.sitePolicies;
    siteAccessMode = settings.siteAccessMode;
    siteAccessList = settings.siteAccessList;
    defaultNativeMode = settings.defaultNativeMode;
  };

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  const start = async () => {
    const settings = await readStoredSettings();

    applyStoredSettings(settings);

    observedShadowRoots = new WeakSet();
    rootObserver = new MutationObserver(scheduleRefresh);
    rootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    refresh();

    window.addEventListener("keydown", handleKeyboardShortcut, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", stopTemporaryBoost, true);
    window.addEventListener("blur", () => stopSpeedHold(), true);
    window.addEventListener("blur", () => {
      if (widgetPlacement !== "floating") {
        return;
      }

      clearFloatingHideTimer();
      floatingHoverActive = false;
      applyFloatingAmbientClass();
    }, true);
    window.addEventListener("mouseup", stopSpeedHold, true);
    window.addEventListener("touchend", stopSpeedHold, true);
    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("fullscreenchange", () => {
      applyFloatingPresentation();
      updateWidgetVisibility();
      updateFloatingHoverFromClientPoint(lastPointerClientX, lastPointerClientY);
    });
    window.addEventListener("resize", () => {
      window.clearTimeout(themeSampleTimer);
      themeSampleTimer = window.setTimeout(() => {
        applyFloatingPresentation();
        updateFloatingHoverFromClientPoint(lastPointerClientX, lastPointerClientY);
      }, 120);
    });
    window.addEventListener("beforeunload", saveAnalytics);
    // Also save on tab hide/switch — more reliable than beforeunload for tab closes
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        saveAnalytics();
      }
    });
    document.addEventListener("yt-navigate-finish", scheduleRefresh);
    document.addEventListener("yt-player-updated", scheduleRefresh);
    document.addEventListener("enterpictureinpicture", scheduleRefresh, true);
    document.addEventListener("leavepictureinpicture", scheduleRefresh, true);
    window.setInterval(trackAnalytics, 1000);
    hookHistory();
  };

  try {
    const startup = start();

    if (startup && typeof startup.catch === "function") {
      startup.catch((error) => {
        console.error("[Video Speed Controller] Failed to start content script.", error);
      });
    }
  } catch (error) {
    console.error("[Video Speed Controller] Failed to start content script.", error);
  }
})();

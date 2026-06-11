(() => {
  "use strict";

  const SCRIPT_INSTANCE_KEY = "__youtubeSpeedControllerLoaded";
  const CLEANUP_FN_KEY = "__youtubeSpeedControllerCleanup";

  // Prevent multiple active initializations from running on the same page.
  // Why this exists:
  // If the extension is updated or reloaded, multiple instances of the script
  // might try to mount listeners. The CLEANUP_FN_KEY mechanism (defined below)
  // handles tearing down the old instance, but we check SCRIPT_INSTANCE_KEY
  // to ensure this wrapper context executes only once.
  if (window[SCRIPT_INSTANCE_KEY]) {
    return;
  }
  window[SCRIPT_INSTANCE_KEY] = true;

  // Use shared constants from constants.js (loaded before this script in manifest)
  const STORAGE_KEYS = globalThis.YSC_STORAGE_KEYS || {};
  const DEFAULT_SHORTCUTS = globalThis.YSC_DEFAULT_SHORTCUTS || {};
  const PRESET_ACTION_RATES = globalThis.YSC_PRESET_ACTION_RATES || {};

  if (!globalThis.YSC_DEFAULT_SHORTCUTS || !globalThis.YSC_PRESET_ACTION_RATES) {
    console.error("[Video Speed Controller] Shared constants failed to load.");
  }

  // --- CONFIGURATION CONSTANTS ---
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
  const ANALYTICS_RETENTION_DAYS = 90;

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

  const DEFAULT_ANALYTICS = {
    dailyDate: "",
    dailyUsageSeconds: 0,
    timeSavedSeconds: 0,
    speedUsageSeconds: {},
    speedUsageByDate: {}
  };

  // --- UTILS & HELPERS ---

  /**
   * Safe access to chrome storage local instance.
   * 
   * Why this exists:
   * Accessing chrome APIs when the extension context is invalidated throws synchronous errors.
   * We wrap it to prevent crashes and return null to indicate storage is currently unavailable.
   * 
   * @danishansari-dev - None
   * @returns {chrome.storage.StorageArea|null} The storage area instance or null if unavailable.
   */
  const getChromeStorage = () => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        return null;
      }
      return chrome.storage.local;
    } catch {
      return null;
    }
  };

  /**
   * Get the current site hostname.
   * 
   * Why this exists:
   * Provides domain name query fallback for sandboxed contexts.
   * 
   * @danishansari-dev - None
   * @returns {string} Domain hostname.
   */
  const getHostname = () => (typeof location !== "undefined" ? location.hostname : "");

  /**
   * Normalizes hostname strings.
   * 
   * Why this exists:
   * Trims whitespace and enforces lower case to prevent policy check mismatches.
   * 
   * @danishansari-dev host - Hostname string to normalize.
   * @returns {string} Normalized domain name.
   */
  const normalizeHost = (host) => String(host || "").trim().toLowerCase();

  /**
   * Checks if current page is on YouTube.
   * 
   * Why this exists:
   * Used to apply YouTube player specific overrides and channel rates logic.
   * 
   * @danishansari-dev - None
   * @returns {boolean} True if running on a YouTube domain.
   */
  const isYouTubeHost = () => {
    const host = getHostname();
    return host === "youtube.com" || host.endsWith(".youtube.com");
  };

  /**
   * Coerces value into a plain object.
   * 
   * Why this exists:
   * Guards against type mismatch crashes when storage yields unexpected structures.
   * 
   * @danishansari-dev value - Value to coerce.
   * @returns {object} Checked object.
   */
  const asPlainObject = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value;
  };

  /**
   * Rounds a rate to the nearest speed step.
   * 
   * Why this exists:
   * Enforces discrete speed steps (e.g. increments of 0.25x) for consistent UI and memory.
   * 
   * @danishansari-dev rate - Playback rate to round.
   * @returns {number} Rounded speed rate.
   */
  const roundToStep = (rate) => Number((Math.round(rate / SPEED_STEP) * SPEED_STEP).toFixed(2));

  /**
   * Clamps and normalizes a playback speed.
   * 
   * Why this exists:
   * Prevents site playback speeds from exceeding range bounds (0.25x to 10x).
   * 
   * @danishansari-dev rate - Value to clamp.
   * @returns {number} Clamped playback rate.
   */
  const normalizePlaybackRate = (rate) => {
    const parsed = Number(rate);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, roundToStep(parsed)));
  };

  /**
   * Formats playback speed into user friendly text.
   * 
   * Why this exists:
   * Removes trailing fractional zeroes for neat overlays (e.g., 2.0 -> "2x").
   * 
   * @danishansari-dev rate - Playback rate value.
   * @returns {string} UI formatted speed string.
   */
  const formatRate = (rate) => {
    const normalized = normalizePlaybackRate(rate);
    return `${String(Number(normalized.toFixed(2)))}x`;
  };

  /**
   * Gets today's date string.
   * 
   * Why this exists:
   * Returns keys in YYYY-MM-DD format for analytics categorization.
   * 
   * @danishansari-dev - None
   * @returns {string} Current date string.
   */
  const getTodayKey = () => new Date().toISOString().slice(0, 10);

  /**
   * Gets retention date cutoff string.
   * 
   * Why this exists:
   * Ensures old analytics are purged to prevent storage bloat.
   * 
   * @danishansari-dev - None
   * @returns {string} Cutoff date string.
   */
  const getRetentionCutoffKey = () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ANALYTICS_RETENTION_DAYS);
    return cutoff.toISOString().slice(0, 10);
  };

  // --- SETTINGS MANAGER ---

  /**
   * Manages extension configurations and synchronizes with storage.
   * 
   * Why this exists:
   * Coordinates reads and writes to chrome.storage.local, executes default mappings,
   * handles block lists, and isolates invalidation errors.
   */
  class SettingsManager {
    constructor() {
      this.rate = 1;
      this.enabled = true;
      this.widgetHidden = false;
      this.toastHidden = false;
      this.keyboardEnabled = true;
      this.mouseWheelEnabled = true;
      this.boostEnabled = true;
      this.rememberPerChannel = false;
      this.rememberGlobally = true;
      this.rememberPerSite = true;
      this.autoApplyPreferredSpeed = true;
      this.compactMode = false;
      this.fullscreenOnlyControls = false;
      this.themeMode = "auto";
      this.startupDefaultSpeed = 1;
      this.shortcuts = { ...DEFAULT_SHORTCUTS };
      this.channelRates = {};
      this.analytics = { ...DEFAULT_ANALYTICS };
      this.sitePolicies = {};
      this.siteAccessMode = "all";
      this.siteAccessList = [];
      this.defaultNativeMode = "override";
      // Why this exists:
      // Stores whether the user has dismissed the store review prompt to prevent showing it again.
      this.reviewPromptDismissed = false;
      this.saveTimer = null;
    }

    /**
     * Normalizes site-specific policies object.
     * 
     * @danishansari-dev raw - Raw policy settings from storage.
     * @returns {object} Structured policy mapping.
     */
    normalizeSitePolicies(raw) {
      const next = {};
      const source = asPlainObject(raw);
      for (const [host, policy] of Object.entries(source)) {
        const key = normalizeHost(host);
        if (!key) continue;
        const plain = asPlainObject(policy);
        next[key] = {
          disabled: plain.disabled === true,
          preferredRate: Number.isFinite(Number(plain.preferredRate))
            ? normalizePlaybackRate(plain.preferredRate)
            : null,
          nativeMode: ["override", "sync"].includes(plain.nativeMode) ? plain.nativeMode : null
        };
      }
      return next;
    }

    /**
     * Normalizes the site whitelist/blacklist.
     * 
     * @danishansari-dev raw - Raw access list array.
     * @returns {string[]} Sanitized domain array.
     */
    normalizeAccessList(raw) {
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw.map(normalizeHost).filter(Boolean);
    }

    /**
     * Normalizes a single shortcut configuration structure.
     * 
     * @danishansari-dev shortcut - Shortcut keys configuration.
     * @danishansari-dev fallback - Default fallback options.
     * @returns {object} Validated shortcut mapping.
     */
    normalizeShortcut(shortcut, fallback) {
      return {
        ...fallback,
        ...asPlainObject(shortcut),
        label: String(shortcut?.label || fallback.label),
        code: String(shortcut?.code || fallback.code),
        shift: Boolean(shortcut?.shift ?? fallback.shift),
        ctrl: Boolean(shortcut?.ctrl ?? fallback.ctrl),
        alt: Boolean(shortcut?.alt ?? fallback.alt),
        meta: Boolean(shortcut?.meta ?? fallback.meta),
        hold: Boolean(shortcut?.hold ?? fallback.hold)
      };
    }

    /**
     * Normalizes the active shortcut set.
     * 
     * @danishansari-dev storedShortcuts - Shortcut configurations loaded from storage.
     * @returns {object} Full shortcut mapping object.
     */
    normalizeShortcuts(storedShortcuts) {
      return Object.fromEntries(
        Object.entries(DEFAULT_SHORTCUTS).map(([action, fallback]) => [
          action,
          this.normalizeShortcut(asPlainObject(storedShortcuts)[action], fallback)
        ])
      );
    }

    /**
     * Normalizes and limits size of analytics data records.
     * 
     * @danishansari-dev storedAnalytics - Analytics metrics from storage.
     * @returns {object} Trimmed analytics model.
     */
    normalizeAnalytics(storedAnalytics) {
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
    }

    /**
     * Loads settings from chrome storage or returns default profiles.
     * 
     * Why this exists:
     * Guarantees context-safety when calling storage.get. Resolves values if context fails.
     * 
     * @danishansari-dev - None
     * @returns {Promise<object>} Loaded configurations.
     */
    readStoredSettings() {
      return new Promise((resolve) => {
        const storage = getChromeStorage();
        if (!storage) {
          resolve(this.getDefaultSnapshot());
          return;
        }

        try {
          storage.get(Object.values(STORAGE_KEYS), (result) => {
            if (chrome.runtime?.lastError) {
              resolve(this.getDefaultSnapshot());
              return;
            }

            resolve({
              rate: normalizePlaybackRate(result[STORAGE_KEYS.rate]),
              enabled: result[STORAGE_KEYS.enabled] !== false,
              widgetHidden: result[STORAGE_KEYS.widgetHidden] === true,
              toastHidden: result[STORAGE_KEYS.toastHidden] === true || result[STORAGE_KEYS.toastHidden] === "true",
              keyboardEnabled: result[STORAGE_KEYS.keyboardEnabled] !== false,
              mouseWheelEnabled: result[STORAGE_KEYS.mouseWheelEnabled] !== false,
              boostEnabled: result[STORAGE_KEYS.boostEnabled] !== false,
              rememberPerChannel: result[STORAGE_KEYS.rememberPerChannel] === true,
              rememberGlobally: result[STORAGE_KEYS.rememberGlobally] !== false,
              rememberPerSite: result[STORAGE_KEYS.rememberPerSite] !== false,
              autoApplyPreferredSpeed: result[STORAGE_KEYS.autoApplyPreferredSpeed] !== false,
              compactMode: result[STORAGE_KEYS.compactMode] === true,
              fullscreenOnlyControls: result[STORAGE_KEYS.fullscreenOnlyControls] === true,
              themeMode: ["auto", "dark", "light"].includes(result[STORAGE_KEYS.themeMode]) ? result[STORAGE_KEYS.themeMode] : "auto",
              startupDefaultSpeed: normalizePlaybackRate(result[STORAGE_KEYS.startupDefaultSpeed] || 1),
              shortcuts: this.normalizeShortcuts(result[STORAGE_KEYS.shortcuts]),
              channelRates: asPlainObject(result[STORAGE_KEYS.channelRates]),
              analytics: this.normalizeAnalytics(result[STORAGE_KEYS.analytics]),
              sitePolicies: this.normalizeSitePolicies(result[STORAGE_KEYS.sitePolicies]),
              siteAccessMode: ["all", "whitelist", "blacklist"].includes(result[STORAGE_KEYS.siteAccessMode]) ? result[STORAGE_KEYS.siteAccessMode] : "all",
              siteAccessList: this.normalizeAccessList(result[STORAGE_KEYS.siteAccessList]),
              defaultNativeMode: ["override", "sync"].includes(result[STORAGE_KEYS.defaultNativeMode]) ? result[STORAGE_KEYS.defaultNativeMode] : "override",
              reviewPromptDismissed: result[STORAGE_KEYS.reviewPromptDismissed] === true
            });
          });
        } catch {
          resolve(this.getDefaultSnapshot());
        }
      });
    }

    /**
     * Applies settings object variables directly into instance fields.
     * 
     * @danishansari-dev settings - Settings dictionary to merge.
     */
    applyStoredSettings(settings) {
      Object.assign(this, settings);
    }

    /**
     * Gets fallback snapshot mapping.
     * 
     * @danishansari-dev - None
     * @returns {object} Default settings model.
     */
    getDefaultSnapshot() {
      return {
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
        shortcuts: this.normalizeShortcuts({}),
        channelRates: {},
        analytics: this.normalizeAnalytics({}),
        sitePolicies: {},
        siteAccessMode: "all",
        siteAccessList: [],
        defaultNativeMode: "override",
        reviewPromptDismissed: false
      };
    }

    /**
     * Safely updates a storage setting.
     * 
     * @danishansari-dev key - Storage key name.
     * @danishansari-dev value - Data payload.
     */
    saveSetting(key, value) {
      const storage = getChromeStorage();
      if (!storage) return;
      try {
        storage.set({ [key]: value });
      } catch {
        // Ignore errors if context is dead
      }
    }

    /**
     * Commits runtime adjustments and notifies listeners.
     * 
     * @danishansari-dev key - Setting key.
     * @danishansari-dev value - Data payload.
     * @returns {boolean} True if key matched and updated.
     */
    updateSetting(key, value) {
      switch (key) {
        case "enabled":
          this.enabled = Boolean(value);
          this.saveSetting(STORAGE_KEYS.enabled, this.enabled);
          break;
        case "widgetEnabled":
          this.widgetHidden = !value;
          this.saveSetting(STORAGE_KEYS.widgetHidden, this.widgetHidden);
          break;
        case "keyboardEnabled":
          this.keyboardEnabled = Boolean(value);
          this.saveSetting(STORAGE_KEYS.keyboardEnabled, this.keyboardEnabled);
          break;
        case "mouseWheelEnabled":
          this.mouseWheelEnabled = Boolean(value);
          this.saveSetting(STORAGE_KEYS.mouseWheelEnabled, this.mouseWheelEnabled);
          break;
        case "boostEnabled":
          this.boostEnabled = Boolean(value);
          this.saveSetting(STORAGE_KEYS.boostEnabled, this.boostEnabled);
          break;
        case "rememberPerChannel":
          this.rememberPerChannel = Boolean(value);
          this.saveSetting(STORAGE_KEYS.rememberPerChannel, this.rememberPerChannel);
          break;
        case "rememberGlobally":
          this.rememberGlobally = Boolean(value);
          this.saveSetting(STORAGE_KEYS.rememberGlobally, this.rememberGlobally);
          break;
        case "rememberPerSite":
          this.rememberPerSite = Boolean(value);
          this.saveSetting(STORAGE_KEYS.rememberPerSite, this.rememberPerSite);
          break;
        case "autoApplyPreferredSpeed":
          this.autoApplyPreferredSpeed = Boolean(value);
          this.saveSetting(STORAGE_KEYS.autoApplyPreferredSpeed, this.autoApplyPreferredSpeed);
          break;
        case "compactMode":
          this.compactMode = Boolean(value);
          this.saveSetting(STORAGE_KEYS.compactMode, this.compactMode);
          break;
        case "overlayEnabled":
          this.toastHidden = !value;
          this.saveSetting(STORAGE_KEYS.toastHidden, this.toastHidden);
          break;
        case "fullscreenOnlyControls":
          this.fullscreenOnlyControls = Boolean(value);
          this.saveSetting(STORAGE_KEYS.fullscreenOnlyControls, this.fullscreenOnlyControls);
          break;
        case "themeMode":
          this.themeMode = ["auto", "dark", "light"].includes(value) ? value : "auto";
          this.saveSetting(STORAGE_KEYS.themeMode, this.themeMode);
          break;
        case "startupDefaultSpeed":
          this.startupDefaultSpeed = normalizePlaybackRate(value);
          this.saveSetting(STORAGE_KEYS.startupDefaultSpeed, this.startupDefaultSpeed);
          break;
        case "siteAccessMode":
          this.siteAccessMode = ["all", "whitelist", "blacklist"].includes(value) ? value : "all";
          this.saveSetting(STORAGE_KEYS.siteAccessMode, this.siteAccessMode);
          break;
        case "defaultNativeMode":
          this.defaultNativeMode = ["override", "sync"].includes(value) ? value : "override";
          this.saveSetting(STORAGE_KEYS.defaultNativeMode, this.defaultNativeMode);
          break;
        case "reviewPromptDismissed":
          // Why this exists:
          // Persists the user's dismissal of the review solicitation card.
          this.reviewPromptDismissed = Boolean(value);
          this.saveSetting(STORAGE_KEYS.reviewPromptDismissed, this.reviewPromptDismissed);
          break;
        default:
          return false;
      }
      return true;
    }

    /**
     * Debounces and saves speed settings globally or by site/channel parameters.
     * 
     * Why this exists:
     * Repeated updates (like holding down keys) are debounced to prevent storage API throttles.
     * 
     * @danishansari-dev rate - Normalized rate.
     * @danishansari-dev channelKey - Channel ID string if on YouTube watch.
     */
    savePreferredRate(rate, channelKey) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        const normalizedRate = normalizePlaybackRate(rate);
        const nextStorage = {};
        const host = normalizeHost(getHostname());

        if (this.rememberGlobally) {
          nextStorage[STORAGE_KEYS.rate] = normalizedRate;
        }

        if (this.rememberPerChannel && isYouTubeHost() && channelKey) {
          this.channelRates = {
            ...this.channelRates,
            [channelKey]: normalizedRate
          };
          nextStorage[STORAGE_KEYS.channelRates] = this.channelRates;
        }

        if (this.rememberPerSite && host) {
          const policy = asPlainObject(this.sitePolicies[host]);
          this.sitePolicies = {
            ...this.sitePolicies,
            [host]: {
              ...policy,
              preferredRate: normalizedRate
            }
          };
          nextStorage[STORAGE_KEYS.sitePolicies] = this.sitePolicies;
        }

        const storage = getChromeStorage();
        if (storage && Object.keys(nextStorage).length) {
          try {
            storage.set(nextStorage);
          } catch {
            // Ignore context dead issues
          }
        }
      }, 100);
    }

    /**
     * Resolves policy rules based on domain configurations.
     * 
     * @danishansari-dev - None
     * @returns {object} Current site policy.
     */
    getSitePolicy() {
      return this.sitePolicies[normalizeHost(getHostname())] || {};
    }

    /**
     * Checks if current domain is on block/access bounds.
     * 
     * @danishansari-dev - None
     * @returns {boolean} True if script passes gating.
     */
    passesSiteAccessGate() {
      const host = normalizeHost(getHostname());
      const list = this.siteAccessList.map(normalizeHost).filter(Boolean);

      if (this.siteAccessMode === "whitelist") {
        return list.includes(host);
      }
      if (this.siteAccessMode === "blacklist") {
        return !list.includes(host);
      }
      return true;
    }

    /**
     * Checks if site disabled flag is set.
     * 
     * @danishansari-dev - None
     * @returns {boolean} True if disabled.
     */
    isSiteDisabled() {
      if (!this.passesSiteAccessGate()) {
        return true;
      }
      return this.getSitePolicy().disabled === true;
    }

    /**
     * Resolves if controller should take action on this tab.
     * 
     * @danishansari-dev - None
     * @returns {boolean} Controlling status.
     */
    isExtensionControllingPage() {
      return this.enabled && !this.isSiteDisabled();
    }

    /**
     * Returns blocking reason key.
     * 
     * @danishansari-dev - None
     * @returns {string|null} Access block reason.
     */
    getAccessBlockReason() {
      const host = normalizeHost(getHostname());
      const list = this.siteAccessList.map(normalizeHost).filter(Boolean);

      if (this.siteAccessMode === "whitelist" && !list.includes(host)) {
        return "whitelist";
      }
      if (this.siteAccessMode === "blacklist" && list.includes(host)) {
        return "blacklist";
      }
      if (this.getSitePolicy().disabled) {
        return "site_disabled";
      }
      return null;
    }

    /**
     * Resolves speed override logic mode.
     * 
     * @danishansari-dev - None
     * @returns {string} "sync" or "override".
     */
    getEffectiveNativeMode() {
      const policyMode = this.getSitePolicy().nativeMode;
      if (policyMode === "override" || policyMode === "sync") {
        return policyMode;
      }
      return this.defaultNativeMode === "sync" ? "sync" : "override";
    }

    /**
     * Commits modifications to site policy definitions.
     * 
     * @danishansari-dev partial - Partial policy changes.
     */
    updateSitePolicy(partial) {
      const host = normalizeHost(getHostname());
      if (!host) return;

      const current = asPlainObject(this.sitePolicies[host]);
      const next = { ...current, ...partial };
      const empty = !next.disabled
        && (next.preferredRate === null || next.preferredRate === undefined)
        && (next.nativeMode === null || next.nativeMode === "");

      if (empty) {
        delete this.sitePolicies[host];
      } else {
        this.sitePolicies = { ...this.sitePolicies, [host]: next };
      }
      this.saveSetting(STORAGE_KEYS.sitePolicies, this.sitePolicies);
    }

    /**
     * Calculates video start preference rates.
     * 
     * @danishansari-dev channelKey - Channel key string.
     * @returns {number} Preferred playback speed.
     */
    getPreferredRateForVideo(channelKey) {
      const host = normalizeHost(getHostname());
      const siteRate = this.rememberPerSite && host ? this.sitePolicies[host]?.preferredRate : null;

      if (this.rememberPerSite && Number.isFinite(siteRate)) {
        return normalizePlaybackRate(siteRate);
      }

      const channelRate = channelKey ? this.channelRates[channelKey] : null;
      if (this.rememberPerChannel && isYouTubeHost() && channelRate) {
        return normalizePlaybackRate(channelRate);
      }

      if (this.rememberGlobally) {
        return this.rate;
      }

      return this.startupDefaultSpeed;
    }

    /**
     * Clears timeouts and timer handles.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      window.clearTimeout(this.saveTimer);
    }
  }

  // --- DOM OBSERVER ---

  // Exclude common formatting/structural nodes to keep the shadow crawler extremely fast.
  const EXCLUDED_SCAN_TAGS = new Set([
    "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "IFRAME", "SVG", "PATH", "G", "POLYGON",
    "LI", "UL", "OL", "SPAN", "A", "P", "H1", "H2", "H3", "H4", "H5", "H6", "B", "I", "U", "STRONG", "EM"
  ]);

  /**
   * Tracks video elements across light DOM and shadow roots efficiently.
   * 
   * Why this exists:
   * Periodic generic queries like querySelectorAll("*") are slow.
   * We walk the DOM skipping text/styling tags, register shadow roots,
   * observe mutations inside them, and query video elements cleanly.
   */
  class DOMObserver {
    /**
     * @danishansari-dev onMutation - Callback method triggered on node changes.
     */
    constructor(onMutation) {
      this.onMutation = onMutation;
      this.videoRegistry = new Set();
      this.observedShadowRoots = new WeakSet();
      this.activeShadowRoots = new Set();
      this.mutationObserver = null;
      this.lastDeepScanAt = 0;
      this.lastPointerVideo = null;
      this.lastPointerClientX = 0;
      this.lastPointerClientY = 0;
    }

    /**
     * Recursively crawler shadow boundaries.
     * 
     * @danishansari-dev root - Starting root node.
     */
    collectShadowRoots(root) {
      if (!root || !root.children) return;

      for (let i = 0; i < root.children.length; i++) {
        const el = root.children[i];
        if (EXCLUDED_SCAN_TAGS.has(el.tagName)) {
          continue;
        }

        if (el.shadowRoot) {
          const shadow = el.shadowRoot;
          if (!this.observedShadowRoots.has(shadow)) {
            this.observedShadowRoots.add(shadow);
            this.activeShadowRoots.add(shadow);
            this.mutationObserver?.observe(shadow, { childList: true, subtree: true });
            this.collectShadowRoots(shadow);
          }
        }
        this.collectShadowRoots(el);
      }
    }

    /**
     * Iterates roots and populates the video set bucket.
     * 
     * @danishansari-dev bucket - Target video registry set.
     */
    collectVideos(bucket) {
      document.querySelectorAll("video").forEach((video) => bucket.add(video));

      for (const shadow of this.activeShadowRoots) {
        if (!shadow.host || !shadow.host.isConnected) {
          this.activeShadowRoots.delete(shadow);
          continue;
        }
        shadow.querySelectorAll("video").forEach((video) => bucket.add(video));
      }
    }

    /**
     * Synchronizes video registries, checking active connections.
     * 
     * @danishansari-dev - None
     */
    syncVideoRegistry() {
      const next = new Set();
      const now = performance.now();
      const deepScan = (now - this.lastDeepScanAt) > 5000;

      if (deepScan) {
        this.lastDeepScanAt = now;
        this.collectShadowRoots(document.documentElement);
      }

      this.collectVideos(next);

      for (const video of this.videoRegistry) {
        if (video.isConnected) {
          next.add(video);
        }
      }

      this.videoRegistry.clear();
      let count = 0;
      for (const video of next) {
        if (count >= MAX_VIDEO_SCAN) {
          break;
        }
        if (video.isConnected) {
          this.videoRegistry.add(video);
          count += 1;
        }
      }
    }

    /**
     * Evaluates usability heuristics of a video element.
     * 
     * @danishansari-dev video - Target video element.
     * @returns {boolean} Playback eligibility status.
     */
    isVideoUsable(video) {
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
    }

    /**
     * Calculates the viewport visible area score of a video.
     * 
     * @danishansari-dev video - Target video element.
     * @returns {number} Score index value.
     */
    videoVisibleScore(video) {
      const rect = video.getBoundingClientRect();
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      const ix = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      const iy = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      return ix * iy;
    }

    /**
     * Picks the largest video element from selection candidates.
     * 
     * @danishansari-dev videos - Array list of videos.
     * @returns {HTMLVideoElement|null} Largest element.
     */
    pickLargestVideo(videos) {
      let best = null;
      let bestScore = -1;
      for (const video of videos) {
        const score = this.videoVisibleScore(video);
        if (score > bestScore) {
          bestScore = score;
          best = video;
        }
      }
      return best;
    }

    /**
     * Resolves fallback video references.
     * 
     * @danishansari-dev - None
     * @returns {HTMLVideoElement|null} Target fallback video element.
     */
    pickUniversalVideo() {
      this.syncVideoRegistry();

      const pip = document.pictureInPictureElement;
      if (pip instanceof HTMLVideoElement && this.isVideoUsable(pip)) {
        return pip;
      }

      const fs = document.fullscreenElement;
      if (fs instanceof HTMLVideoElement && this.isVideoUsable(fs)) {
        return fs;
      }
      if (fs?.querySelector) {
        const nested = fs.querySelector("video");
        if (nested && this.isVideoUsable(nested)) {
          return nested;
        }
      }

      if (this.lastPointerVideo && this.isVideoUsable(this.lastPointerVideo)) {
        return this.lastPointerVideo;
      }

      const active = document.activeElement;
      if (active instanceof HTMLVideoElement && this.isVideoUsable(active)) {
        return active;
      }

      const candidates = Array.from(this.videoRegistry).filter((v) => this.isVideoUsable(v));
      const playing = candidates.filter((v) => !v.paused && !v.ended && v.readyState > 1);

      if (playing.length) {
        return this.pickLargestVideo(playing);
      }
      return this.pickLargestVideo(candidates);
    }

    /**
     * Obtains the YouTube channel identifier from page selectors.
     * 
     * @danishansari-dev - None
     * @returns {string} Channel selector path or name.
     */
    getChannelKey() {
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
    }

    /**
     * Attaches observers to the document DOM.
     * 
     * @danishansari-dev - None
     */
    start() {
      this.mutationObserver = new MutationObserver(() => this.onMutation());
      this.mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      this.collectShadowRoots(document.documentElement);
    }

    /**
     * Clears bindings and observer connections.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      this.mutationObserver?.disconnect();
      this.videoRegistry.clear();
      this.activeShadowRoots.clear();
    }
  }

  // --- VIDEO CONTROLLER ---

  /**
   * Manages binding, speed enforcement, and callbacks on active video playback.
   * 
   * Why this exists:
   * Keeps track of programmatic adjustments, avoids looping triggers, handles rate changes
   * based on policies (sync vs override), and attaches playback status listeners.
   */
  class VideoController {
    /**
     * @danishansari-dev settings - SettingsManager instance reference.
     * @danishansari-dev observer - DOMObserver instance reference.
     * @danishansari-dev onRateChange - Callback method triggered on rate updates.
     * @danishansari-dev onVideoChange - Callback method triggered on video mounts.
     */
    constructor(settings, observer, onRateChange, onVideoChange) {
      this.settings = settings;
      this.observer = observer;
      this.onRateChange = onRateChange;
      this.onVideoChange = onVideoChange;
      this.activeVideo = null;
      this.isBoosting = false;
      this.boostRestoreRate = null;
      this.pendingProgrammaticRates = new Set();
      this.pendingProgrammaticTimer = null;
      this.lastCheckedVideo = null;

      // Event listener bindings
      this.boundRateChange = this.handleRateChange.bind(this);
      this.boundEnforcePreferred = this.enforcePreferredRate.bind(this);
    }

    /**
     * Resolves the main watch player on YouTube domains.
     * 
     * @danishansari-dev - None
     * @returns {Element|null} Player container element.
     */
    getPlayer() {
      if (!isYouTubeHost()) return null;

      if (location.pathname === "/watch" || location.pathname.startsWith("/shorts")) {
        const mainPlayer = document.getElementById("movie_player");
        if (mainPlayer) {
          const rect = mainPlayer.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return mainPlayer;
          }
        }
      }

      const hoveredPlayer = this.observer.lastPointerVideo?.closest?.(".html5-video-player");
      if (hoveredPlayer && this.observer.isVideoUsable(this.observer.lastPointerVideo)) {
        const rect = this.observer.lastPointerVideo.getBoundingClientRect();
        const hoverZone = {
          left: rect.left - FLOATING_HOVER_EXPAND_PX,
          top: rect.top - FLOATING_HOVER_EXPAND_PX,
          right: rect.right + FLOATING_HOVER_EXPAND_PX,
          bottom: rect.bottom + FLOATING_HOVER_EXPAND_PX
        };

        const inHover = this.lastCheckedVideo === this.observer.lastPointerVideo || (
          this.observer.lastPointerClientX >= hoverZone.left &&
          this.observer.lastPointerClientX <= hoverZone.right &&
          this.observer.lastPointerClientY >= hoverZone.top &&
          this.observer.lastPointerClientY <= hoverZone.bottom
        );

        if (rect.width > 0 && rect.height > 0 && inHover) {
          return hoveredPlayer;
        }
      }

      const players = Array.from(document.querySelectorAll(".html5-video-player"));
      return players.find((player) => {
        const video = player.querySelector("video.html5-main-video, video");
        const rect = player.getBoundingClientRect();
        return video && rect.width > 0 && rect.height > 0;
      }) || null;
    }

    /**
     * YouTube specific HTMLVideoElement query utility.
     * 
     * @danishansari-dev - None
     * @returns {HTMLVideoElement|null} Playback element.
     */
    getYouTubeVideo() {
      const player = this.getPlayer();
      return player?.querySelector("video.html5-main-video, video") || null;
    }

    /**
     * Resolves the primary active video element.
     * 
     * @danishansari-dev - None
     * @returns {HTMLVideoElement|null} Target playback video.
     */
    getVideo() {
      if (this.activeVideo && this.observer.isVideoUsable(this.activeVideo)) {
        return this.activeVideo;
      }
      if (isYouTubeHost()) {
        const yt = this.getYouTubeVideo();
        if (yt) return yt;
      }
      return this.observer.pickUniversalVideo();
    }

    /**
     * Resolves playback state metadata properties.
     * 
     * @danishansari-dev - None
     * @returns {boolean} Video connection status.
     */
    hasActiveVideoPlayer() {
      const video = this.getVideo();
      return Boolean(video && this.observer.isVideoUsable(video));
    }

    /**
     * Registers programmatic speed adjustments to avoid circular event changes.
     * 
     * @danishansari-dev rate - Playback rate.
     */
    markProgrammaticRate(rate) {
      const key = normalizePlaybackRate(rate).toFixed(2);
      this.pendingProgrammaticRates.add(key);
      window.clearTimeout(this.pendingProgrammaticTimer);
      this.pendingProgrammaticTimer = window.setTimeout(() => {
        this.pendingProgrammaticRates.clear();
      }, 500);
    }

    /**
     * Core wrapper setting video element speed rates.
     * 
     * @danishansari-dev video - HTMLVideoElement source.
     * @danishansari-dev rate - Playback rate.
     * @returns {boolean} Success status.
     */
    setVideoRate(video, rate) {
      this.markProgrammaticRate(rate);
      try {
        video.playbackRate = rate;
        return true;
      } catch {
        const key = normalizePlaybackRate(rate).toFixed(2);
        this.pendingProgrammaticRates.delete(key);
        return false;
      }
    }

    /**
     * Formats rate mapping string.
     * 
     * @danishansari-dev rate - Numerical playback rate.
     * @returns {string} Precision rate key.
     */
    getRateKey(rate) {
      return normalizePlaybackRate(rate).toFixed(2);
    }

    /**
     * Listens to video playback speed change events.
     * 
     * Why this exists:
     * Dispatches speed adjustment syncing to storage or enforces override speed rules
     * depending on the native interaction configuration.
     * 
     * @danishansari-dev - None
     */
    handleRateChange() {
      const video = this.getVideo();
      if (!video) return;

      const changedRate = normalizePlaybackRate(video.playbackRate);
      const changedRateKey = this.getRateKey(changedRate);

      if (this.pendingProgrammaticRates.has(changedRateKey)) {
        this.onRateChange(changedRate);
        return;
      }

      const mode = this.settings.getEffectiveNativeMode();
      if (mode === "sync") {
        this.settings.rate = changedRate;
        this.onRateChange(changedRate);
        this.settings.savePreferredRate(changedRate, this.observer.getChannelKey());
        return;
      }

      // Override mode: force settings preference rates back on external adjustments
      const changed = Math.abs(this.settings.rate - changedRate) > EPSILON;
      if (changed) {
        this.setVideoRate(video, this.settings.rate);
        this.onRateChange(this.settings.rate);
      }
    }

    /**
     * Enforces preferred playback speed configuration.
     * 
     * @danishansari-dev - None
     */
    enforcePreferredRate() {
      if (!this.settings.isExtensionControllingPage() || !this.settings.autoApplyPreferredSpeed) {
        return;
      }
      if (this.settings.getEffectiveNativeMode() === "sync") {
        return;
      }
      const targetRate = this.isBoosting ? BOOST_RATE : this.settings.getPreferredRateForVideo(this.observer.getChannelKey());
      this.applyRate(targetRate, { persist: false });
    }

    /**
     * Standardizes rate application, toast dispatches, and widget state updates.
     * 
     * @danishansari-dev rate - Speed rate parameter.
     * @danishansari-dev options - Display option configurations.
     * @returns {boolean} Rate modification status.
     */
    applyRate(rate, options = {}) {
      if (!this.settings.isExtensionControllingPage()) {
        return false;
      }

      const {
        persist = true,
        notify = false,
        notifyAlways = false,
        label = "Speed",
        forceToast = false
      } = options;

      const nextRate = normalizePlaybackRate(rate);
      const video = this.getVideo();
      const currentRate = normalizePlaybackRate(video?.playbackRate || this.settings.rate);
      const changed = Math.abs(currentRate - nextRate) > EPSILON;

      if (!video && !persist) {
        return false;
      }

      if (persist) {
        this.settings.rate = nextRate;
      }

      if (video && changed && !this.setVideoRate(video, nextRate)) {
        return false;
      }

      this.onRateChange(nextRate);

      if (persist) {
        this.settings.savePreferredRate(nextRate, this.observer.getChannelKey());
      }

      if (notify && (changed || notifyAlways)) {
        globalThis.YSC_TOAST?.showSpeedToast(nextRate, { label, force: forceToast });
      }

      return changed;
    }

    /**
     * Resolves current speed.
     * 
     * @danishansari-dev - None
     * @returns {number} Playback speed rate.
     */
    getCurrentRate() {
      return normalizePlaybackRate(this.getVideo()?.playbackRate || this.settings.rate);
    }

    /**
     * Increases or decreases speed rates.
     * 
     * @danishansari-dev direction - Integer direction offset multiplier.
     * @danishansari-dev options - Toast toggle options.
     * @returns {boolean} Speed adjustment status.
     */
    moveRate(direction, options = {}) {
      const currentRate = this.getCurrentRate();
      const nextRate = normalizePlaybackRate(currentRate + (direction * SPEED_STEP));
      return this.applyRate(nextRate, options);
    }

    /**
     * Unbinds event listeners from the target video.
     * 
     * @danishansari-dev - None
     */
    detachVideoListeners() {
      if (!this.activeVideo) return;
      this.activeVideo.removeEventListener("ratechange", this.boundRateChange);
      this.activeVideo.removeEventListener("loadedmetadata", this.boundEnforcePreferred);
      this.activeVideo.removeEventListener("canplay", this.boundEnforcePreferred);
      this.activeVideo.removeEventListener("play", this.boundEnforcePreferred);
      this.activeVideo.removeEventListener("playing", this.boundEnforcePreferred);
      this.activeVideo = null;
    }

    /**
     * Resolves and binds listeners on a newly selected video.
     * 
     * @danishansari-dev - None
     */
    watchVideo() {
      const video = this.getVideo();
      if (!video || video === this.activeVideo) {
        return;
      }

      this.detachVideoListeners();
      this.activeVideo = video;
      this.lastCheckedVideo = video;

      video.addEventListener("ratechange", this.boundRateChange);
      video.addEventListener("loadedmetadata", this.boundEnforcePreferred);
      video.addEventListener("canplay", this.boundEnforcePreferred);
      video.addEventListener("play", this.boundEnforcePreferred);
      video.addEventListener("playing", this.boundEnforcePreferred);

      this.enforcePreferredRate();
      this.onVideoChange(video);
    }

    /**
     * Lifecycle listener cleanup.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      window.clearTimeout(this.pendingProgrammaticTimer);
      this.detachVideoListeners();
    }
  }

  // --- WIDGET UI MANAGEMENT ---

  /**
   * Manages drawing, visibility, placing, and layout options for the speed widget.
   * 
   * Why this exists:
   * Handles placement inside YouTube watch control blocks or floating position calculations
   * on other video players using collision avoidances and corner checks.
   */
  class WidgetUI {
    /**
     * @danishansari-dev settings - SettingsManager instance reference.
     * @danishansari-dev controller - VideoController instance reference.
     * @danishansari-dev observer - DOMObserver instance reference.
     */
    constructor(settings, controller, observer) {
      this.settings = settings;
      this.controller = controller;
      this.observer = observer;
      this.widget = null;
      this.widgetPlacement = "floating";
      this.floatingHideTimer = null;
      this.floatingHoverActive = false;
      this.lastFloatingLayoutAt = 0;
      this.cachedObstacleRects = [];
      this.cachedObstacleKey = "";
      this.layoutScheduled = false;

      // Interaction helpers
      this.suppressedClickButton = null;
      this.suppressedClickTimer = null;
      this.holdDelayTimer = null;
      this.holdIntervalTimer = null;
      this.holdDirection = 0;
      this.holdButton = null;
      this.holdActivated = false;
    }

    /**
     * Evaluates if widget controls are visible on screens.
     * 
     * @danishansari-dev element - Target DOM node.
     * @returns {boolean} Display visibility.
     */
    isVisibleControl(element) {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    }

    /**
     * Evaluates if the current player is the main watch video player.
     * 
     * @danishansari-dev player - Host element player node.
     * @returns {boolean} Primary status.
     */
    isYouTubeWatchPlayer(player) {
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
    }

    /**
     * YouTube compact player block resolver.
     * 
     * @danishansari-dev video - Target HTMLVideoElement.
     * @returns {Element|null} Compact player parent.
     */
    getYouTubeCompactRoot(video) {
      if (!video || !isYouTubeHost()) return null;
      return video.closest(YOUTUBE_COMPACT_CONTAINER_SELECTOR) || video.closest(".html5-video-player") || null;
    }

    /**
     * Resolves if the current video is a compact thumbnail preview (like hover-previews).
     * 
     * @danishansari-dev video - HTMLVideoElement player.
     * @danishansari-dev rect - Bounding box dimensions.
     * @danishansari-dev fullscreenUi - Fullscreen display mode status.
     * @returns {boolean} True if video is a thumbnail preview.
     */
    isYouTubeCompactPreview(video, rect, fullscreenUi = false) {
      if (!video || !isYouTubeHost() || fullscreenUi) {
        return false;
      }
      const player = video.closest(".html5-video-player");
      if (player && this.isYouTubeWatchPlayer(player)) {
        return false;
      }
      if (this.getYouTubeCompactRoot(video)?.matches?.(YOUTUBE_COMPACT_CONTAINER_SELECTOR)) {
        return true;
      }
      if (!rect?.width || !rect?.height) {
        return false;
      }
      return rect.width < 640 || rect.height < 360;
    }

    /**
     * Resolves if fullscreen display configuration is enabled.
     * 
     * @danishansari-dev - None
     * @returns {boolean} Fullscreen status.
     */
    isFullscreenMode() {
      return Boolean(document.fullscreenElement || this.controller.getPlayer()?.classList.contains("ytp-fullscreen"));
    }

    /**
     * Updates styling classes and toggles widget visibility.
     * 
     * @danishansari-dev - None
     */
    updateWidgetVisibility() {
      const hideForFullscreen = this.settings.fullscreenOnlyControls && !this.isFullscreenMode();
      const shouldHide = !this.settings.isExtensionControllingPage() || this.settings.widgetHidden || hideForFullscreen;

      this.widget?.classList.toggle("ysc-speed-widget-hidden", shouldHide);
      this.widget?.classList.toggle("ysc-speed-widget-compact", this.settings.compactMode);

      if (shouldHide && this.widgetPlacement === "floating") {
        this.resetFloatingHoverState();
      } else {
        this.applyFloatingAmbientClass();
      }
    }

    /**
     * Redraws speeds rates content within controls.
     * 
     * @danishansari-dev rate - Playback rate.
     */
    updateWidget(rate = this.controller.getCurrentRate()) {
      if (!this.widget) return;

      const displayRate = formatRate(rate);
      const rateButton = this.widget.querySelector(".ysc-speed-rate");
      if (rateButton) {
        rateButton.textContent = displayRate;
        rateButton.setAttribute("aria-label", `Current speed ${displayRate}. Click to increase.`);
        rateButton.title = `Playback speed ${displayRate}`;
      }

      const decBtn = this.widget.querySelector(".ysc-speed-decrease");
      if (decBtn) {
        decBtn.disabled = rate <= SPEEDS[0] + EPSILON;
      }

      const incBtn = this.widget.querySelector(".ysc-speed-increase");
      if (incBtn) {
        incBtn.disabled = rate >= SPEEDS[SPEEDS.length - 1] - EPSILON;
      }

      this.updateWidgetVisibility();
      this.applyFloatingPresentation();
    }

    /**
     * Clears click suppression timer parameters.
     * 
     * @danishansari-dev - None
     */
    clearSuppressedClick() {
      this.suppressedClickButton = null;
      window.clearTimeout(this.suppressedClickTimer);
      this.suppressedClickTimer = null;
    }

    /**
     * Suppresses mouse click event defaults following long-press speed increments.
     * 
     * @danishansari-dev button - Target button.
     */
    suppressNextClickFor(button) {
      if (!button) return;
      this.suppressedClickButton = button;
      window.clearTimeout(this.suppressedClickTimer);
      this.suppressedClickTimer = window.setTimeout(() => this.clearSuppressedClick(), SUPPRESS_CLICK_AFTER_HOLD_MS);
    }

    /**
     * Clears hold loop intervals.
     * 
     * @danishansari-dev - None
     */
    clearHoldTimers() {
      window.clearTimeout(this.holdDelayTimer);
      window.clearInterval(this.holdIntervalTimer);
      this.holdDelayTimer = null;
      this.holdIntervalTimer = null;
    }

    /**
     * Stops long-press trigger loops.
     * 
     * @danishansari-dev options - Click suppression settings.
     */
    stopSpeedHold(options = {}) {
      const { suppressClick = true } = options;
      const activeButton = this.holdButton;
      const shouldSuppressClick = suppressClick && this.holdActivated;

      this.clearHoldTimers();
      activeButton?.classList.remove("ysc-speed-holding");

      this.holdDirection = 0;
      this.holdButton = null;
      this.holdActivated = false;

      if (shouldSuppressClick && activeButton) {
        this.suppressNextClickFor(activeButton);
      }
    }

    /**
     * Executes hold repeat steps.
     * 
     * @danishansari-dev - None
     */
    runHoldStep() {
      if (!this.holdDirection) return;
      const changed = this.controller.moveRate(this.holdDirection, { notify: true });
      if (!changed) {
        this.stopSpeedHold({ suppressClick: true });
      }
    }

    /**
     * Starts key/button hold loops.
     * 
     * @danishansari-dev event - PointerEvent.
     * @danishansari-dev direction - Integer step value.
     * @danishansari-dev button - Target button element.
     */
    startSpeedHold(event, direction, button) {
      if (button.disabled || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }
      event.stopPropagation();
      this.stopSpeedHold({ suppressClick: false });

      this.holdDirection = direction;
      this.holdButton = button;
      this.holdActivated = false;
      button.classList.add("ysc-speed-holding");

      this.holdDelayTimer = window.setTimeout(() => {
        this.holdActivated = true;
        this.runHoldStep();
        if (this.holdDirection) {
          this.holdIntervalTimer = window.setInterval(() => this.runHoldStep(), HOLD_REPEAT_MS);
        }
      }, HOLD_START_DELAY_MS);
    }

    /**
     * Draws SVG icon shapes.
     * 
     * @danishansari-dev type - "plus" or "minus".
     * @returns {SVGElement} Formed icon.
     */
    createIcon(type) {
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
    }

    /**
     * Widget button creator utility.
     * 
     * @danishansari-dev params - Options object containing classes, icons, labels, and handlers.
     * @returns {HTMLButtonElement} Setup button.
     */
    createButton(params) {
      const { className, text, icon, label, title, holdDirection: direction, onClick } = params;
      const button = document.createElement("button");

      button.type = "button";
      button.className = `ysc-speed-button ${className}`;
      button.setAttribute("aria-label", label);
      button.title = title;

      if (icon) {
        button.append(this.createIcon(icon));
      } else {
        button.textContent = text;
      }

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (this.suppressedClickButton === button) {
          this.clearSuppressedClick();
          return;
        }
        onClick();
      });

      if (direction) {
        button.addEventListener("pointerdown", (event) => this.startSpeedHold(event, direction, button));
        button.addEventListener("pointerup", () => this.stopSpeedHold());
        button.addEventListener("pointercancel", () => this.stopSpeedHold());
        button.addEventListener("pointerleave", () => this.stopSpeedHold());
        button.addEventListener("touchend", () => this.stopSpeedHold());
      }

      return button;
    }

    /**
     * Speed controls component creator.
     * 
     * @danishansari-dev - None
     * @returns {HTMLDivElement} Setup widget.
     */
    createWidget() {
      const container = document.createElement("div");
      container.className = "ysc-speed-widget";
      container.setAttribute("role", "group");
      container.setAttribute("aria-label", "Playback speed controls");

      const decrease = this.createButton({
        className: "ysc-speed-decrease",
        icon: "minus",
        label: "Decrease playback speed",
        title: "Decrease playback speed",
        holdDirection: -1,
        onClick: () => this.controller.moveRate(-1, { notify: true })
      });

      const rate = this.createButton({
        className: "ysc-speed-rate",
        text: formatRate(this.settings.rate),
        label: `Current speed ${formatRate(this.settings.rate)}. Click to increase.`,
        title: `Playback speed ${formatRate(this.settings.rate)}`,
        onClick: () => this.controller.moveRate(1, { notify: true })
      });

      const increase = this.createButton({
        className: "ysc-speed-increase",
        icon: "plus",
        label: "Increase playback speed",
        title: "Increase playback speed",
        holdDirection: 1,
        onClick: () => this.controller.moveRate(1, { notify: true })
      });

      container.append(decrease, rate, increase);

      // Block default player controls from capturing widget gestures
      for (const eventName of ["click", "dblclick", "mousedown", "pointerdown", "touchstart"]) {
        container.addEventListener(eventName, (event) => event.stopPropagation());
      }

      container.addEventListener("pointerenter", () => {
        if (!container.classList.contains("ysc-speed-widget--floating")) return;
        this.clearFloatingHideTimer();
        if (!this.floatingHoverActive) {
          this.floatingHoverActive = true;
          this.applyFloatingAmbientClass();
        }
      });

      container.addEventListener("pointerleave", () => {
        if (!container.classList.contains("ysc-speed-widget--floating")) return;
        this.scheduleFloatingHide();
      });

      return container;
    }

    /**
     * Resolves the primary player block container bounds.
     * 
     * @danishansari-dev video - Target HTMLVideoElement.
     * @returns {Element|null} Layout host wrapper.
     */
    getPlayerRootForLayout(video) {
      if (!video) return null;
      const hints = [
        ".html5-video-player", "[data-player]", "[data-testid*='player' i]",
        ".plyr", ".plyr__video-wrapper", ".video-js",
        "[class*='video-player' i]", "[class*='VideoPlayer' i]", "[class*='watch-video' i]"
      ].join(",");

      const direct = video.closest(hints);
      if (direct) return direct;

      let el = video.parentElement;
      const vrect = video.getBoundingClientRect();
      for (let i = 0; i < 9 && el; i++) {
        const b = el.getBoundingClientRect?.();
        if (b && vrect.width > 0 && b.width >= vrect.width * 0.82 && b.height >= vrect.height * 0.7) {
          return el;
        }
        el = el.parentElement;
      }
      return video.parentElement || video;
    }

    /**
     * Resolves layout obstacle elements in proximity.
     * 
     * @danishansari-dev video - Active video.
     * @danishansari-dev vr - Video bounding box.
     * @danishansari-dev params - Options parameters.
     * @returns {DOMRect[]} List of obstacle coordinates.
     */
    gatherObstacleRects(video, vr, params = {}) {
      if (!video || !vr?.width) return [];
      const { compactPreview = false } = params;

      const root = this.getPlayerRootForLayout(video);
      const roots = new Set([root]);
      const out = [];

      const push = (r) => {
        if (!r || r.width < 14 || r.height < 3) return;
        if (!(r.right <= vr.left || r.left >= vr.right || r.bottom <= vr.top || r.top >= vr.bottom)) {
          out.push(r);
        }
      };

      const baseSelectors = [
        ".ytp-chrome-top", ".ytp-gradient-top", ".ytp-chrome-bottom", ".ytp-gradient-bottom",
        ".ytp-right-controls", ".ytp-left-controls", ".ytp-caption-window-container",
        ".ytp-caption-window", ".vjs-control-bar", ".vjs-progress-control",
        ".vjs-text-track-display", "[class*='control-bar' i]", "[class*='ControlBar' i]",
        "[class*='progress' i]", "[class*='Progress' i]", "[class*='seekbar' i]",
        "[class*='scrub' i]", "[class*='Seek' i]", "[class*='timeline' i]",
        "[class*='caption' i]", "[class*='subtitle' i]", "[class*='timedtext' i]",
        "[class*='BottomControls' i]", ".shaka-bottom-controls", ".shaka-text-container",
        "[data-uia*='control' i]"
      ];

      if (compactPreview && isYouTubeHost()) {
        roots.add(this.getYouTubeCompactRoot(video));
        baseSelectors.push(YOUTUBE_COMPACT_OBSTACLE_SELECTOR);
      }

      const sel = baseSelectors.join(",");
      roots.forEach((scope) => {
        if (!scope?.querySelectorAll) return;
        scope.querySelectorAll(sel).forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          if (this.widget && (this.widget === el || this.widget.contains(el) || el.contains(this.widget))) {
            return;
          }
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return;
          const opacity = parseFloat(style.opacity);
          if (Number.isFinite(opacity) && opacity < 0.03) return;
          push(el.getBoundingClientRect());
        });
      });

      push({
        left: vr.left,
        top: compactPreview ? vr.bottom - Math.min(48, Math.max(24, vr.height * 0.24)) : vr.top + vr.height * 0.56,
        right: vr.right,
        bottom: vr.bottom
      });

      return out;
    }

    /**
     * Samples DOM overlays to determine if UI controls are open.
     * 
     * @danishansari-dev left - Left offset.
     * @danishansari-dev top - Top offset.
     * @danishansari-dev w - Width.
     * @danishansari-dev h - Height.
     * @danishansari-dev video - Video component source.
     * @returns {number} Score penalty value.
     */
    sampleCornerOccupancyPenalty(left, top, w, h, video) {
      const pts = [
        [left + w * 0.22, top + h * 0.38],
        [left + w * 0.5, top + h * 0.45],
        [left + w * 0.78, top + h * 0.38]
      ];
      let penalty = 0;

      for (const [x, y] of pts) {
        const stack = document.elementsFromPoint(x, y);
        for (let i = 0; i < Math.min(14, stack.length); i++) {
          const el = stack[i];
          if (!(el instanceof Element)) continue;
          if (this.widget && this.widget.contains(el)) return penalty;
          if (video && (el === video || video.contains(el))) break;

          const tag = el.tagName;
          if (tag === "HTML" || tag === "BODY") continue;

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
    }

    /**
     * Resolves the best corner coordinates for the floating widget.
     * 
     * @danishansari-dev video - Active video element.
     * @danishansari-dev vr - Video bounding rect box.
     * @danishansari-dev ww - Widget layout width.
     * @danishansari-dev wh - Widget layout height.
     * @danishansari-dev fullscreenUi - Fullscreen toggle status.
     * @danishansari-dev verticalLayout - Layout orientation flag.
     * @danishansari-dev obstacles - Nearby obstacle elements.
     * @returns {object} Calculated coordinates dictionary.
     */
    pickBestFloatingPosition(video, vr, ww, wh, fullscreenUi, verticalLayout, obstacles) {
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
        const inflated = {
          left: slot.left - pad,
          top: slot.top - pad,
          right: slot.right + pad,
          bottom: slot.bottom + pad
        };
        let score = 0;

        for (const ob of list) {
          const hitX = Math.max(0, Math.min(inflated.right, ob.right) - Math.max(inflated.left, ob.left));
          const hitY = Math.max(0, Math.min(inflated.bottom, ob.bottom) - Math.max(inflated.top, ob.top));
          const hit = hitX * hitY;

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

        score += this.sampleCornerOccupancyPenalty(slot.left, slot.top, ww, wh, video) * 10;
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
    }

    /**
     * Resolves brightness metrics to calculate widget dark/light styling states.
     * 
     * @danishansari-dev - None
     * @returns {string} "dark" or "light".
     */
    resolveFloatingTheme() {
      if (this.settings.themeMode === "dark") return "dark";
      if (this.settings.themeMode === "light") return "light";

      const video = this.controller.getVideo();
      const sample = video?.parentElement || document.body;
      const bg = window.getComputedStyle(sample).backgroundColor;

      let lum = 0.12;
      if (bg && bg !== "transparent") {
        const parts = bg.match(/rgba?\(([^)]+)\)/i);
        if (parts) {
          const nums = parts[1].split(",").map((p) => Number(p.trim()));
          if (nums.length >= 3) {
            const [r, g, b] = nums;
            const a = nums.length > 3 ? nums[3] : 1;
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
              lum = (0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255)) * (Number.isFinite(a) ? a : 1);
            }
          }
        }
      }

      if (lum > 0.55) return "light";
      if (lum < 0.35) return "dark";
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }

    /**
     * Executes widget styling adjustments and coordinates coordinate translations.
     * 
     * Why this exists:
     * To prevent layout thrashing on fast updates, we schedule position recalculations
     * through requestAnimationFrame.
     * 
     * @danishansari-dev - None
     */
    applyFloatingPresentation() {
      if (!this.widget || this.widgetPlacement !== "floating") return;
      if (this.layoutScheduled) return;

      this.layoutScheduled = true;
      requestAnimationFrame(() => {
        this.layoutScheduled = false;
        this.performLayoutUpdate();
      });
    }

    /**
     * Synchronous DOM write phase of the widget layout update.
     * 
     * @danishansari-dev - None
     */
    performLayoutUpdate() {
      if (!this.widget || this.widgetPlacement !== "floating") return;

      const theme = this.resolveFloatingTheme();
      this.widget.dataset.yscTheme = theme;
      globalThis.YSC_TOAST?.toast?.setAttribute("data-ysc-theme", theme);

      const fullscreenUi = this.isFullscreenMode();
      this.widget.classList.toggle("ysc-speed-widget--fs", fullscreenUi);

      const video = this.controller.getVideo();
      const rect = video?.getBoundingClientRect();

      this.widget.style.right = "auto";
      this.widget.style.bottom = "auto";

      if (!rect || rect.width < 80 || rect.height < 80) {
        this.widget.style.left = "";
        this.widget.style.top = "";
        this.widget.classList.remove("ysc-speed-widget--vertical");
        this.widget.classList.remove("ysc-speed-widget--yt-preview");
        this.applyFloatingAmbientClass();
        return;
      }

      const youtubePreviewLayout = this.isYouTubeCompactPreview(video, rect, fullscreenUi);
      if (youtubePreviewLayout) {
        this.widget.style.display = "none";
        this.resetFloatingHoverState();
        return;
      }
      this.widget.style.display = "";

      const verticalLayout = rect.height / rect.width >= 1.18;
      this.widget.classList.remove("ysc-speed-widget--yt-preview");
      this.widget.classList.toggle("ysc-speed-widget--vertical", verticalLayout);

      const now = performance.now();
      const runHeavy = now - this.lastFloatingLayoutAt >= FLOATING_LAYOUT_MIN_MS;
      const srcTag = String(video.currentSrc || video.src || "").slice(-48);
      const obsKey = `std_${srcTag}_${Math.round(rect.left)}_${Math.round(rect.top)}_${Math.round(rect.width)}_${Math.round(rect.height)}`;

      if (runHeavy || this.cachedObstacleKey !== obsKey) {
        this.cachedObstacleRects = this.gatherObstacleRects(video, rect, { compactPreview: false });
        this.cachedObstacleKey = obsKey;
      }
      if (runHeavy) {
        this.lastFloatingLayoutAt = now;
      }

      const ww = this.widget.offsetWidth || FLOATING_WIDGET_FALLBACK_W;
      const wh = this.widget.offsetHeight || FLOATING_WIDGET_FALLBACK_H;
      const pos = this.pickBestFloatingPosition(video, rect, ww, wh, fullscreenUi, verticalLayout, this.cachedObstacleRects);

      this.widget.style.left = `${Math.round(pos.left)}px`;
      this.widget.style.top = `${Math.round(pos.top)}px`;
      this.applyFloatingAmbientClass();
    }

    /**
     * Clears floating hide timer.
     * 
     * @danishansari-dev - None
     */
    clearFloatingHideTimer() {
      window.clearTimeout(this.floatingHideTimer);
      this.floatingHideTimer = null;
    }

    /**
     * Toggles ambient opacity style properties.
     * 
     * @danishansari-dev - None
     */
    applyFloatingAmbientClass() {
      if (!this.widget || this.widgetPlacement !== "floating") return;
      const hideForFullscreen = this.settings.fullscreenOnlyControls && !this.isFullscreenMode();
      const blocked = !this.settings.isExtensionControllingPage() || this.settings.widgetHidden || hideForFullscreen;

      if (blocked) {
        this.widget.classList.remove("ysc-speed-widget--ambient");
        return;
      }
      this.widget.classList.toggle("ysc-speed-widget--ambient", this.floatingHoverActive);
    }

    /**
     * Schedules the automatic dimming timer for the floating controls.
     * 
     * @danishansari-dev - None
     */
    scheduleFloatingHide() {
      this.clearFloatingHideTimer();
      this.floatingHideTimer = window.setTimeout(() => {
        this.floatingHideTimer = null;
        this.floatingHoverActive = false;
        this.applyFloatingAmbientClass();
      }, FLOATING_HIDE_DELAY_MS);
    }

    /**
     * Resets hover properties immediately.
     * 
     * @danishansari-dev - None
     */
    resetFloatingHoverState() {
      this.clearFloatingHideTimer();
      this.floatingHoverActive = false;
      if (this.widget) {
        this.widget.classList.remove("ysc-speed-widget--ambient");
      }
    }

    /**
     * Checks if current mouse position falls inside player bounds to reveal controls.
     * 
     * @danishansari-dev clientX - Cursor X coordinate.
     * @danishansari-dev clientY - Cursor Y coordinate.
     */
    updateFloatingHoverFromClientPoint(clientX, clientY) {
      if (this.widgetPlacement !== "floating") return;

      const hideForFullscreen = this.settings.fullscreenOnlyControls && !this.isFullscreenMode();
      const blocked = !this.settings.isExtensionControllingPage() || this.settings.widgetHidden || hideForFullscreen;

      if (blocked) {
        this.resetFloatingHoverState();
        return;
      }

      const reveal = this.shouldRevealFloatingWidget(clientX, clientY);
      if (reveal) {
        this.clearFloatingHideTimer();
        if (!this.floatingHoverActive) {
          this.floatingHoverActive = true;
          this.applyFloatingAmbientClass();
        }
      } else if (this.floatingHoverActive && !this.floatingHideTimer) {
        this.scheduleFloatingHide();
      }
    }

    /**
     * Evaluates if hover state overrides dimming rules.
     * 
     * @danishansari-dev clientX - Pointer X position.
     * @danishansari-dev clientY - Pointer Y position.
     * @returns {boolean} True if widget should be revealed.
     */
    shouldRevealFloatingWidget(clientX, clientY) {
      if (!this.widget || this.widgetPlacement !== "floating") return false;
      const video = this.controller.getVideo();
      if (!video || !this.observer.isVideoUsable(video)) return false;

      const vr = video.getBoundingClientRect();
      const bottomPad = Math.min(FLOATING_BOTTOM_CHROME_PAD, Math.max(64, vr.height * 0.26));
      const hoverZone = {
        left: vr.left - FLOATING_HOVER_EXPAND_PX,
        top: vr.top - FLOATING_HOVER_EXPAND_PX,
        right: vr.right + FLOATING_HOVER_EXPAND_PX,
        bottom: vr.bottom + bottomPad
      };

      const wr = this.widget.getBoundingClientRect();
      const inWr = wr.width > 0 && wr.height > 0 && (
        clientX >= wr.left && clientX <= wr.right && clientY >= wr.top && clientY <= wr.bottom
      );
      if (inWr) return true;

      const inVideoRect = clientX >= vr.left && clientX <= vr.right && clientY >= vr.top && clientY <= vr.bottom;
      const inHoverZone = clientX >= hoverZone.left && clientX <= hoverZone.right && clientY >= hoverZone.top && clientY <= hoverZone.bottom;
      const chromeOpen = this.isBottomOverlayStackOpen(video, vr);

      return inVideoRect || (chromeOpen && inHoverZone);
    }

    /**
     * Checks if video player control bars are currently open on screen.
     * 
     * @danishansari-dev video - Target playback element.
     * @danishansari-dev videoRect - Bounding dimensions.
     * @returns {boolean} Overlap status.
     */
    isBottomOverlayStackOpen(video, videoRect) {
      if (!video || !videoRect?.width) return true;

      const sampleY = videoRect.bottom - Math.max(8, Math.min(40, videoRect.height * 0.09));
      const xs = [
        videoRect.left + videoRect.width * 0.18,
        videoRect.left + videoRect.width * 0.5,
        videoRect.right - videoRect.width * 0.18
      ];

      for (const x of xs) {
        const stack = document.elementsFromPoint(x, sampleY);
        for (const el of stack.slice(0, 16)) {
          if (!(el instanceof Element)) continue;
          if (this.widget && this.widget.contains(el)) return true;
          if (el === video || video.contains(el)) continue;

          const style = window.getComputedStyle(el);
          if (style.pointerEvents === "none") continue;
          if (style.visibility === "hidden" || style.display === "none") continue;

          const opacity = parseFloat(style.opacity);
          if (Number.isFinite(opacity) && opacity < 0.04) continue;
          return true;
        }
      }
      return false;
    }

    /**
     * Evaluates YouTube control placements.
     * 
     * @danishansari-dev - None
     * @returns {boolean} Placement success status.
     */
    placeYouTubeWidget() {
      const player = this.controller.getPlayer();
      const rightControls = player?.querySelector(".ytp-right-controls");
      if (!rightControls || !this.isYouTubeWatchPlayer(player)) {
        return false;
      }

      if (!this.widget) {
        this.widget = this.createWidget();
      }

      this.widget.classList.remove("ysc-speed-widget--floating");
      this.widget.classList.remove("ysc-speed-widget--yt-preview");
      this.widget.classList.remove("ysc-speed-widget--vertical");
      this.widget.style.display = "";
      this.widgetPlacement = "youtube";
      this.resetFloatingHoverState();
      this.cachedObstacleKey = "";
      this.lastFloatingLayoutAt = 0;

      const captionsButton = rightControls.querySelector(".ytp-subtitles-button");
      const settingsButton = rightControls.querySelector(".ytp-settings-button");

      if (captionsButton && this.isVisibleControl(captionsButton)) {
        if (captionsButton.nextElementSibling !== this.widget) {
          captionsButton.insertAdjacentElement("afterend", this.widget);
        }
      } else if (settingsButton) {
        if (settingsButton.previousElementSibling !== this.widget) {
          const parent = settingsButton.parentNode;
          if (parent) {
            parent.insertBefore(this.widget, settingsButton);
          } else {
            rightControls.append(this.widget);
          }
        }
      } else if (this.widget.parentElement !== rightControls || this.widget.nextElementSibling) {
        rightControls.append(this.widget);
      }
      return true;
    }

    /**
     * Places the floating controller widget on generic pages.
     * 
     * @danishansari-dev - None
     */
    placeFloatingWidget() {
      if (!this.widget) {
        this.widget = this.createWidget();
      }

      this.widget.classList.add("ysc-speed-widget--floating");
      this.widgetPlacement = "floating";
      this.cachedObstacleKey = "";
      this.lastFloatingLayoutAt = 0;

      if (this.widget.parentElement !== document.body) {
        document.body.append(this.widget);
      }
      this.applyFloatingPresentation();
    }

    /**
     * Resolves positioning pathways.
     * 
     * @danishansari-dev - None
     */
    placeWidget() {
      if (isYouTubeHost() && this.placeYouTubeWidget()) {
        this.updateWidget(this.controller.getCurrentRate());
        return;
      }
      this.placeFloatingWidget();
      this.updateWidget(this.controller.getCurrentRate());
    }

    /**
     * Clear active UI elements and event structures.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      this.clearHoldTimers();
      this.clearSuppressedClick();
      this.clearFloatingHideTimer();
      if (this.widget) {
        this.widget.remove();
        this.widget = null;
      }
    }
  }

  // --- TOAST UI MANAGEMENT ---

  /**
   * Draws and animate speed adjustment confirmation notices.
   * 
   * Why this exists:
   * Decoupled singleton that manages rendering performance notifications (speed overlay toasts).
   */
  class ToastUI {
    constructor() {
      this.toast = null;
      this.toastLabelText = null;
      this.toastValueText = null;
      this.toastTimer = null;
    }

    /**
     * Evaluates and builds toast DOM containers.
     * 
     * Why this exists:
     * Singleton factory creating the UI elements for speed overlays.
     * 
     * @danishansari-dev - None
     */
    ensureToast() {
      if (this.toast) return;

      this.toast = document.createElement("div");
      this.toast.className = "ysc-speed-toast";
      this.toast.setAttribute("role", "status");
      this.toast.setAttribute("aria-live", "polite");

      this.toastLabelText = document.createElement("span");
      this.toastLabelText.className = "ysc-speed-toast-label";

      this.toastValueText = document.createElement("span");
      this.toastValueText.className = "ysc-speed-toast-rate";

      // Why we build custom slider track elements:
      // To provide a glassmorphic speed slider indicator representing progress
      // from minimum speed to maximum speed, matching the premium visual design.
      this.toastSlider = document.createElement("div");
      this.toastSlider.className = "ysc-speed-toast-slider";
      this.toastSliderTrack = document.createElement("div");
      this.toastSliderTrack.className = "ysc-speed-toast-slider-track";
      this.toastSliderFill = document.createElement("div");
      this.toastSliderFill.className = "ysc-speed-toast-slider-fill";
      this.toastSliderThumb = document.createElement("div");
      this.toastSliderThumb.className = "ysc-speed-toast-slider-thumb";

      this.toastSliderFill.append(this.toastSliderThumb);
      this.toastSliderTrack.append(this.toastSliderFill);
      this.toastSlider.append(this.toastSliderTrack);

      this.toast.append(this.toastLabelText, this.toastValueText, this.toastSlider);
    }

    /**
     * Evaluates target injection parents for the overlay toast.
     * 
     * @danishansari-dev - None
     * @returns {Element} Node mount parent.
     */
    getToastParent() {
      const player = globalThis.YSC_CONTROLLER?.getPlayer();
      if (player) return player;

      const fs = document.fullscreenElement;
      if (fs) return fs;

      return document.body;
    }

    /**
     * Animates toast notifications.
     * 
     * @danishansari-dev options - Notice properties.
     */
    showToast(options) {
      const { label = "Speed", value, force = false } = options;
      if (globalThis.YSC_SETTINGS?.toastHidden && !force) {
        return;
      }

      const parent = this.getToastParent();
      if (!parent) return;

      this.ensureToast();

      if (this.toast.parentElement !== parent) {
        parent.append(this.toast);
      }

      if (globalThis.YSC_WIDGET?.widgetPlacement === "floating") {
        globalThis.YSC_WIDGET?.applyFloatingPresentation();
      }

      this.toastLabelText.textContent = label;
      this.toastValueText.textContent = value;
      this.toast.classList.add("ysc-speed-toast-visible");

      // Why we calculate and apply the slider width inline:
      // We map the active numeric speed rate between YSC_MIN_PLAYBACK_RATE and YSC_MAX_PLAYBACK_RATE
      // to a percentage width to dynamically fill the glassmorphic speed bar.
      if (this.toastSlider) {
        if (typeof options.rate === "number") {
          this.toastSlider.style.display = "";
          const minRate = globalThis.YSC_MIN_PLAYBACK_RATE || 0.25;
          const maxRate = globalThis.YSC_MAX_PLAYBACK_RATE || 10;
          const pct = Math.min(100, Math.max(0, ((options.rate - minRate) / (maxRate - minRate)) * 100));
          this.toastSliderFill.style.width = `${pct}%`;
        } else {
          this.toastSlider.style.display = "none";
        }
      }

      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => {
        this.toast?.classList.remove("ysc-speed-toast-visible");
      }, TOAST_TIMEOUT_MS);
    }

    /**
     * Toast speed wrapper query.
     * 
     * @danishansari-dev rate - Numeric speed value.
     * @danishansari-dev options - Toast overrides options.
     */
    showSpeedToast(rate, options = {}) {
      const { label = "Speed", force = false } = options;
      this.showToast({
        label,
        value: formatRate(rate),
        rate,
        force
      });
    }

    /**
     * Toggles visibility configs.
     * 
     * @danishansari-dev - None
     */
    toggleToastVisibility() {
      if (!globalThis.YSC_SETTINGS) return;
      globalThis.YSC_SETTINGS.toastHidden = !globalThis.YSC_SETTINGS.toastHidden;
      globalThis.YSC_SETTINGS.saveSetting(STORAGE_KEYS.toastHidden, globalThis.YSC_SETTINGS.toastHidden);
      this.showToast({
        label: "Overlay",
        value: globalThis.YSC_SETTINGS.toastHidden ? "Off" : "On",
        force: true
      });
    }

    /**
     * Clears overlay timers and removes container blocks.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      window.clearTimeout(this.toastTimer);
      if (this.toast) {
        this.toast.remove();
        this.toast = null;
      }
    }
  }

  // --- SHORTCUT MANAGER ---

  /**
   * Evaluates keypress interactions and hooks hold speed boosts.
   * 
   * Why this exists:
   * Centralizes typing validations and coordinates triggers for preset rate steps
   * or temporary holds (like hold X to boost).
   */
  class ShortcutManager {
    /**
     * @danishansari-dev settings - SettingsManager instance reference.
     * @danishansari-dev controller - VideoController instance reference.
     */
    constructor(settings, controller) {
      this.settings = settings;
      this.controller = controller;

      this.boundKeyDown = this.handleKeyDown.bind(this);
      this.boundKeyUp = this.handleKeyUp.bind(this);
      this.boundBlur = this.handleBlur.bind(this);
    }

    /**
     * Helper mapping check elements matching editable textbox controls.
     * 
     * @danishansari-dev element - Target DOM element node.
     * @returns {boolean} Editability status.
     */
    isEditableElement(element) {
      if (!(element instanceof Element)) return false;
      const textInputSelector = ["input", "textarea", "select", "[role='textbox']", "[role='searchbox']"].join(",");
      return element.isContentEditable || element.matches(textInputSelector) || Boolean(element.closest(textInputSelector));
    }

    /**
     * Evaluates if event targets are text-input context layers.
     * 
     * @danishansari-dev event - KeyboardEvent.
     * @returns {boolean} True if typing context.
     */
    isTypingContext(event) {
      if (this.isEditableElement(document.activeElement)) {
        return true;
      }
      return event.composedPath().some((el) => this.isEditableElement(el));
    }

    /**
     * Consumes keyboard events preventing host site overrides.
     * 
     * @danishansari-dev event - KeyboardEvent.
     */
    consumeEvent(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    /**
     * Compares KeyboardEvents to registered shortcut configurations.
     * 
     * @danishansari-dev event - KeyboardEvent.
     * @danishansari-dev shortcut - Shortcut configuration rule.
     * @returns {boolean} Match status.
     */
    shortcutMatches(event, shortcut) {
      if (!shortcut || event.isComposing) return false;
      return event.code === shortcut.code
        && event.shiftKey === Boolean(shortcut.shift)
        && event.ctrlKey === Boolean(shortcut.ctrl)
        && event.altKey === Boolean(shortcut.alt)
        && event.metaKey === Boolean(shortcut.meta);
    }

    /**
     * Evaluates keys direction offsets.
     * 
     * @danishansari-dev event - KeyboardEvent.
     * @returns {number} Offset integer (1, -1, or 0).
     */
    getShortcutDirection(event) {
      if (this.shortcutMatches(event, this.settings.shortcuts.increase) || this.shortcutMatches(event, this.settings.shortcuts.increaseAlt)) {
        return 1;
      }
      if (this.shortcutMatches(event, this.settings.shortcuts.decrease) || this.shortcutMatches(event, this.settings.shortcuts.decreaseAlt)) {
        return -1;
      }
      return 0;
    }

    /**
     * Resolves preset speed target rates.
     * 
     * @danishansari-dev event - KeyboardEvent.
     * @returns {number|null} Playback target rate.
     */
    getPresetRate(event) {
      for (const [action, rate] of Object.entries(PRESET_ACTION_RATES)) {
        if (this.shortcutMatches(event, this.settings.shortcuts[action])) {
          return rate;
        }
      }
      return null;
    }

    /**
     * Starts temporary speed boosts.
     * 
     * @danishansari-dev - None
     */
    startTemporaryBoost() {
      if (this.controller.isBoosting) return;

      this.controller.isBoosting = true;
      this.controller.boostRestoreRate = this.controller.getCurrentRate();
      this.controller.applyRate(BOOST_RATE, {
        persist: false,
        notify: true,
        notifyAlways: true,
        label: "Boost"
      });
    }

    /**
     * Stops temporary boost restores.
     * 
     * @danishansari-dev - None
     */
    stopTemporaryBoost() {
      if (!this.controller.isBoosting) return;

      const restoreRate = this.controller.boostRestoreRate ?? this.settings.rate;
      this.controller.isBoosting = false;
      this.controller.boostRestoreRate = null;
      this.controller.applyRate(restoreRate, {
        persist: false,
        notify: true
      });
    }

    /**
     * Core keydown router interface.
     * 
     * @danishansari-dev event - KeyboardEvent.
     */
    handleKeyDown(event) {
      if (!this.settings.enabled || !this.settings.keyboardEnabled || this.isTypingContext(event) || !this.controller.hasActiveVideoPlayer()) {
        return;
      }
      if (!this.settings.isExtensionControllingPage()) {
        return;
      }

      if (this.shortcutMatches(event, this.settings.shortcuts.boost)) {
        if (!this.settings.boostEnabled) return;
        this.consumeEvent(event);
        if (!event.repeat) {
          this.startTemporaryBoost();
        }
        return;
      }

      const direction = this.getShortcutDirection(event);
      if (direction) {
        this.consumeEvent(event);
        this.controller.moveRate(direction, { notify: true });
        return;
      }

      const presetRate = this.getPresetRate(event);
      if (presetRate !== null) {
        this.consumeEvent(event);
        if (!event.repeat) {
          this.controller.applyRate(presetRate, { notify: true, notifyAlways: true });
        }
        return;
      }

      if (this.shortcutMatches(event, this.settings.shortcuts.reset)) {
        this.consumeEvent(event);
        if (!event.repeat) {
          this.controller.applyRate(1, { notify: true, notifyAlways: true, label: "Reset" });
        }
        return;
      }

      if (this.shortcutMatches(event, this.settings.shortcuts.widgetToggle)) {
        this.consumeEvent(event);
        if (!event.repeat) {
          this.toggleWidgetVisibility();
        }
        return;
      }

      if (this.shortcutMatches(event, this.settings.shortcuts.overlayToggle)) {
        this.consumeEvent(event);
        if (!event.repeat) {
          globalThis.YSC_TOAST?.toggleToastVisibility();
        }
      }
    }

    /**
     * Key release listener triggers boost resets.
     * 
     * @danishansari-dev event - KeyboardEvent.
     */
    handleKeyUp(event) {
      if (!this.controller.isBoosting) return;
      if (event.code === this.settings.shortcuts.boost.code) {
        this.consumeEvent(event);
        this.stopTemporaryBoost();
      }
    }

    /**
     * Blur listeners to prevent stuck boost keys.
     * 
     * @danishansari-dev - None
     */
    handleBlur() {
      this.stopTemporaryBoost();
    }

    /**
     * Toggles layout visibility.
     * 
     * @danishansari-dev - None
     */
    toggleWidgetVisibility() {
      this.settings.widgetHidden = !this.settings.widgetHidden;
      globalThis.YSC_WIDGET?.updateWidgetVisibility();
      this.settings.saveSetting(STORAGE_KEYS.widgetHidden, this.settings.widgetHidden);
      globalThis.YSC_TOAST?.showToast({
        label: "Widget",
        value: this.settings.widgetHidden ? "Off" : "On",
        force: true
      });
    }

    /**
     * Standardizes document handlers attachment.
     * 
     * @danishansari-dev - None
     */
    start() {
      window.addEventListener("keydown", this.boundKeyDown, true);
      window.addEventListener("keyup", this.boundKeyUp, true);
      window.addEventListener("blur", this.boundBlur, true);
    }

    /**
     * Standardizes listeners detachment.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      window.removeEventListener("keydown", this.boundKeyDown, true);
      window.removeEventListener("keyup", this.boundKeyUp, true);
      window.removeEventListener("blur", this.boundBlur, true);
    }
  }

  // --- MOUSE WHEEL MANAGER ---

  /**
   * Captures Ctrl + Scroll adjustments over video components.
   * 
   * Why this exists:
   * Separates mouse scroll interception logic and caps event processing speeds.
   */
  class WheelManager {
    /**
     * @danishansari-dev settings - SettingsManager instance reference.
     * @danishansari-dev controller - VideoController instance reference.
     * @danishansari-dev observer - DOMObserver instance reference.
     */
    constructor(settings, controller, observer) {
      this.settings = settings;
      this.controller = controller;
      this.observer = observer;
      this.lastWheelAt = 0;

      this.boundWheel = this.handleWheel.bind(this);
    }

    /**
     * Intercepts scrolling inputs.
     * 
     * @danishansari-dev event - WheelEvent.
     */
    handleWheel(event) {
      if (
        !this.settings.enabled
        || !this.settings.mouseWheelEnabled
        || !event.ctrlKey
        || event.altKey
        || event.metaKey
        || event.shiftKey
        || event.deltaY === 0
      ) {
        return;
      }

      if (!this.settings.isExtensionControllingPage()) return;
      if (globalThis.YSC_SHORTCUTS?.isTypingContext(event)) return;

      const pathVideo = event.composedPath().find(
        (node) => node instanceof HTMLVideoElement && this.observer.isVideoUsable(node)
      );
      if (pathVideo) {
        this.observer.lastPointerVideo = pathVideo;
      }

      const targetVideo = this.controller.getVideo();
      const player = this.controller.getPlayer();
      const overYoutubeChrome = player && event.composedPath().includes(player);
      const overVideo = pathVideo || (targetVideo && event.composedPath().includes(targetVideo));

      if (!overYoutubeChrome && !overVideo) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const now = performance.now();
      if (now - this.lastWheelAt < WHEEL_THROTTLE_MS) {
        return;
      }
      this.lastWheelAt = now;
      this.controller.moveRate(event.deltaY < 0 ? 1 : -1, { notify: true });
    }

    /**
     * Registers listeners.
     * 
     * @danishansari-dev - None
     */
    start() {
      window.addEventListener("wheel", this.boundWheel, { capture: true, passive: false });
    }

    /**
     * Detaches scroll events.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      window.removeEventListener("wheel", this.boundWheel, true);
    }
  }

  // --- ANALYTICS MANAGER ---

  /**
   * Records daily and session-level active speed usage.
   * 
   * Why this exists:
   * Calculates saved user playback minutes and logs usage parameters.
   */
  class AnalyticsManager {
    /**
     * @danishansari-dev settings - SettingsManager instance reference.
     * @danishansari-dev controller - VideoController instance reference.
     */
    constructor(settings, controller) {
      this.settings = settings;
      this.controller = controller;

      this.analyticsLastAt = 0;
      this.analyticsLastSaveAt = 0;
      this.sessionActiveSeconds = 0;
      this.sessionRateWeightedSeconds = 0;
      this.analyticsTimer = null;

      this.boundVisibilityChange = this.handleVisibilityChange.bind(this);
      this.boundBeforeUnload = this.saveAnalytics.bind(this);
    }

    /**
     * Sorts speed keys to return the most used rate label.
     * 
     * @danishansari-dev - None
     * @returns {string} Most used playback speed representation.
     */
    getMostUsedSpeed() {
      const entries = Object.entries(this.settings.analytics.speedUsageSeconds || {});
      if (!entries.length) {
        return formatRate(this.controller.getCurrentRate());
      }
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    }

    /**
     * Serializes analytics map configurations to storage.
     * 
     * @danishansari-dev - None
     */
    saveAnalytics() {
      this.settings.saveSetting(STORAGE_KEYS.analytics, this.settings.analytics);
      this.analyticsLastSaveAt = performance.now();
    }

    /**
     * Calculates user session playback parameters.
     * 
     * Why this exists:
     * Increments usage statistics based on interval delta offsets when a video is playing.
     * 
     * @danishansari-dev - None
     */
    trackAnalytics() {
      const now = performance.now();
      const video = this.controller.getVideo();

      if (!this.analyticsLastAt) {
        this.analyticsLastAt = now;
        return;
      }

      const deltaSeconds = Math.min(5, Math.max(0, (now - this.analyticsLastAt) / 1000));
      this.analyticsLastAt = now;

      if (!this.settings.isExtensionControllingPage() || !video || video.paused || video.ended || deltaSeconds <= 0) {
        return;
      }

      const todayKey = getTodayKey();
      if (this.settings.analytics.dailyDate !== todayKey) {
        this.settings.analytics.dailyDate = todayKey;
        this.settings.analytics.dailyUsageSeconds = 0;
        this.settings.analytics = this.settings.normalizeAnalytics(this.settings.analytics);
      }

      const rate = normalizePlaybackRate(video.playbackRate || this.settings.rate);
      const rateLabel = formatRate(rate);
      const todayUsage = {
        ...asPlainObject(this.settings.analytics.speedUsageByDate?.[this.settings.analytics.dailyDate])
      };

      todayUsage[rateLabel] = (todayUsage[rateLabel] || 0) + deltaSeconds;

      this.settings.analytics.dailyUsageSeconds += deltaSeconds;
      this.settings.analytics.timeSavedSeconds += Math.max(0, deltaSeconds * (rate - 1));
      this.settings.analytics.speedUsageSeconds = {
        ...this.settings.analytics.speedUsageSeconds,
        [rateLabel]: (this.settings.analytics.speedUsageSeconds[rateLabel] || 0) + deltaSeconds
      };
      this.settings.analytics.speedUsageByDate = {
        ...this.settings.analytics.speedUsageByDate,
        [this.settings.analytics.dailyDate]: todayUsage
      };

      this.sessionActiveSeconds += deltaSeconds;
      this.sessionRateWeightedSeconds += rate * deltaSeconds;

      if (now - this.analyticsLastSaveAt > 15000) {
        this.saveAnalytics();
      }
    }

    /**
     * Visibility changes trigger immediate storage writes.
     * 
     * @danishansari-dev - None
     */
    handleVisibilityChange() {
      if (document.hidden) {
        this.saveAnalytics();
      }
    }

    /**
     * Starts interval tracking loops.
     * 
     * @danishansari-dev - None
     */
    start() {
      this.analyticsTimer = window.setInterval(() => this.trackAnalytics(), 1000);
      document.addEventListener("visibilitychange", this.boundVisibilityChange);
      window.addEventListener("beforeunload", this.boundBeforeUnload);
    }

    /**
     * Stops interval trackers and flushes pending data structures.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      window.clearInterval(this.analyticsTimer);
      document.removeEventListener("visibilitychange", this.boundVisibilityChange);
      window.removeEventListener("beforeunload", this.boundBeforeUnload);
      this.saveAnalytics();
    }
  }

  // --- APP CONTROLLER (ORCHESTRATOR) ---

  /**
   * Main controller coordinates startup, shutdown, messaging, and event routes.
   * 
   * Why this exists:
   * Integrates the settings, observers, keyboard/scroll managers, layouts, and messages
   * into a unified startup sequence. Installs the hot-reload safety hooks.
   */
  class AppController {
    constructor() {
      this.settings = new SettingsManager();
      this.observer = new DOMObserver(this.scheduleRefresh.bind(this));
      this.controller = new VideoController(
        this.settings,
        this.observer,
        this.handleRateUpdate.bind(this),
        this.handleVideoUpdate.bind(this)
      );
      this.widgetUI = new WidgetUI(this.settings, this.controller, this.observer);
      this.toastUI = new ToastUI();
      this.shortcutManager = new ShortcutManager(this.settings, this.controller);
      this.wheelManager = new WheelManager(this.settings, this.controller, this.observer);
      this.analyticsManager = new AnalyticsManager(this.settings, this.controller);

      // Single global-scope lookup access for UI/shortcut managers
      globalThis.YSC_SETTINGS = this.settings;
      globalThis.YSC_CONTROLLER = this.controller;
      globalThis.YSC_WIDGET = this.widgetUI;
      globalThis.YSC_TOAST = this.toastUI;
      globalThis.YSC_SHORTCUTS = this.shortcutManager;

      this.mutationTimer = null;
      this.pointerMoveTimer = null;
      this.themeSampleTimer = null;

      // Event listener bindings
      this.boundMessage = this.handleRuntimeMessage.bind(this);
      this.boundPointerMove = this.handlePointerMove.bind(this);
      this.boundFullscreenChange = this.handleFullscreenChange.bind(this);
      this.boundResize = this.handleResize.bind(this);
      this.boundRefresh = this.refresh.bind(this);
      this.boundHoldStop = () => this.widgetUI.stopSpeedHold();
    }

    /**
     * Resolves settings updates to UI components.
     * 
     * @danishansari-dev rate - Rounded rate speed.
     */
    handleRateUpdate(rate) {
      this.widgetUI.updateWidget(rate);
    }

    /**
     * Handlers for video element mounts.
     * 
     * @danishansari-dev video - Target playback element.
     */
    handleVideoUpdate(video) {
      this.widgetUI.placeWidget();
      video.addEventListener("touchstart", (e) => this.touchAmbientStart(e), { passive: true });
      video.addEventListener("touchend", () => this.touchAmbientEnd(), { passive: true });
    }

    /**
     * Touch activation helper.
     * 
     * @danishansari-dev event - TouchEvent.
     */
    touchAmbientStart(event) {
      if (this.widgetUI.widgetPlacement !== "floating") return;
      const touch = event.touches?.[0];
      if (touch) {
        this.observer.lastPointerClientX = touch.clientX;
        this.observer.lastPointerClientY = touch.clientY;
      }
      this.widgetUI.clearFloatingHideTimer();
      this.widgetUI.floatingHoverActive = true;
      this.widgetUI.applyFloatingAmbientClass();
    }

    /**
     * Touch end helper.
     * 
     * @danishansari-dev - None
     */
    touchAmbientEnd() {
      if (this.widgetUI.widgetPlacement !== "floating") return;
      this.widgetUI.scheduleFloatingHide();
    }

    /**
     * Serializes popups configuration state snapshots.
     * 
     * @danishansari-dev - None
     * @returns {object} Settings parameters.
     */
    getSettingsSnapshot() {
      return {
        enabled: this.settings.enabled,
        widgetEnabled: !this.settings.widgetHidden,
        keyboardEnabled: this.settings.keyboardEnabled,
        mouseWheelEnabled: this.settings.mouseWheelEnabled,
        boostEnabled: this.settings.boostEnabled,
        rememberPerChannel: this.settings.rememberPerChannel,
        rememberGlobally: this.settings.rememberGlobally,
        rememberPerSite: this.settings.rememberPerSite,
        autoApplyPreferredSpeed: this.settings.autoApplyPreferredSpeed,
        compactMode: this.settings.compactMode,
        overlayEnabled: !this.settings.toastHidden,
        fullscreenOnlyControls: this.settings.fullscreenOnlyControls,
        themeMode: this.settings.themeMode,
        startupDefaultSpeed: this.settings.startupDefaultSpeed,
        siteAccessMode: this.settings.siteAccessMode,
        defaultNativeMode: this.settings.defaultNativeMode
      };
    }

    /**
     * Gathers application runtime speed metrics.
     * 
     * @danishansari-dev - None
     * @returns {object} Runtime status dictionary.
     */
    collectState() {
      const video = this.controller.getVideo();
      const hasVideo = Boolean(video && this.observer.isVideoUsable(video));
      const rate = this.controller.getCurrentRate();
      const sessionAverageSpeed = this.analyticsManager.sessionActiveSeconds
        ? this.analyticsManager.sessionRateWeightedSeconds / this.analyticsManager.sessionActiveSeconds
        : rate;

      const host = getHostname();
      const policy = this.settings.getSitePolicy();
      const nativeMode = this.settings.getEffectiveNativeMode();

      let status = "Active";
      if (!this.settings.enabled) {
        status = "Disabled";
      } else if (this.settings.getAccessBlockReason()) {
        status = "Disabled on this site";
      } else if (!hasVideo) {
        status = "No active video found";
      }

      // Check if host video player has visible native speed settings elements
      let nativeControlsLikely = false;
      if (hasVideo) {
        const root = video.closest(
          ["[class*='playback-rate' i]", "[class*='playbackRate' i]", "[data-testid*='playback' i]",
           "[aria-label*='playback speed' i]", "[aria-label*='speed' i]"].join(", ")
        );
        if (root) {
          nativeControlsLikely = true;
        } else {
          const settingsMenus = video.closest("div")?.querySelectorAll("button, [role='menuitem']");
          if (settingsMenus) {
            nativeControlsLikely = Array.from(settingsMenus).some((node) => /speed|playback/i.test(node.textContent || ""));
          }
        }
      }

      // Read details of video element if connected
      const videoTitle = () => {
        if (isYouTubeHost()) {
          const title = document.querySelector("ytd-watch-metadata h1 yt-formatted-string")?.textContent?.trim()
            || document.querySelector("h1.title yt-formatted-string")?.textContent?.trim()
            || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();
          return title || "Untitled video";
        }
        const aria = video?.getAttribute("aria-label")?.trim();
        const trackLabel = video?.textTracks?.[0]?.label?.trim();
        return aria || trackLabel || document.title.trim() || "Video";
      };

      return {
        status,
        enabled: this.settings.enabled,
        // Why this exists:
        // Passed to the popup state to conditionally render the review prompt card.
        reviewPromptDismissed: this.settings.reviewPromptDismissed,
        hasVideo,
        rate,
        preferredRate: this.settings.rate,
        minRate: MIN_PLAYBACK_RATE,
        maxRate: MAX_PLAYBACK_RATE,
        step: SPEED_STEP,
        video: {
          title: hasVideo ? videoTitle() : "",
          duration: hasVideo && Number.isFinite(video.duration) ? video.duration : 0,
          currentTime: hasVideo && Number.isFinite(video.currentTime) ? video.currentTime : 0,
          paused: hasVideo ? video.paused : true
        },
        tab: {
          domain: host,
          url: location.href,
          isYouTube: isYouTubeHost(),
          siteDisabled: policy.disabled === true,
          rememberPerSite: this.settings.rememberPerSite,
          sitePreferredRate: policy.preferredRate ?? null,
          siteNativeOverride: policy.nativeMode ?? null,
          nativeMode,
          defaultNativeMode: this.settings.defaultNativeMode,
          siteAccessMode: this.settings.siteAccessMode,
          siteAccessList: this.settings.siteAccessList,
          accessBlockedReason: this.settings.getAccessBlockReason(),
          nativeControlsLikely
        },
        settings: this.getSettingsSnapshot(),
        shortcuts: this.settings.shortcuts,
        analytics: {
          dailyUsageSeconds: this.settings.analytics.dailyUsageSeconds || 0,
          timeSavedSeconds: this.settings.analytics.timeSavedSeconds || 0,
          mostUsedSpeed: this.analyticsManager.getMostUsedSpeed(),
          sessionAverageSpeed
        }
      };
    }

    /**
     * Dispatches changes to settings and triggers UI layout updates.
     * 
     * @danishansari-dev key - Configuration key.
     * @danishansari-dev value - Target value configuration.
     * @returns {boolean} Adjustments status.
     */
    updateExtensionSetting(key, value) {
      const updated = this.settings.updateSetting(key, value);
      if (!updated) return false;

      if (key === "enabled") {
        if (!this.settings.enabled) {
          this.shortcutManager.stopTemporaryBoost();
          this.widgetUI.stopSpeedHold({ suppressClick: false });
        } else {
          this.controller.enforcePreferredRate();
        }
      } else if (key === "boostEnabled") {
        if (!this.settings.boostEnabled) {
          this.shortcutManager.stopTemporaryBoost();
        }
      } else if (key === "autoApplyPreferredSpeed") {
        if (this.settings.autoApplyPreferredSpeed) {
          this.controller.enforcePreferredRate();
        }
      }

      this.widgetUI.updateWidgetVisibility();
      this.widgetUI.applyFloatingPresentation();
      return true;
    }

    /**
     * Interface router receiving popup control commands.
     * 
     * @danishansari-dev message - Action command.
     * @danishansari-dev sender - Runtime sender.
     * @danishansari-dev sendResponse - Response channel.
     * @returns {boolean} Async message marker status.
     */
    handleRuntimeMessage(message, sender, sendResponse) {
      if (!message || typeof message.type !== "string" || !message.type.startsWith("YSC_")) {
        return false;
      }

      if (message.type === "YSC_GET_STATE") {
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_SET_RATE") {
        this.controller.applyRate(message.rate, { notify: true, notifyAlways: true });
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_MOVE_RATE") {
        this.controller.moveRate(Number(message.direction) > 0 ? 1 : -1, { notify: true });
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_UPDATE_SETTING") {
        const updated = this.updateExtensionSetting(message.key, message.value);
        sendResponse({ ok: updated, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_UPDATE_SHORTCUTS") {
        this.settings.shortcuts = this.settings.normalizeShortcuts(message.shortcuts);
        this.settings.saveSetting(STORAGE_KEYS.shortcuts, this.settings.shortcuts);
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_RESET_SHORTCUTS") {
        this.settings.shortcuts = this.settings.normalizeShortcuts({});
        this.settings.saveSetting(STORAGE_KEYS.shortcuts, this.settings.shortcuts);
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_SET_SITE_DISABLED") {
        this.settings.updateSitePolicy({ disabled: Boolean(message.disabled) });
        this.refresh();
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_SET_SITE_NATIVE_MODE") {
        const mode = message.mode === "default"
          ? null
          : (message.mode === "override" || message.mode === "sync" ? message.mode : null);
        this.settings.updateSitePolicy({ nativeMode: mode });
        this.refresh();
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_SET_SITE_ACCESS_LIST") {
        this.settings.siteAccessMode = ["all", "whitelist", "blacklist"].includes(message.mode) ? message.mode : "all";
        this.settings.siteAccessList = this.settings.normalizeAccessList(message.hosts);
        this.settings.saveSetting(STORAGE_KEYS.siteAccessMode, this.settings.siteAccessMode);
        this.settings.saveSetting(STORAGE_KEYS.siteAccessList, this.settings.siteAccessList);
        this.refresh();
        sendResponse({ ok: true, state: this.collectState() });
        return true;
      }

      if (message.type === "YSC_STORAGE_CHANGED") {
        this.settings.readStoredSettings()
          .then((settings) => {
            this.settings.applyStoredSettings(settings);
            this.refresh();
            sendResponse({ ok: true, state: this.collectState() });
          })
          .catch((err) => {
            console.error("[Video Speed Controller] Failed to refresh settings.", err);
            sendResponse({ ok: false });
          });
        return true;
      }

      return false;
    }

    /**
     * Debounces DOM mutations checking for video components.
     * 
     * @danishansari-dev - None
     */
    scheduleRefresh() {
      if (this.mutationTimer) return;
      this.mutationTimer = window.setTimeout(() => {
        this.mutationTimer = null;
        this.refresh();
      }, 500);
    }

    /**
     * Updates widget draw anchors and checks video bindings.
     * 
     * @danishansari-dev - None
     */
    refresh() {
      if (!this.settings.isExtensionControllingPage()) {
        this.widgetUI.widget?.classList.add("ysc-speed-widget-hidden");
        this.widgetUI.resetFloatingHoverState();
        this.controller.detachVideoListeners();
        return;
      }

      this.widgetUI.placeWidget();
      this.controller.watchVideo();
    }

    /**
     * Cursor tracking callback triggers hover dimming updates.
     * 
     * @danishansari-dev event - PointerEvent.
     */
    handlePointerMove(event) {
      if (this.pointerMoveTimer) return;

      this.pointerMoveTimer = window.requestAnimationFrame(() => {
        this.pointerMoveTimer = null;
        this.observer.lastPointerClientX = event.clientX;
        this.observer.lastPointerClientY = event.clientY;

        const path = event.composedPath();
        const hovered = path.find((node) => node instanceof HTMLVideoElement && this.observer.isVideoUsable(node));

        this.observer.lastPointerVideo = hovered || this.observer.lastPointerVideo;
        this.widgetUI.updateFloatingHoverFromClientPoint(this.observer.lastPointerClientX, this.observer.lastPointerClientY);

        if (!isYouTubeHost()) return;

        const hoveredPlayer = hovered?.closest?.(".html5-video-player");
        if (hoveredPlayer && !this.widgetUI.isYouTubeWatchPlayer(hoveredPlayer)) {
          return;
        }

        if (hoveredPlayer && this.widgetUI.isYouTubeWatchPlayer(hoveredPlayer) && this.widgetUI.widgetPlacement !== "youtube") {
          this.refresh();
          return;
        }

        if (this.widgetUI.widgetPlacement === "floating") {
          this.widgetUI.applyFloatingPresentation();
        }
      });
    }

    /**
     * Toggles layout profiles during fullscreen updates.
     * 
     * @danishansari-dev - None
     */
    handleFullscreenChange() {
      this.widgetUI.applyFloatingPresentation();
      this.widgetUI.updateWidgetVisibility();
      this.widgetUI.updateFloatingHoverFromClientPoint(this.observer.lastPointerClientX, this.observer.lastPointerClientY);
    }

    /**
     * Window resizing layouts adjust debounces.
     * 
     * @danishansari-dev - None
     */
    handleResize() {
      window.clearTimeout(this.themeSampleTimer);
      this.themeSampleTimer = window.setTimeout(() => {
        this.widgetUI.applyFloatingPresentation();
        this.widgetUI.updateFloatingHoverFromClientPoint(this.observer.lastPointerClientX, this.observer.lastPointerClientY);
      }, 120);
    }

    /**
     * Hooks window popstate routing notifications.
     * 
     * Why this exists:
     * Receives window messages from inject.js to trigger video checking on SPA router transitions.
     * 
     * @danishansari-dev - None
     */
    hookHistory() {
      this.messageListener = (event) => {
        if (event.source === window && event.data?.type === "YSC_SPA_NAVIGATE") {
          this.scheduleRefresh();
        }
      };
      window.addEventListener("message", this.messageListener);
    }

    /**
     * Boots configurations and registers window bindings.
     * 
     * @danishansari-dev - None
     */
    async start() {
      const settings = await this.settings.readStoredSettings();
      this.settings.applyStoredSettings(settings);

      this.observer.start();
      this.shortcutManager.start();
      this.wheelManager.start();
      this.analyticsManager.start();

      this.refresh();

      if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener(this.boundMessage);
      }

      window.addEventListener("pointermove", this.boundPointerMove, true);
      window.addEventListener("fullscreenchange", this.boundFullscreenChange);
      window.addEventListener("resize", this.boundResize);

      window.addEventListener("mouseup", this.boundHoldStop, true);
      window.addEventListener("touchend", this.boundHoldStop, true);

      document.addEventListener("yt-navigate-finish", this.boundRefresh);
      document.addEventListener("yt-player-updated", this.boundRefresh);
      document.addEventListener("enterpictureinpicture", this.boundRefresh, true);
      document.addEventListener("leavepictureinpicture", this.boundRefresh, true);

      this.hookHistory();
    }

    /**
     * Fully unloads manager observers, event layers, and removes DOM widget elements.
     * 
     * @danishansari-dev - None
     */
    cleanup() {
      window.clearTimeout(this.mutationTimer);
      window.cancelAnimationFrame(this.pointerMoveTimer);
      window.clearTimeout(this.themeSampleTimer);

      this.observer.cleanup();
      this.controller.cleanup();
      this.widgetUI.cleanup();
      this.toastUI.cleanup();
      this.shortcutManager.cleanup();
      this.wheelManager.cleanup();
      this.analyticsManager.cleanup();

      if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(this.boundMessage);
      }

      window.removeEventListener("pointermove", this.boundPointerMove, true);
      window.removeEventListener("fullscreenchange", this.boundFullscreenChange);
      window.removeEventListener("resize", this.boundResize);
      window.removeEventListener("mouseup", this.boundHoldStop, true);
      window.removeEventListener("touchend", this.boundHoldStop, true);
      if (this.messageListener) {
        window.removeEventListener("message", this.messageListener);
      }

      document.removeEventListener("yt-navigate-finish", this.boundRefresh);
      document.removeEventListener("yt-player-updated", this.boundRefresh);
      document.removeEventListener("enterpictureinpicture", this.boundRefresh, true);
      document.removeEventListener("leavepictureinpicture", this.boundRefresh, true);

      delete globalThis.YSC_SETTINGS;
      delete globalThis.YSC_CONTROLLER;
      delete globalThis.YSC_WIDGET;
      delete globalThis.YSC_TOAST;
      delete globalThis.YSC_SHORTCUTS;
    }
  }

  // --- INITIALIZATION GATEWAY ---

  // Check if a previous instance of the speed controller script is already running.
  // Why this exists:
  // Extension auto-updates leave orphaned content scripts running on the page.
  // Calling cleanup() on the previous instance tears down all of its event handlers,
  // disconnected MutationObservers, and UI widgets before launching the new code,
  // avoiding duplicate UI rendering and event loop leaks.
  if (window[CLEANUP_FN_KEY]) {
    try {
      window[CLEANUP_FN_KEY]();
    } catch (error) {
      console.warn("[Video Speed Controller] Previous instance cleanup failed:", error);
    }
  }

  const app = new AppController();

  // Set the cleanup hook on window so any subsequent script reload can trigger cleanup()
  window[CLEANUP_FN_KEY] = () => {
    try {
      app.cleanup();
    } finally {
      window[SCRIPT_INSTANCE_KEY] = false;
      delete window[CLEANUP_FN_KEY];
    }
  };

  try {
    const startup = app.start();
    if (startup && typeof startup.catch === "function") {
      startup.catch((error) => {
        console.error("[Video Speed Controller] Failed to start content script async phase.", error);
      });
    }
  } catch (error) {
    console.error("[Video Speed Controller] Failed to start content script synchronous phase.", error);
  }
})();

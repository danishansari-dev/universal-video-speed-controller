(() => {
  "use strict";

  const SCRIPT_INSTANCE_KEY = "__youtubeSpeedControllerLoaded";

  if (window[SCRIPT_INSTANCE_KEY]) {
    return;
  }

  window[SCRIPT_INSTANCE_KEY] = true;

  const STORAGE_KEYS = {
    rate: "youtubeSpeedController.playbackRate",
    widgetHidden: "youtubeSpeedController.widgetHidden",
    toastHidden: "youtubeSpeedController.toastHidden"
  };

  const EPSILON = 0.01;
  const SPEED_STEP = 0.25;
  const MIN_PLAYBACK_RATE = 0.25;
  const MAX_PLAYBACK_RATE = 10;
  const BOOST_RATE = 2;
  const TOAST_TIMEOUT_MS = 900;
  const WHEEL_THROTTLE_MS = 120;
  const SPEEDS = Array.from(
    { length: Math.round((MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE) / SPEED_STEP) + 1 },
    (_, index) => Number((MIN_PLAYBACK_RATE + (index * SPEED_STEP)).toFixed(2))
  );
  const PRESET_RATES = {
    Digit1: 1,
    Digit2: 2,
    Digit3: 3,
    Digit4: 4,
    Digit5: 5,
    Digit0: 10,
    Numpad1: 1,
    Numpad2: 2,
    Numpad3: 3,
    Numpad4: 4,
    Numpad5: 5,
    Numpad0: 10
  };

  let preferredRate = 1;
  let widgetHidden = false;
  let toastHidden = false;
  let widget = null;
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

  const getChromeStorage = () => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return null;
    }

    return chrome.storage.local;
  };

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

  const readStoredSettings = () => new Promise((resolve) => {
    const storage = getChromeStorage();

    if (!storage) {
      resolve({
        rate: 1,
        widgetHidden: false,
        toastHidden: false
      });
      return;
    }

    storage.get(Object.values(STORAGE_KEYS), (result) => {
      if (chrome.runtime?.lastError) {
        resolve({
          rate: 1,
          widgetHidden: false,
          toastHidden: false
        });
        return;
      }

      resolve({
        rate: normalizePlaybackRate(result[STORAGE_KEYS.rate]),
        widgetHidden: result[STORAGE_KEYS.widgetHidden] === true,
        toastHidden: result[STORAGE_KEYS.toastHidden] === true
      });
    });
  });

  const saveSetting = (key, value) => {
    const storage = getChromeStorage();

    if (!storage) {
      return;
    }

    storage.set({ [key]: value });
  };

  const savePreferredRate = (rate) => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveSetting(STORAGE_KEYS.rate, normalizePlaybackRate(rate));
    }, 100);
  };

  const getPlayer = () => {
    const players = Array.from(document.querySelectorAll(".html5-video-player"));

    return players.find((player) => {
      const video = player.querySelector("video.html5-main-video, video");
      const rect = player.getBoundingClientRect();

      return video && rect.width > 0 && rect.height > 0;
    }) || null;
  };

  const getVideo = () => {
    const player = getPlayer();

    return player?.querySelector("video.html5-main-video, video") || null;
  };

  const hasActiveVideoPlayer = () => {
    const player = getPlayer();
    const video = player?.querySelector("video.html5-main-video, video");
    const rect = video?.getBoundingClientRect();

    return Boolean(player && video && rect && rect.width > 0 && rect.height > 0);
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

  const showToast = ({ label = "Speed", value, force = false }) => {
    if (toastHidden && !force) {
      return;
    }

    const player = getPlayer();
    const parent = player || document.body;

    if (!parent) {
      return;
    }

    ensureToast();

    if (toast.parentElement !== parent) {
      parent.append(toast);
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

  const updateWidgetVisibility = () => {
    widget?.classList.toggle("ysc-speed-widget-hidden", widgetHidden);
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

  const createButton = ({ className, text, label, title, onClick }) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = `ysc-speed-button ${className}`;
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.title = title;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });

    return button;
  };

  const createWidget = () => {
    const container = document.createElement("div");

    container.className = "ysc-speed-widget";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Playback speed controls");

    const decrease = createButton({
      className: "ysc-speed-decrease",
      text: "-",
      label: "Decrease playback speed",
      title: "Decrease playback speed",
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
      text: "+",
      label: "Increase playback speed",
      title: "Increase playback speed",
      onClick: () => moveRate(1, { notify: true })
    });

    container.append(decrease, rate, increase);

    for (const eventName of ["click", "dblclick", "mousedown", "pointerdown", "touchstart"]) {
      container.addEventListener(eventName, (event) => event.stopPropagation());
    }

    return container;
  };

  const isVisibleControl = (element) => {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);

    return style.display !== "none" && style.visibility !== "hidden";
  };

  const placeWidget = () => {
    const player = getPlayer();
    const rightControls = player?.querySelector(".ytp-right-controls");

    if (!rightControls) {
      return;
    }

    if (!widget) {
      widget = createWidget();
    }

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
      pendingProgrammaticRates.delete(changedRateKey);
      updateWidget(changedRate);
      return;
    }

    const changed = Math.abs(preferredRate - changedRate) > EPSILON;

    preferredRate = changedRate;
    updateWidget(changedRate);
    savePreferredRate(changedRate);

    if (changed) {
      showSpeedToast(changedRate);
    }
  };

  const enforcePreferredRate = () => {
    applyRate(isBoosting ? BOOST_RATE : preferredRate, { persist: false });
  };

  const watchVideo = () => {
    const video = getVideo();

    if (!video || video === activeVideo) {
      return;
    }

    if (activeVideo) {
      activeVideo.removeEventListener("ratechange", handleRateChange);
      activeVideo.removeEventListener("loadedmetadata", enforcePreferredRate);
      activeVideo.removeEventListener("canplay", enforcePreferredRate);
      activeVideo.removeEventListener("play", enforcePreferredRate);
    }

    activeVideo = video;
    activeVideo.addEventListener("ratechange", handleRateChange);
    activeVideo.addEventListener("loadedmetadata", enforcePreferredRate);
    activeVideo.addEventListener("canplay", enforcePreferredRate);
    activeVideo.addEventListener("play", enforcePreferredRate);

    enforcePreferredRate();
  };

  const refresh = () => {
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

  const isShiftOnly = (event) => event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;

  const isPlainKey = (event, code, key) => {
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) {
      return false;
    }

    return event.code === code || (event.key || "").toLowerCase() === key;
  };

  const getShortcutDirection = (event) => {
    if (!isShiftOnly(event) || event.isComposing) {
      return 0;
    }

    if (event.code === "Period" || event.key === ">") {
      return 1;
    }

    if (event.code === "Comma" || event.key === "<") {
      return -1;
    }

    return 0;
  };

  const getPresetRate = (event) => {
    if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey || event.isComposing) {
      return null;
    }

    return PRESET_RATES[event.code] ?? null;
  };

  const isResetShortcut = (event) => isShiftOnly(event)
    && !event.isComposing
    && event.code === "Backspace";

  const isWidgetToggleShortcut = (event) => isShiftOnly(event)
    && !event.isComposing
    && (event.code === "KeyS" || (event.key || "").toLowerCase() === "s");

  const isToastToggleShortcut = (event) => isShiftOnly(event)
    && !event.isComposing
    && (event.code === "KeyH" || (event.key || "").toLowerCase() === "h");

  const isBoostKey = (event) => isPlainKey(event, "KeyX", "x");

  const isBoostReleaseKey = (event) => event.code === "KeyX" || (event.key || "").toLowerCase() === "x";

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
    if (isTypingContext(event) || !hasActiveVideoPlayer()) {
      return;
    }

    if (isBoostKey(event)) {
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

  const handleWheel = (event) => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.deltaY === 0) {
      return;
    }

    const player = getPlayer();

    if (!player || isTypingContext(event) || !event.composedPath().includes(player)) {
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

  const scheduleRefresh = () => {
    if (mutationTimer) {
      return;
    }

    mutationTimer = window.setTimeout(() => {
      mutationTimer = 0;
      refresh();
    }, 250);
  };

  const start = async () => {
    const settings = await readStoredSettings();

    preferredRate = settings.rate;
    widgetHidden = settings.widgetHidden;
    toastHidden = settings.toastHidden;

    refresh();

    window.addEventListener("keydown", handleKeyboardShortcut, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", stopTemporaryBoost, true);
    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    document.addEventListener("yt-navigate-finish", scheduleRefresh);
    document.addEventListener("yt-player-updated", scheduleRefresh);

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  start();
})();

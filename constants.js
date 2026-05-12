(() => {
  "use strict";

  const DEFAULT_SHORTCUTS = Object.freeze({
    increase: Object.freeze({ label: "Shift + .", code: "Period", shift: true }),
    decrease: Object.freeze({ label: "Shift + ,", code: "Comma", shift: true }),
    reset: Object.freeze({ label: "Shift + Backspace", code: "Backspace", shift: true }),
    boost: Object.freeze({ label: "X (hold)", code: "KeyX", hold: true }),
    widgetToggle: Object.freeze({ label: "Shift + S", code: "KeyS", shift: true }),
    overlayToggle: Object.freeze({ label: "Shift + H", code: "KeyH", shift: true }),
    preset1: Object.freeze({ label: "Alt + 1", code: "Digit1", alt: true }),
    preset2: Object.freeze({ label: "Alt + 2", code: "Digit2", alt: true }),
    preset3: Object.freeze({ label: "Alt + 3", code: "Digit3", alt: true }),
    preset4: Object.freeze({ label: "Alt + 4", code: "Digit4", alt: true }),
    preset5: Object.freeze({ label: "Alt + 5", code: "Digit5", alt: true }),
    preset10: Object.freeze({ label: "Alt + 0", code: "Digit0", alt: true })
  });

  const PRESET_ACTION_RATES = Object.freeze({
    preset1: 1,
    preset2: 2,
    preset3: 3,
    preset4: 4,
    preset5: 5,
    preset10: 10
  });

  globalThis.YSC_DEFAULT_SHORTCUTS = DEFAULT_SHORTCUTS;
  globalThis.YSC_PRESET_ACTION_RATES = PRESET_ACTION_RATES;
})();

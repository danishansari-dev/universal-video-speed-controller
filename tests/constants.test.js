"use strict";

// Load constants.js which attaches items to globalThis
require("../constants.js");

describe("constants.js unit tests", () => {
  test("YSC_FORMAT_RATE clamps and formats values correctly", () => {
    const format = globalThis.YSC_FORMAT_RATE;
    
    // Normal cases
    expect(format(1)).toBe("1x");
    expect(format(1.5)).toBe("1.5x");
    expect(format(2)).toBe("2x");
    expect(format(2.25)).toBe("2.25x");
    
    // Clamping to nearest step (0.25)
    expect(format(1.22)).toBe("1.25x");
    expect(format(1.37)).toBe("1.25x"); // 1.37 is closer to 1.25 than 1.50
    expect(format(1.38)).toBe("1.5x");  // 1.38 is closer to 1.50 than 1.25
    expect(format(1.12)).toBe("1x");
    
    // Min rate clamp (0.25)
    expect(format(0.1)).toBe("0.25x");
    expect(format(0.25)).toBe("0.25x");
    
    // Max rate clamp (10)
    expect(format(10)).toBe("10x");
    expect(format(11)).toBe("10x");
  });

  test("YSC_DEFAULT_SHORTCUTS has required actions", () => {
    const shortcuts = globalThis.YSC_DEFAULT_SHORTCUTS;
    expect(shortcuts).toBeDefined();
    expect(shortcuts.increase.code).toBe("BracketRight");
    expect(shortcuts.decrease.code).toBe("BracketLeft");
    expect(shortcuts.reset.code).toBe("Backslash");
    expect(shortcuts.boost.code).toBe("KeyX");
  });
});

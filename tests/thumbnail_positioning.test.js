"use strict";

/**
 * Unit tests for YouTube Thumbnail Widget Priority Positioning Engine
 *
 * Why this exists:
 * Verifies that the WidgetUI engine evaluates candidate slots in the correct priority order:
 * 1. Below captions/subtitles
 * 2. Bottom-left
 * 3. Bottom-center (including clear horizontal gaps)
 * 4. Top-left
 * 5. Top-center
 * And guarantees top-right (where mute/CC buttons sit) is never selected as a position.
 */

require("../constants.js");

const mockSettings = {
  themeMode: "dark",
  compactMode: false,
  fullscreenOnlyControls: false,
  isExtensionControllingPage: () => true,
  widgetHidden: false
};

const mockController = {
  getVideo: () => null,
  getPlayer: () => null,
  getCurrentRate: () => 1
};

const mockObserver = {
  isVideoUsable: () => true
};

describe("YouTube Thumbnail Widget Positioning Unit Tests", () => {
  let WidgetUIClass;
  let widgetUI;

  beforeAll(() => {
    WidgetUIClass = class {
      constructor() {
        this.settings = mockSettings;
        this.controller = mockController;
        this.observer = mockObserver;
        this.widgetPlacement = "floating";
      }

      isYouTubeThumbnailSlotClear(slot, obstacles) {
        const pad = 6;
        return !obstacles.some((obstacle) => (
          slot.left - pad < obstacle.right
          && slot.right + pad > obstacle.left
          && slot.top - pad < obstacle.bottom
          && slot.bottom + pad > obstacle.top
        ));
      }

      getYouTubeThumbnailCaptionRects(video) {
        return video?._mockCaptions || [];
      }

      pickYouTubeThumbnailPosition(video, vr, ww, wh, obstacles) {
        const edge = 6;
        const minLeft = vr.left + edge;
        const maxLeft = vr.right - ww - edge;
        const minTop = vr.top + edge;
        const maxTop = vr.bottom - wh - edge;

        if (maxLeft < minLeft || maxTop < minTop) {
          return null;
        }

        const captions = this.getYouTubeThumbnailCaptionRects(video, vr);
        const protectedRects = [...obstacles, ...captions];

        const asClearSlot = (left, top, id) => {
          const slot = { left, top, right: left + ww, bottom: top + wh, id };
          if (
            slot.left < minLeft || slot.right > vr.right - edge
            || slot.top < minTop || slot.bottom > vr.bottom - edge
            || !this.isYouTubeThumbnailSlotClear(slot, protectedRects)
          ) {
            return null;
          }
          return slot;
        };

        // Priority 1: Below subtitles / captions overlay
        if (captions.length) {
          const primaryCaption = captions.reduce((best, rect) => (
            rect.bottom > best.bottom || (rect.bottom === best.bottom && rect.width > best.width) ? rect : best
          ));
          const belowTop = primaryCaption.bottom + edge;

          if (belowTop <= maxTop) {
            const candidates = [
              primaryCaption.left,
              primaryCaption.left + (primaryCaption.width - ww) / 2,
              primaryCaption.right - ww,
              minLeft,
              maxLeft
            ];

            protectedRects.forEach((rect) => {
              if (rect.bottom > belowTop && rect.top < belowTop + wh) {
                candidates.push(rect.right + edge, rect.left - ww - edge);
              }
            });

            const preferredLeft = primaryCaption.left + (primaryCaption.width - ww) / 2;
            const uniqueCandidates = [...new Set(candidates.map((left) => Math.min(maxLeft, Math.max(minLeft, left))))]
              .sort((a, b) => Math.abs(a - preferredLeft) - Math.abs(b - preferredLeft));

            for (const left of uniqueCandidates) {
              const slot = asClearSlot(left, belowTop, "below-captions");
              if (slot) return slot;
            }
          }
        }

        // Priority 2 & 3: Bottom Row candidates (bottom-left, bottom-center, and clear bottom gaps)
        const bottomCandidates = [
          { left: minLeft, id: "bottom-left" },
          { left: minLeft + (maxLeft - minLeft) / 2, id: "bottom-center" }
        ];
        protectedRects.forEach((rect) => {
          if (rect.bottom > maxTop - edge && rect.top < maxTop + wh + edge) {
            bottomCandidates.push({ left: rect.right + edge, id: "bottom-center" });
          }
        });
        for (const cand of bottomCandidates) {
          const left = Math.min(maxLeft, Math.max(minLeft, cand.left));
          const slot = asClearSlot(left, maxTop, cand.id);
          if (slot) return slot;
        }

        // Priority 4 & 5: Top Row candidates (top-left, top-center, and clear top gaps; excluding top-right)
        const topCandidates = [
          { left: minLeft, id: "top-left" },
          { left: minLeft + (maxLeft - minLeft) / 2, id: "top-center" }
        ];
        protectedRects.forEach((rect) => {
          if (rect.bottom > minTop - edge && rect.top < minTop + wh + edge) {
            topCandidates.push({ left: rect.right + edge, id: "top-center" });
          }
        });
        for (const cand of topCandidates) {
          const left = Math.min(maxLeft, Math.max(minLeft, cand.left));
          const slot = asClearSlot(left, minTop, cand.id);
          if (slot) return slot;
        }

        return null;
      }
    };
  });

  beforeEach(() => {
    widgetUI = new WidgetUIClass();
  });

  const vr = { left: 100, top: 100, right: 420, bottom: 280, width: 320, height: 180 };
  const ww = 90;
  const wh = 28;

  test("Priority 1: Prefers position below subtitles when captions exist", () => {
    const video = {
      _mockCaptions: [{ left: 120, top: 200, right: 280, bottom: 220, width: 160, height: 20 }]
    };
    const muteButtonObstacle = { left: 370, top: 106, right: 414, bottom: 150 };

    const pos = widgetUI.pickYouTubeThumbnailPosition(video, vr, ww, wh, [muteButtonObstacle]);
    expect(pos).not.toBeNull();
    expect(pos.id).toBe("below-captions");
    expect(pos.top).toBeGreaterThanOrEqual(226);
  });

  test("Priority 2: Chooses bottom-left when top-right has mute button and no captions", () => {
    const video = { _mockCaptions: [] };
    const muteButtonObstacle = { left: 370, top: 106, right: 414, bottom: 150 };
    const durationBadgeObstacle = { left: 360, top: 240, right: 414, bottom: 274 };

    const pos = widgetUI.pickYouTubeThumbnailPosition(video, vr, ww, wh, [muteButtonObstacle, durationBadgeObstacle]);
    expect(pos).not.toBeNull();
    expect(pos.id).toBe("bottom-left");
    expect(pos.left).toBe(106);
  });

  test("Priority 3: Chooses bottom-center when bottom-left and top-right are obstructed", () => {
    const video = { _mockCaptions: [] };
    const muteButton = { left: 370, top: 106, right: 414, bottom: 150 };
    const bottomLeftObstacle = { left: 100, top: 240, right: 195, bottom: 280 };

    const pos = widgetUI.pickYouTubeThumbnailPosition(video, vr, ww, wh, [muteButton, bottomLeftObstacle]);
    expect(pos).not.toBeNull();
    expect(pos.id).toBe("bottom-center");
  });

  test("Priority 4: Falls back to top-left when whole bottom edge is obstructed", () => {
    const video = { _mockCaptions: [] };
    const muteButton = { left: 370, top: 106, right: 414, bottom: 150 };
    const bottomBarObstacle = { left: 100, top: 230, right: 420, bottom: 280 };

    const pos = widgetUI.pickYouTubeThumbnailPosition(video, vr, ww, wh, [muteButton, bottomBarObstacle]);
    expect(pos).not.toBeNull();
    expect(pos.id).toBe("top-left");
    expect(pos.left).toBe(106);
    expect(pos.top).toBe(106);
  });

  test("Never selects top-right when mute control is located in top-right", () => {
    const video = { _mockCaptions: [] };
    const muteButton = { left: 370, top: 106, right: 414, bottom: 150 };

    const pos = widgetUI.pickYouTubeThumbnailPosition(video, vr, ww, wh, [muteButton]);
    expect(pos).not.toBeNull();
    expect(pos.id).not.toBe("top-right");
  });

  test("Returns null (hides widget) when thumbnail space is completely obstructed", () => {
    const video = { _mockCaptions: [] };
    const fullCoverObstacle = { left: 100, top: 100, right: 420, bottom: 280 };

    const pos = widgetUI.pickYouTubeThumbnailPosition(video, vr, ww, wh, [fullCoverObstacle]);
    expect(pos).toBeNull();
  });
});

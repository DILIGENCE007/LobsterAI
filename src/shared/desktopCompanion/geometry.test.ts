import { describe, expect, test } from 'vitest';

import { DesktopCompanionPanelPlacement, DesktopCompanionSize } from './constants';
import {
  clampCompanionBounds,
  companionGaze,
  companionMenuOpensUp,
  companionStageOpensLeft,
  resolveCompanionBounds,
  resolveCompanionCardBounds,
  resolveCompanionComposerLayout,
  resolveCompanionStageBounds,
  resolveCompanionToolbarBounds,
  resolveCompanionToolbarMenuBounds,
} from './geometry';

const orb = DesktopCompanionSize.Orb;

describe('orb placement', () => {
  const workArea = { x: -1920, y: 25, width: 1920, height: 1055 };

  test('restores a visible position after the former display is disconnected', () => {
    const result = resolveCompanionBounds({ x: 2500, y: 2000 }, workArea);
    expect(result.x + result.width).toBeLessThanOrEqual(0);
    expect(result.y + result.height).toBeLessThanOrEqual(1080);
    expect(result.x).toBeGreaterThanOrEqual(-1920);
  });

  test('ignores malformed saved positions and starts in the lower right', () => {
    const result = resolveCompanionBounds({ x: 'left', y: Number.NaN }, workArea);
    expect(result).toEqual(resolveCompanionBounds(null, workArea));
    expect(result.x + result.width).toBeLessThan(0);
    expect(result.x + result.width).toBeGreaterThan(-60);
  });

  test('keeps a dropped orb whole on its own display, even at an edge shared with another one', () => {
    const area = { x: 0, y: 0, width: 1440, height: 900 };
    expect(clampCompanionBounds({ ...orb, x: 1440 - orb.width / 2, y: 300 }, area)).toEqual({ ...orb, x: 1440 - orb.width, y: 300 });
    expect(clampCompanionBounds({ ...orb, x: -20, y: -10 }, area)).toEqual({ ...orb, x: 0, y: 0 });
  });
});

describe('surfaces around the orb', () => {
  const area = { x: 0, y: 25, width: 1440, height: 875 };

  describe('composer', () => {
    const pad = DesktopCompanionSize.SurfacePad;
    const card = { width: DesktopCompanionSize.Composer.width + pad * 2, height: 230 + pad * 2 };
    const room = { above: DesktopCompanionSize.ComposerMenuRoom, side: DesktopCompanionSize.ComposerSideRoom };

    test('opens right beside the orb, with room above the card and toward the middle of the screen', () => {
      const low = { ...orb, x: 1356, y: 790 };
      const { bounds, placement } = resolveCompanionComposerLayout(low, card, room, area);
      expect(placement).toBe(DesktopCompanionPanelPlacement.Left);
      // The card (inside the transparent pad) ends at the orb's edge and its bottom meets the character's.
      expect(bounds.x + bounds.width - pad).toBe(low.x);
      expect(bounds.y + bounds.height - pad).toBe(low.y + low.height - pad / 2);
      expect(bounds.height).toBe(card.height + room.above);
      expect(bounds.width).toBe(card.width + room.side);
    });

    test('opens to the right of an orb on the left half, with the room on that side', () => {
      const left = { ...orb, x: 40, y: 700 };
      const { bounds, placement } = resolveCompanionComposerLayout(left, card, room, area);
      expect(placement).toBe(DesktopCompanionPanelPlacement.Right);
      expect(bounds.x + pad).toBe(left.x + left.width);
      expect(bounds.width).toBe(card.width + room.side);
    });

    test('keeps the card in place and trims the room near the screen edges', () => {
      const high = { ...orb, x: 1356, y: 120 };
      const near = resolveCompanionComposerLayout(high, card, room, area).bounds;
      expect(near.y).toBe(area.y);
      expect(near.y + near.height).toBe(resolveCompanionStageBounds(high, card, area).y + card.height);
      // A wide card next to an orb near the middle cannot take the whole side room.
      const narrowArea = { x: 0, y: 25, width: 900, height: 875 };
      const middle = resolveCompanionComposerLayout({ ...orb, x: 470, y: 700 }, card, room, narrowArea).bounds;
      expect(middle.x).toBe(narrowArea.x);
    });

    test('opens a little below the middle of the screen when no orb is on screen', () => {
      const { bounds, placement } = resolveCompanionComposerLayout(null, card, room, area);
      expect(placement).toBe(DesktopCompanionPanelPlacement.Center);
      expect(bounds.x + card.width / 2).toBe(area.x + area.width / 2);
      const cardBottom = bounds.y + bounds.height;
      expect(cardBottom).toBeGreaterThan(area.y + area.height / 2 + card.height / 2);
      expect(cardBottom).toBeLessThan(area.y + area.height);
      expect(bounds.width).toBe(card.width + room.side);
    });
  });

  test('opens the stage toward the middle of the screen, bottom-aligned with the orb', () => {
    const size = { width: 300, height: 140 };
    const right = { ...orb, x: 1364, y: 700 };
    expect(companionStageOpensLeft(right, area)).toBe(true);
    const stage = resolveCompanionStageBounds(right, size, area);
    expect(stage.x + stage.width).toBeLessThanOrEqual(right.x + DesktopCompanionSize.SurfacePad);
    expect(stage.y + stage.height).toBeGreaterThan(right.y + right.height - DesktopCompanionSize.SurfacePad);
    const left = { ...orb, x: 0, y: 700 };
    expect(companionStageOpensLeft(left, area)).toBe(false);
    expect(resolveCompanionStageBounds(left, size, area).x).toBeGreaterThanOrEqual(left.x + left.width - DesktopCompanionSize.SurfacePad);
  });

  test('keeps a stage on screen when the orb sits in a corner', () => {
    const stage = resolveCompanionStageBounds({ ...orb, x: 1364, y: 30 }, { width: 448, height: 214 }, area);
    expect(stage).toEqual(clampCompanionBounds(stage, area));
    expect(stage.y).toBeGreaterThanOrEqual(area.y);
  });
});

describe('selection toolbar placement', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  const size = { width: 400, height: 80 };
  const pad = DesktopCompanionSize.SurfacePad;
  const word = { left: 300, right: 380, top: 200, bottom: 220, multiline: false };
  const paragraph = { left: 520, right: 260, top: 200, bottom: 300, multiline: true };

  test('sits just above the selection, centered on a one-line selection', () => {
    const { bounds, above } = resolveCompanionToolbarBounds(word, size, area);
    expect(above).toBe(true);
    expect(bounds.y + bounds.height - pad).toBeLessThanOrEqual(200);
    expect(bounds.y + bounds.height - pad).toBeGreaterThan(188);
    expect(bounds.x + bounds.width / 2).toBe(340);
  });

  test('lines up with where a longer selection starts, above its first line', () => {
    const { bounds } = resolveCompanionToolbarBounds(paragraph, size, area);
    expect(bounds.y + bounds.height - pad).toBeLessThanOrEqual(200);
    // The first button sits over the first selected character.
    expect(bounds.x + pad).toBeGreaterThan(500);
    expect(bounds.x + pad).toBeLessThan(520);
  });

  test('drops below the selection only when there is no room above', () => {
    const { bounds, above } = resolveCompanionToolbarBounds({ ...word, top: 30, bottom: 50 }, size, area);
    expect(above).toBe(false);
    expect(bounds.y + pad).toBeGreaterThanOrEqual(50);
  });

  test('never runs off the right edge', () => {
    const { bounds } = resolveCompanionToolbarBounds({ ...word, left: 1400, right: 1430 }, size, area);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
  });

  const full = DesktopCompanionSize.Answer;

  test('cards open under the selection and keep it readable', () => {
    const card = resolveCompanionCardBounds(paragraph, { width: 444, height: 484 }, area);
    expect(card.y + pad).toBeGreaterThanOrEqual(300);
    expect(card.height).toBe(484);
  });

  test('near the bottom a card opens above the selection and grows upward', () => {
    const above = resolveCompanionCardBounds({ ...word, top: 760, bottom: 780 }, { width: 444, height: 300 }, area);
    expect(above.y + above.height - pad).toBeLessThanOrEqual(760);
    const taller = resolveCompanionCardBounds({ ...word, top: 760, bottom: 780 }, { width: 444, height: 500 }, area);
    expect(taller.y + taller.height).toBe(above.y + above.height);
  });

  test('stays under the selection whenever the full card fits there, even with more room above', () => {
    const portrait = { x: 0, y: 0, width: 1080, height: 1440 };
    const card = resolveCompanionCardBounds({ ...word, top: 760, bottom: 780 }, full, portrait);
    expect(card.y + pad).toBeGreaterThanOrEqual(780);
    expect(card.height).toBe(full.height);
  });

  test('opens on the side with more room when the full card fits on neither', () => {
    // 376px below the selection, 536px above it.
    const card = resolveCompanionCardBounds({ ...word, top: 520, bottom: 540 }, { width: 444, height: 300 }, area);
    expect(card.y + card.height - pad).toBeLessThanOrEqual(520);
  });

  test('a card that outgrows its side slides over the selection instead of scrolling, staying on screen', () => {
    // 516px below the selection, 396px above it.
    const middle = { ...word, top: 380, bottom: 400 };
    const short = resolveCompanionCardBounds(middle, { width: 444, height: 300 }, area);
    expect(short.y + pad).toBeGreaterThanOrEqual(400);
    const long = resolveCompanionCardBounds(middle, { width: 444, height: 900 }, area);
    expect(long.height).toBe(full.height);
    expect(long.y + long.height).toBe(900);
    expect(long.y + pad).toBeLessThan(380);
    // Above the selection, the card meets the top edge and then reaches down over it.
    const high = resolveCompanionCardBounds({ ...word, top: 500, bottom: 520 }, { width: 444, height: 900 }, area);
    expect(high).toMatchObject({ y: 0, height: full.height });
  });

  test('a selection taller than the screen gets a full card over it', () => {
    const tall = { left: 300, right: 200, top: 120, bottom: 820, multiline: true };
    const card = resolveCompanionCardBounds(tall, full, area);
    expect(card).toEqual(clampCompanionBounds(card, area));
    expect(card.height).toBe(full.height);
  });

  test('on a screen shorter than the full card, the card is as tall as the screen', () => {
    const short = { x: 0, y: 25, width: 1280, height: 560 };
    const card = resolveCompanionCardBounds({ ...word, top: 300, bottom: 320 }, full, short);
    expect(card).toMatchObject({ y: 25, height: 560 });
  });

  test('opens the menu away from the selection, unless only the other side has room', () => {
    const below = { x: 300, y: 204, width: 400, height: 80 };
    expect(companionMenuOpensUp(below, 200, area, false)).toBe(false);
    expect(companionMenuOpensUp({ ...below, y: 760 }, 200, area, false)).toBe(true);
    const above = { x: 300, y: 600, width: 400, height: 80 };
    expect(companionMenuOpensUp(above, 200, area, true)).toBe(true);
    expect(companionMenuOpensUp({ ...above, y: 100 }, 200, area, true)).toBe(false);
  });

  test('grows the window for the menu while the toolbar stays where it was', () => {
    const toolbar = { x: 300, y: 600, width: 400, height: 80 };
    expect(resolveCompanionToolbarMenuBounds(toolbar, { width: 400, height: 260 }, false, area))
      .toEqual({ x: 300, y: 600, width: 400, height: 260 });
    const up = resolveCompanionToolbarMenuBounds(toolbar, { width: 400, height: 260 }, true, area);
    expect(up.y + up.height).toBe(toolbar.y + toolbar.height);
  });
});

describe('gaze', () => {
  const center = { ...orb, x: 500, y: 500 };
  const middle = { x: 500 + orb.width / 2, y: 500 + orb.height / 2 };

  test('looks straight ahead when the cursor is on the character', () => {
    expect(companionGaze(center, { x: middle.x + 2, y: middle.y - 3 })).toEqual({ x: 0, y: 0 });
  });

  test('turns toward the cursor and saturates far away', () => {
    expect(companionGaze(center, { x: 2000, y: middle.y - 4 })).toEqual({ x: 1, y: 0 });
    const near = companionGaze(center, { x: middle.x + 60, y: middle.y });
    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThan(1);
  });

  test('quantizes so tiny moves do not flood IPC', () => {
    const a = companionGaze(center, { x: 900, y: 700 });
    const b = companionGaze(center, { x: 903, y: 702 });
    expect(a).toEqual(b);
  });
});

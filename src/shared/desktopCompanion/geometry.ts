import { DesktopCompanionPanelPlacement, DesktopCompanionSize } from './constants';

export interface CompanionPoint { x: number; y: number }
export interface CompanionSize { width: number; height: number }
export interface CompanionRect extends CompanionPoint, CompanionSize {}

/** Where the selected text sits on screen: from the top-left of its first line to the bottom-right of its last. */
export interface CompanionSelectionAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Spans lines: the toolbar lines up with where it starts instead of centering on it. */
  multiline: boolean;
}

export function clampCompanionBounds(bounds: CompanionRect, workArea: CompanionRect): CompanionRect {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    x: Math.round(Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width))),
    y: Math.round(Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function isPoint(value: unknown): value is CompanionPoint {
  const point = value as Partial<CompanionPoint> | null;
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Restores the orb at its saved spot, or the lower-right corner of the work area. */
export function resolveCompanionBounds(position: unknown, workArea: CompanionRect): CompanionRect {
  const size = DesktopCompanionSize.Orb;
  return clampCompanionBounds({
    ...size,
    x: isPoint(position) ? position.x : workArea.x + workArea.width - size.width - DesktopCompanionSize.Margin,
    y: isPoint(position) ? position.y : workArea.y + workArea.height - size.height - DesktopCompanionSize.Margin * 4,
  }, workArea);
}

/** Stages open toward the middle of the screen. */
export function companionStageOpensLeft(orb: CompanionRect, workArea: CompanionRect): boolean {
  return orb.x + orb.width / 2 >= workArea.x + workArea.width / 2;
}

/**
 * Places a bubble, the drop zone or the quick panel right beside the orb, on
 * the side with more room, bottom-aligned so it reads as coming out of the
 * character.
 */
export function resolveCompanionStageBounds(orb: CompanionRect, size: CompanionSize, workArea: CompanionRect): CompanionRect {
  const x = companionStageOpensLeft(orb, workArea) ? orb.x - size.width + DesktopCompanionSize.SurfacePad : orb.x + orb.width - DesktopCompanionSize.SurfacePad;
  const y = orb.y + orb.height - size.height + DesktopCompanionSize.SurfacePad / 2;
  return clampCompanionBounds({ ...size, x, y }, workArea);
}

/** Without an orb on screen, the quick panel's card ends this far down the screen, a little below the middle. */
const CENTERED_PANEL_BOTTOM = 0.78;

export interface CompanionComposerRoom { above: number; side: number }
export interface CompanionComposerLayout { bounds: CompanionRect; placement: DesktopCompanionPanelPlacement }

/**
 * The composer window. Its card sits beside the orb like the stage cards, or a
 * little below the middle of the screen when no orb is on screen. The window
 * reaches upward and toward the middle of the screen by as much of `room` as
 * the screen allows, so the composer's menus and submenus open beside the card
 * without moving it.
 */
export function resolveCompanionComposerLayout(
  orb: CompanionRect | null,
  card: CompanionSize,
  room: CompanionComposerRoom,
  workArea: CompanionRect,
): CompanionComposerLayout {
  const placement = !orb ? DesktopCompanionPanelPlacement.Center
    : companionStageOpensLeft(orb, workArea) ? DesktopCompanionPanelPlacement.Left : DesktopCompanionPanelPlacement.Right;
  const cardBounds = orb
    ? resolveCompanionStageBounds(orb, card, workArea)
    : clampCompanionBounds({
      ...card,
      x: workArea.x + (workArea.width - card.width) / 2,
      y: workArea.y + workArea.height * CENTERED_PANEL_BOTTOM - card.height,
    }, workArea);
  const opensLeft = placement === DesktopCompanionPanelPlacement.Left;
  const above = Math.max(0, Math.min(room.above, cardBounds.y - workArea.y));
  const side = Math.max(0, Math.min(room.side, opensLeft
    ? cardBounds.x - workArea.x
    : workArea.x + workArea.width - cardBounds.x - cardBounds.width));
  return {
    placement,
    bounds: {
      x: opensLeft ? cardBounds.x - side : cardBounds.x,
      y: cardBounds.y - above,
      width: cardBounds.width + side,
      height: cardBounds.height + above,
    },
  };
}

/** Text known only by a point, such as the pointer when the orb restores a card: one line around it. */
export function companionPointerAnchor(point: CompanionPoint): CompanionSelectionAnchor {
  return { left: point.x, right: point.x, top: point.y - 18, bottom: point.y + 14, multiline: false };
}

/** How far the toolbar's first button and the card's text sit inside the visible edge. */
const SELECTION_INSET = 12;
/** Below this much room a card opens above the selection, unless there is even less room up there. */
const CARD_COMFORT_HEIGHT = 340;
/** A card needs this much to show its title, a few lines and the input; with less on both sides it overlaps the selection. */
const CARD_MIN_HEIGHT = 240;

/** Toolbar and cards share a column: centered on a one-line selection, starting where a longer one starts. */
function selectionColumnX(anchor: CompanionSelectionAnchor, width: number): number {
  return anchor.multiline
    ? anchor.left - SELECTION_INSET - DesktopCompanionSize.SurfacePad
    : (anchor.left + anchor.right - width) / 2;
}

export interface CompanionToolbarPlacement {
  bounds: CompanionRect;
  /** The toolbar sits above the selection (the usual place). */
  above: boolean;
}

/**
 * The toolbar sits just above the selection, so it never covers the text that
 * follows; it drops below the selection only when there is no room above.
 */
export function resolveCompanionToolbarBounds(
  anchor: CompanionSelectionAnchor,
  size: CompanionSize,
  workArea: CompanionRect,
): CompanionToolbarPlacement {
  const pad = DesktopCompanionSize.SurfacePad;
  const gap = DesktopCompanionSize.Gap;
  const aboveY = anchor.top - gap - size.height + pad;
  const belowY = anchor.bottom + gap - pad;
  const above = aboveY >= workArea.y || belowY + size.height > workArea.y + workArea.height;
  return {
    above,
    bounds: clampCompanionBounds({ ...size, x: selectionColumnX(anchor, size.width), y: above ? aboveY : belowY }, workArea),
  };
}

export interface CompanionCardSlot {
  /** Under the selection (the usual place), or above it. */
  below: boolean;
  /** The selection is taller than the screen: the card sits at the bottom, over its last lines. */
  overlap: boolean;
  /** The window height that fits there; the card scrolls inside rather than grow past it. */
  room: number;
}

/**
 * Answer, translate and read-aloud cards open under the selection so the
 * selected text stays readable, and grow downward; with little room below
 * they open above it.
 */
export function companionCardSlot(anchor: CompanionSelectionAnchor, workArea: CompanionRect): CompanionCardSlot {
  const pad = DesktopCompanionSize.SurfacePad;
  const gap = DesktopCompanionSize.Gap;
  const roomBelow = workArea.y + workArea.height - (anchor.bottom + gap - pad);
  const roomAbove = anchor.top - gap + pad - workArea.y;
  if (Math.max(roomBelow, roomAbove) < CARD_MIN_HEIGHT) return { below: true, overlap: true, room: workArea.height };
  const below = roomBelow >= CARD_COMFORT_HEIGHT || roomBelow >= roomAbove;
  return { below, overlap: false, room: below ? roomBelow : roomAbove };
}

export function resolveCompanionCardBounds(
  anchor: CompanionSelectionAnchor,
  size: CompanionSize,
  workArea: CompanionRect,
): CompanionRect {
  const pad = DesktopCompanionSize.SurfacePad;
  const gap = DesktopCompanionSize.Gap;
  const slot = companionCardSlot(anchor, workArea);
  const height = Math.min(size.height, slot.room);
  const y = slot.overlap ? workArea.y + workArea.height - height
    : slot.below ? anchor.bottom + gap - pad : anchor.top - gap - height + pad;
  return clampCompanionBounds({ width: size.width, height, x: selectionColumnX(anchor, size.width), y }, workArea);
}

/**
 * The toolbar's menu opens away from the selection when it can: above a
 * toolbar that sits over the selection, below one under it.
 */
export function companionMenuOpensUp(
  toolbar: CompanionRect,
  menuHeight: number,
  workArea: CompanionRect,
  toolbarAboveSelection: boolean,
): boolean {
  const fitsBelow = toolbar.y + toolbar.height + menuHeight <= workArea.y + workArea.height;
  const fitsAbove = toolbar.y - menuHeight >= workArea.y;
  return toolbarAboveSelection ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
}

/** Grows the toolbar window to hold its menu without moving the toolbar itself. */
export function resolveCompanionToolbarMenuBounds(
  toolbar: CompanionRect,
  size: CompanionSize,
  menuUp: boolean,
  workArea: CompanionRect,
): CompanionRect {
  return clampCompanionBounds({
    ...size,
    x: toolbar.x,
    y: menuUp ? toolbar.y + toolbar.height - size.height : toolbar.y,
  }, workArea);
}

export function rectContains(rect: CompanionRect, point: CompanionPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Eye direction toward the cursor, in [-1, 1] on each axis, quantized to avoid chatty updates. */
export function companionGaze(orb: CompanionRect, cursor: CompanionPoint): CompanionPoint {
  const cx = orb.x + orb.width / 2;
  const cy = orb.y + orb.height / 2;
  const dx = cursor.x - cx;
  const dy = cursor.y - cy;
  const distance = Math.hypot(dx, dy);
  if (distance < 8) return { x: 0, y: 0 };
  // Eyes reach their limit at ~240px; beyond that they keep the direction.
  const strength = Math.min(1, distance / 240);
  // `|| 0` folds -0 into 0 so equal gazes compare and serialize equal.
  const quantize = (value: number) => Math.round(value * 4) / 4 || 0;
  return { x: quantize((dx / distance) * strength), y: quantize((dy / distance) * strength) };
}

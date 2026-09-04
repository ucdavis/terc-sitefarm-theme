/**
 * Keep a marker tooltip inside its map frame (TERC-63).
 *
 * Leaflet draws tooltips inside the map container, which clips them, and
 * its `direction: 'auto'` only picks the side of the marker facing the
 * map centre — on the tall, narrow Real-Time map a wide tooltip on a
 * badge near the frame edge lost half its text. These pure helpers pick
 * the side with more room, cap the tooltip's width to that room so it
 * wraps instead of clipping, and nudge it vertically clear of the top and
 * bottom edges. The Leaflet adapter applies the result; this module has
 * no library dependency so the geometry is unit-tested.
 *
 * All numbers are container pixels; (x, y) is the marker's position in
 * the frame and (width, height) the frame's size.
 */

export type TooltipSide = 'left' | 'right'

export interface SideFit {
  side: TooltipSide
  /** Width cap in px when the natural width would not fit, else null. */
  maxWidth: number | null
}

/** Gap between the marker point and the tooltip's near edge. */
export const TOOLTIP_GAP = 14
/** Breathing room kept between the tooltip and the frame edge. */
export const TOOLTIP_MARGIN = 8
/** Never squeeze a tooltip narrower than this; a few words per line. */
export const TOOLTIP_MIN_WIDTH = 120

export function fitTooltipSide(
  x: number,
  frameWidth: number,
  tipWidth: number,
  gap = TOOLTIP_GAP,
  margin = TOOLTIP_MARGIN,
  minWidth = TOOLTIP_MIN_WIDTH,
): SideFit {
  // The side facing the frame centre (Leaflet's own rule) is always the
  // roomier one; what Leaflet lacks is the width cap that follows.
  const side: TooltipSide = x < frameWidth / 2 ? 'right' : 'left'
  const available = (side === 'right' ? frameWidth - x : x) - gap - margin
  return { side, maxWidth: tipWidth <= available ? null : Math.max(minWidth, Math.floor(available)) }
}

/**
 * Vertical nudge (px, positive = down) so a tooltip centred on `y` with
 * height `tipHeight` stays `margin` inside a frame of `frameHeight`. A
 * tooltip taller than the frame is pinned to the top edge.
 */
export function fitTooltipVertical(y: number, frameHeight: number, tipHeight: number, margin = TOOLTIP_MARGIN): number {
  const top = y - tipHeight / 2
  const bottom = y + tipHeight / 2
  if (top < margin) return margin - top
  if (bottom > frameHeight - margin) return frameHeight - margin - bottom
  return 0
}

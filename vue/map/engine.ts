/**
 * Map engine abstraction (TERC-17).
 *
 * The lake map's acceptance criteria require the map and marker logic to be
 * isolated so Leaflet is swappable. This interface is that seam: LakeMap.vue
 * and everything above it speak only these types — plain numbers, strings,
 * and callbacks, no Leaflet imports — and the sole file that knows Leaflet
 * exists is leafletEngine.ts. Tests inject a fake engine through the same
 * factory prop.
 */

export type LatLng = [number, number]

/**
 * Escape text for interpolation into marker/tooltip HTML. Station and
 * destination names come from site content and from the live API's
 * Station_Name — never trust them as markup (PR review finding, TERC-17).
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

/** [southWest, northEast] corner pair. */
export type LatLngBounds = [LatLng, LatLng]

export interface EngineInitOpts {
  center: LatLng
  zoom: number
  tileUrl: string
  attribution: string
  maxZoom: number
  /**
   * false = a non-interactive stage (no zoom/drag/keyboard panning) — the
   * Forecasted Conditions shell's map is a data canvas, not a navigation
   * surface (TERC-22). Defaults to true.
   */
  interactive?: boolean
  /** Fit this box (overrides center/zoom) — e.g. the modeled-grid domain. */
  fitBounds?: LatLngBounds
}

/** An HTML badge pinned to a point (station value chips, offline "!"). */
export interface BadgeMarkerOpts {
  /**
   * Stable identity across redraws. Engines use it to give keyboard focus
   * back to the same badge after a group is cleared and redrawn — redraws
   * happen on every data refresh and must not strand a keyboard user.
   */
  id: string
  lat: number
  lng: number
  /** Badge markup; the engine anchors its center on the point. */
  html: string
  tooltipHtml: string
  /**
   * Accessible name for the badge — REQUIRED. Badges are keyboard-focusable
   * interactive controls (WCAG 2.1.1); the visual chip is just a number, so
   * this label is what assistive technology announces.
   */
  ariaLabel: string
  onClick?: () => void
}

/** A plain circle marker (destination dots). */
export interface CircleMarkerOpts {
  lat: number
  lng: number
  radius: number
  color: string
  weight: number
  fillColor: string
  fillOpacity: number
  /** Plain text — engines must render it inert, never as markup. */
  tooltip: string
  onClick?: () => void
}

export interface MapEngine {
  /** Remove every marker previously added to the named group. */
  clearGroup(group: string): void
  addBadgeMarker(group: string, opts: BadgeMarkerOpts): void
  addCircleMarker(group: string, opts: CircleMarkerOpts): void
  /** Animated move; used for destination/station focus and reset. */
  flyTo(center: LatLng, zoom: number): void
  /** Instant refit to a bounding box (window resizes, layout shifts). */
  fitBounds(bounds: LatLngBounds): void
  destroy(): void
}

export type MapEngineFactory = (el: HTMLElement, opts: EngineInitOpts) => MapEngine

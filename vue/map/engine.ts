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

export interface EngineInitOpts {
  center: LatLng
  zoom: number
  tileUrl: string
  attribution: string
  maxZoom: number
}

/** An HTML badge pinned to a point (station value chips, offline "!"). */
export interface BadgeMarkerOpts {
  lat: number
  lng: number
  /** Badge markup; the engine anchors its center on the point. */
  html: string
  tooltipHtml: string
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
  destroy(): void
}

export type MapEngineFactory = (el: HTMLElement, opts: EngineInitOpts) => MapEngine

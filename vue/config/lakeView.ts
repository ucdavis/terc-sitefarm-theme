/**
 * Whole-lake map view constants (TERC-17). Center/zoom framing Lake Tahoe
 * with a little shoreline context; every "show whole lake" reset uses these.
 *
 * The prototype's modeled-grid georeference (rotated 200 m domain, image
 * registration against the OSM lake polygon) belongs to the Phase 2 overlay
 * work and arrives with those tickets — this file stays plain view framing.
 */
import type { LatLng } from '../map/engine'

export const LAKE_CENTER: LatLng = [39.09, -120.04]
export const LAKE_DEFAULT_ZOOM = 10

/** Zoom used when flying to a single focused station badge. */
export const STATION_FOCUS_ZOOM = 12

export const TILE_LAYERS = {
  /** Standard OSM — roads, parks, town names; good trip-planning context. */
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  /** CARTO Positron light-gray, for Phase 2 data-overlay views where the
   *  lake itself is the visual subject. */
  muted: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
} as const

export type BasemapId = keyof typeof TILE_LAYERS

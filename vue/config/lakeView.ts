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
    maxZoom: 19,
  },
  /** Light-gray canvas for Phase 2 data-overlay views where the lake itself
   *  is the visual subject. Esri World Light Gray Base — the prototype's
   *  CARTO Positron now requires an API key (verified live 2026-09-01:
   *  tiles render an "API KEY REQUIRED" watermark), so it is unusable.
   *  The Esri service is keyless with attribution; it tops out at z16,
   *  plenty for a whole-lake stage. */
  muted: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16,
  },
} as const

export type BasemapId = keyof typeof TILE_LAYERS

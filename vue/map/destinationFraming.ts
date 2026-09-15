/**
 * Framing a destination so its stations are all on screen (TERC-74).
 *
 * Destinations used to fly to a hand-picked zoom level per place, which put
 * the map at a fixed scale regardless of how far apart that destination's
 * stations actually are — some destinations landed well inside their own
 * station spread, so a visitor picking a place saw a close-up of water with
 * the badges they came for sitting outside the viewport.
 *
 * The box below is derived from the stations the destination actually owns,
 * so the framing follows the data (and follows site content when the
 * registry supplies a different station assignment).
 *
 * No Leaflet here — this is pure geometry, per the library-seam rule; the
 * engine adapter turns the box into a view.
 */
import type { DestinationDef } from '../config/destinations'
import type { LatLngBounds } from './engine'

/** Just enough of an overview marker to place it. */
export interface PlacedMarker {
  key: string
  lat: number
  lng: number
}

/**
 * Breathing room added beyond the outermost station, in degrees, so badges
 * are not clipped by the viewport edge they sit on.
 */
export const FRAME_PAD_DEG = 0.01

/**
 * Smallest box we will frame, in degrees of latitude (~4.4 km). This is the
 * zoom cap: without it a destination with a single station would zoom to
 * street level on a lake map, which is the "far too zoomed in" complaint.
 */
export const FRAME_MIN_SPAN_DEG = 0.04

/** Marker keys (`kind:sourceId`) belonging to a destination. */
export function destinationMarkerKeys(d: DestinationDef): string[] {
  const keys = d.stationIds.map((id) => `nearshore:${id}`)
  for (const id of d.buoyIds ?? []) keys.push(`buoy:${id}`)
  // tc-homewood has no id of its own; the registry stores it as -1.
  if (d.includesHomewood) keys.push('homewood:-1')
  return keys
}

/**
 * Box containing the destination itself and every station assigned to it.
 *
 * The destination's own coordinate is always included, so a place whose
 * stations have not been placed yet still frames the place rather than
 * nothing. Returns a box in every case — there is always at least that one
 * point — which the caller fits instead of flying to a fixed zoom.
 */
export function destinationBounds(d: DestinationDef, markers: PlacedMarker[] = []): LatLngBounds {
  const wanted = new Set(destinationMarkerKeys(d))
  const lats = [d.lat]
  const lngs = [d.lng]
  for (const m of markers) {
    if (!wanted.has(m.key)) continue
    lats.push(m.lat)
    lngs.push(m.lng)
  }

  let south = Math.min(...lats) - FRAME_PAD_DEG
  let north = Math.max(...lats) + FRAME_PAD_DEG
  let west = Math.min(...lngs) - FRAME_PAD_DEG
  let east = Math.max(...lngs) + FRAME_PAD_DEG

  // Grow a too-small box around its own centre rather than shifting it, so
  // the destination stays where the visitor expects it.
  if (north - south < FRAME_MIN_SPAN_DEG) {
    const mid = (north + south) / 2
    south = mid - FRAME_MIN_SPAN_DEG / 2
    north = mid + FRAME_MIN_SPAN_DEG / 2
  }
  if (east - west < FRAME_MIN_SPAN_DEG) {
    const mid = (east + west) / 2
    west = mid - FRAME_MIN_SPAN_DEG / 2
    east = mid + FRAME_MIN_SPAN_DEG / 2
  }

  return [
    [south, west],
    [north, east],
  ]
}

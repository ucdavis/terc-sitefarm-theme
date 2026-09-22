/**
 * The wireframe destinations and which stations belong to each.
 *
 * Membership was recomputed in TERC-79 from the corrected station
 * coordinates: each nearshore station joins the point destination it is
 * actually nearest. Two of the old groupings were artefacts of wrong
 * coordinates rather than product decisions —
 *   - 'glenbrook' held station 12 (Cedar Point), whose placeholder sat on
 *     the east shore. Cedar Point is really on the WEST shore; the station
 *     that belongs here is 3, which is 0.1 km from this destination.
 *   - 'tahoe-keys' held station 3 (Glenbrook), 30 km away on the east shore.
 *
 * ⚠ STILL A PRODUCT DECISION FOR TERC: the wireframe destinations do not
 * map 1:1 to station names, so "nearest" is a rule, not a fact. Dollar
 * Point (10.2 km) and Tahoe Vista (7.4 km) are the nearest stations to
 * Incline Village but are not in it; Tahoe City (9.3 km) and Cedar Point
 * (7.2 km) group under Homewood for the same reason. This mapping is
 * deliberately config, not code: change it here.
 */

export interface DestinationDef {
  id: string
  name: string
  lat: number
  lng: number
  /**
   * The destination's curated zoom. On screen it acts as the framing
   * CEILING (see `maxZoom`), not a view zoom: it seeds the engine's initial
   * setView, which the station fit then replaces on every load (TERC-74).
   * In the static tier it becomes `maxZoom`; from content it is
   * field_location_zoom, or DEFAULT_DESTINATION_ZOOM when that is empty.
   */
  zoom: number
  /**
   * Ceiling for framing (TERC-89). The map fits a destination to its own
   * stations (TERC-74); this stops that fit zooming in any tighter — a lone
   * station would otherwise open at street level. Set only when a zoom was
   * actually given (content's field_location_zoom, or this file's `zoom` in
   * the static tier); absent means "fit, uncapped", today's behaviour.
   */
  maxZoom?: number
  /** ns-station-range ids assigned to this destination. */
  stationIds: number[]
  /** nasa-tb buoy ids inside this destination's area. */
  buoyIds?: number[]
  /** Whether tc-homewood applies (it has no id param). */
  includesHomewood?: boolean
  /**
   * Editor-written description of the place (TERC-9): the node's `body`,
   * as Drupal's text format already rendered it (`processed`, so filtered
   * HTML). Only site content carries this — the static fallback never does.
   */
  description?: string
}

export const DESTINATIONS: DestinationDef[] = [
  {
    id: 'incline-village',
    name: 'Incline Village',
    lat: 39.23000,
    lng: -119.98000,
    zoom: 12,
    // Nearest stations by the corrected coordinates: Sand Harbor (5.3 km,
    // east shore, dormant), Tahoe Vista (7.4 km), Dollar Point (10.2 km).
    stationIds: [2, 7, 8],
  },
  {
    id: 'tahoe-keys',
    name: 'Tahoe Keys',
    lat: 38.93500,
    lng: -119.99000,
    zoom: 13,
    // Timber Cove (2.5 km) and Camp Richardson (4.3 km) are the two south
    // shore stations. Station 3 used to sit here — it is Glenbrook, on the
    // east shore, 30 km away (TERC-79).
    stationIds: [10, 11],
  },
  {
    id: 'homewood',
    name: 'Homewood',
    lat: 39.08600,
    lng: -120.16000,
    zoom: 13,
    // id 4 = Homewood (1.6 km, live). Cedar Point (7.2 km) and Tahoe City
    // (9.3 km) are west/north-west shore stations with no nearer
    // destination — see the file header.
    stationIds: [4, 9, 12],
    includesHomewood: true,
  },
  {
    id: 'glenbrook',
    name: 'Glenbrook',
    lat: 39.08800,
    lng: -119.94000,
    zoom: 13,
    // Station 3 IS Glenbrook — 0.1 km from this destination. It had been
    // filed under Tahoe Keys while its coordinate was wrong (TERC-79).
    stationIds: [3],
  },
  {
    id: 'rubicon-bay',
    name: 'Rubicon Bay',
    lat: 39.00000,
    lng: -120.10800,
    zoom: 13,
    // id 6 = Rubicon (1.2 km, live). Meeks (4.3 km) and Cascade (6.7 km,
    // which is on Cascade Lake, not Tahoe) are both never-observed ids.
    stationIds: [1, 5, 6],
  },
  // ---- Half-lake destinations: the lake split at ~39.09° N (its E–W ----
  // ---- midline). Membership is by station coordinate, recomputed in  ----
  // ---- TERC-79 from the corrected positions. Glenbrook (39.08830)    ----
  // ---- falls 0.2 km south of the line, so it groups with the south.  ----
  {
    id: 'north-lake-tahoe',
    name: 'North Lake Tahoe',
    lat: 39.18500,
    lng: -120.02000,
    zoom: 11.25,
    stationIds: [2, 4, 7, 8, 9, 12],
    // All four NASA buoys sit at or north of the midline (39.11–39.16).
    buoyIds: [1, 2, 3, 4],
  },
  {
    id: 'south-lake-tahoe',
    name: 'South Lake Tahoe',
    lat: 38.99000,
    lng: -120.04000,
    zoom: 11.25,
    stationIds: [1, 3, 5, 6, 10, 11],
    includesHomewood: true,
  },
]

export function destinationById(id: string): DestinationDef | undefined {
  return DESTINATIONS.find((d) => d.id === id)
}

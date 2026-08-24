/**
 * The five wireframe destinations and which stations belong to each.
 *
 * ⚠ PRODUCT DECISION NEEDED — flagged for TERC input:
 * The wireframe destinations do not map 1:1 to station names. Live sweep
 * (2026-07-29) found four reporting stations: Dollar Point (2), Homewood (4),
 * Rubicon (6), Tahoe Vista (8). Homewood and Rubicon fall inside wireframe
 * destinations; Dollar Point and Tahoe Vista are NORTH-shore stations with no
 * corresponding destination, so they are assigned to Incline Village (the
 * nearest wireframe destination) purely so it has live data. All other
 * assignments are placeholder guesses. This mapping is deliberately config,
 * not code: change it here.
 */

export interface DestinationDef {
  id: string
  name: string
  lat: number
  lng: number
  /** Zoom level used when the map flies to this destination. */
  zoom: number
  /** ns-station-range ids assigned to this destination. */
  stationIds: number[]
  /** nasa-tb buoy ids inside this destination's area. */
  buoyIds?: number[]
  /** Whether tc-homewood applies (it has no id param). */
  includesHomewood?: boolean
}

export const DESTINATIONS: DestinationDef[] = [
  {
    id: 'incline-village',
    name: 'Incline Village',
    lat: 39.23,
    lng: -119.98,
    zoom: 12,
    // ASSUMPTION: Dollar Point + Tahoe Vista are north-shore stations mapped
    // here so at least one destination demonstrably shows live data.
    stationIds: [2, 8, 11],
  },
  {
    id: 'tahoe-keys',
    name: 'Tahoe Keys',
    lat: 38.935,
    lng: -119.99,
    zoom: 13,
    stationIds: [1, 3], // ASSUMPTION: placeholder assignment
  },
  {
    id: 'homewood',
    name: 'Homewood',
    lat: 39.086,
    lng: -120.16,
    zoom: 13,
    stationIds: [4, 5], // id 4 = Homewood (verified, live); 5 is a placeholder
    includesHomewood: true,
  },
  {
    id: 'glenbrook',
    name: 'Glenbrook',
    lat: 39.088,
    lng: -119.94,
    zoom: 13,
    stationIds: [7, 12], // ASSUMPTION: placeholder assignment
  },
  {
    id: 'rubicon-bay',
    name: 'Rubicon Bay',
    lat: 39.0,
    lng: -120.108,
    zoom: 13,
    stationIds: [6, 9], // id 6 = Rubicon (verified, live); 9 is a placeholder
  },
  // ---- Half-lake destinations: the lake split at ~39.09° N (its E–W ----
  // ---- midline). Membership is by station coordinate — which for the ----
  // ---- unverified ids means by their PLACEHOLDER coordinate.          ----
  {
    id: 'north-lake-tahoe',
    name: 'North Lake Tahoe',
    lat: 39.185,
    lng: -120.02,
    zoom: 11.25,
    stationIds: [2, 7, 8, 11, 12],
    // All four NASA buoys sit at or north of the midline (39.11–39.16).
    buoyIds: [1, 2, 3, 4],
  },
  {
    id: 'south-lake-tahoe',
    name: 'South Lake Tahoe',
    lat: 38.99,
    lng: -120.04,
    zoom: 11.25,
    stationIds: [1, 3, 4, 5, 6, 9, 10],
    includesHomewood: true,
  },
]

export function destinationById(id: string): DestinationDef | undefined {
  return DESTINATIONS.find((d) => d.id === id)
}

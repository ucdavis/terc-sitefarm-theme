/**
 * Near-shore station registry, seeded with ids 1–12 as instructed.
 *
 * Names verified by seasonal/historical sweep of ids 1–24 run 2026-08-27
 * (see docs/station-registry-discovery.md, TERC-46): EIGHT real stations —
 *   active now:  2 Dollar Point, 4 Homewood, 6 Rubicon, 8 Tahoe Vista,
 *                11 Timber Cove, 12 Cedar Point
 *   dormant:     7 Sand Harbor (dark since Q4 2024),
 *                9 Tahoe City (last seen Jan 2026)
 *   never seen:  1, 3, 5, 10 (empty in every window probed 2024–2026);
 *                ids 13+ are not in the API's id space.
 * tc-homewood (separate endpoint, no id) last reported Apr 2026 — it is a
 * real station, distinct from ns id 4 "Homewood".
 *
 * The API returns no coordinates, so ALL coordinates here are eyeballed
 * shoreline positions for the (now verified) names — `verified` means the
 * NAME came from the API's Station_Name, never the position. This file is
 * interim: the registry moves to the Lake Destinations / Lake Stations
 * content types via JSON:API (TERC-46) and needs TERC confirmation of
 * coordinates and the never-seen ids.
 */

export interface StationDef {
  id: number
  name: string
  lat: number
  lng: number
  verified: boolean
}

export const NEARSHORE_STATIONS: StationDef[] = [
  { id: 1, name: 'NS Station 1', lat: 38.94, lng: -119.995, verified: false },
  { id: 2, name: 'Dollar Point', lat: 39.187, lng: -120.0955, verified: true },
  { id: 3, name: 'NS Station 3', lat: 38.933, lng: -120.025, verified: false },
  { id: 4, name: 'Homewood', lat: 39.086, lng: -120.159, verified: true },
  { id: 5, name: 'NS Station 5', lat: 39.07, lng: -120.155, verified: false },
  { id: 6, name: 'Rubicon', lat: 39.001, lng: -120.106, verified: true },
  // Sand Harbor: NV east shore. Dark since Q4 2024.
  { id: 7, name: 'Sand Harbor', lat: 39.198, lng: -119.93, verified: true },
  { id: 8, name: 'Tahoe Vista', lat: 39.24, lng: -120.053, verified: true },
  // Tahoe City: NW shore. Last seen Jan 2026.
  { id: 9, name: 'Tahoe City', lat: 39.17, lng: -120.14, verified: true },
  { id: 10, name: 'NS Station 10', lat: 38.99, lng: -120.105, verified: false },
  // Timber Cove: South Lake Tahoe pier area. Actively reporting.
  { id: 11, name: 'Timber Cove', lat: 38.945, lng: -119.959, verified: true },
  // Cedar Point: actively reporting; physical location NOT yet confirmed —
  // coordinate below is the old placeholder, do not trust it on the map.
  { id: 12, name: 'Cedar Point', lat: 39.225, lng: -119.93, verified: true },
]

export function stationById(id: number): StationDef | undefined {
  return NEARSHORE_STATIONS.find((s) => s.id === id)
}

/** Met station (met-uscg2020) — USCG station, north-west shore near Tahoe City. */
export const MET_STATION = { id: 1, name: 'USCG 2020 Met Station', lat: 39.176, lng: -120.119 }

/**
 * NASA/JPL mid-lake buoys (nasa-tb, ids 1–4 = tb1–tb4). All four verified
 * reporting live (RBR water temp at 0.5 m + air temp + wind, 2026-07-30).
 *
 * ASSUMPTION: coordinates are approximate mid-lake positions from public
 * NASA/JPL Lake Tahoe validation-site descriptions (the API returns no
 * coordinates) — the four buoys form a rough rectangle in the NW-central
 * lake. Needs TERC/JPL confirmation.
 */
export interface BuoyDef {
  id: number
  name: string
  lat: number
  lng: number
}

export const NASA_BUOYS: BuoyDef[] = [
  { id: 1, name: 'NASA Buoy TB1', lat: 39.155, lng: -120.004 },
  { id: 2, name: 'NASA Buoy TB2', lat: 39.109, lng: -120.011 },
  { id: 3, name: 'NASA Buoy TB3', lat: 39.11, lng: -120.076 },
  { id: 4, name: 'NASA Buoy TB4', lat: 39.156, lng: -120.076 },
]

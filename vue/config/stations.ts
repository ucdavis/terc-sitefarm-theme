/**
 * Near-shore station registry, seeded with ids 1–12 as instructed.
 *
 * Verified against live traffic (week of 2026-07-22 → 2026-07-29, sweep of
 * all 12 ids run 2026-07-29 during this build):
 *   id 2 = Dollar Point  (576 records)  ✅ has data
 *   id 4 = Homewood      (576 records)  ✅ has data
 *   id 6 = Rubicon       (576 records)  ✅ has data
 *   id 8 = Tahoe Vista   (576 records)  ✅ has data
 *   ids 1, 3, 5, 7, 9, 10, 11, 12 -> empty arrays (normal, expected state)
 *   tc-homewood -> empty array (distinct from ns id 4!)
 *
 * ASSUMPTION: only ids 2, 4, 6, 8 have verified names (from Station_Name in
 * live responses). Their coordinates are the named locations' shoreline
 * positions, still eyeballed. The other ids' names and coordinates are
 * placeholders — the UI prefers the API's Station_Name when a station
 * reports. All of this needs TERC confirmation.
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
  { id: 7, name: 'NS Station 7', lat: 39.1, lng: -119.945, verified: false },
  { id: 8, name: 'Tahoe Vista', lat: 39.24, lng: -120.053, verified: true },
  { id: 9, name: 'NS Station 9', lat: 39.005, lng: -120.11, verified: false },
  { id: 10, name: 'NS Station 10', lat: 38.99, lng: -120.105, verified: false },
  { id: 11, name: 'NS Station 11', lat: 39.245, lng: -119.94, verified: false },
  { id: 12, name: 'NS Station 12', lat: 39.225, lng: -119.93, verified: false },
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

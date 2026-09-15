/**
 * Near-shore station registry, seeded with ids 1–12 as instructed.
 *
 * NAMES are the report API's own Station_Name values, read from
 * GET /report/ns-stations (TERC-79). That roster endpoint is the one place
 * the API states its own id→name mapping, and it corrected four of ours:
 * ids 1, 3, 5 and 10 were placeholders ("NS Station N") and are really
 * Cascade, Glenbrook, Meeks and Camp Richardson.
 *   active now:  2 Dollar Point, 4 Homewood, 6 Rubicon, 7 Sand Harbor,
 *                8 Tahoe Vista, 11 Timber Cove, 12 Cedar Point
 *   dormant:     9 Tahoe City (last seen Jan 2026)
 *   never seen:  1 Cascade, 3 Glenbrook, 5 Meeks, 10 Camp Richardson
 *                (empty in every window probed 2024–2026);
 *                ids 13+ are not in the API's id space.
 * tc-homewood (separate endpoint, no id) last reported Apr 2026 — it is a
 * real station, distinct from ns id 4 "Homewood".
 *
 * COORDINATES (TERC-79). The API returns none — every /report Lambda builds
 * a fixed field list and no coordinate is in it. Three sources were
 * reconciled instead:
 *   1. TERC's OWN production real-time app (the station list behind the
 *      iframe on tahoe.ucdavis.edu/real-time-conditions), keyed by these ids;
 *   2. an older legacy station table;
 *   3. OSM geocoding, for the three neither of those places in water.
 *
 * The two datasets disagree by up to 2.1 km, so they needed a tiebreaker.
 * The stations supply one themselves: every station that reports a depth
 * reports 1.4–2.0 m (Depth_m4C_Avg). These are sensors on private docks in
 * shallow water, so where the sources conflict the rule is "take the
 * in-water candidate closest to shore, reject any candidate on land". That
 * picks the legacy value for Dollar Point and Homewood — the app puts them
 * 542 m and 156 m out, which does not square with 2 m of water — and the
 * app's value everywhere else. Each row records which source won.
 *
 * Every pair is checked against OpenStreetMap's Lake Tahoe polygon and sits
 * in open water. Before TERC-79, 11 of 18 markers rendered on dry land.
 *
 * PRECISION IS UNIFORM AND DELIBERATE: five decimals, everywhere. At this
 * latitude one degree of longitude is 86.4 km, so a value rounded to two
 * decimals carries ±432 m of slop — enough on its own to beach a station
 * that sits 26 m off the shoreline. Mixed precision (2–4 decimals) was the
 * bug. Keep new coordinates at five decimals.
 *
 * `verified` still means "confirmed by TERC staff for this project" —
 * still none. The registry moves to the Lake Destinations / Lake Stations
 * content types via JSON:API (TERC-46); site content wins over this file.
 */

export interface StationDef {
  id: number
  name: string
  lat: number
  lng: number
  verified: boolean
}

export const NEARSHORE_STATIONS: StationDef[] = [
  // Cascade sits on CASCADE LAKE, not Lake Tahoe — TERC's nearshore page
  // describes the network as ten Tahoe stations plus one on Cascade Lake.
  // It is absent from TERC's production station list; position geocoded.
  { id: 1, name: 'Cascade', lat: 38.94058, lng: -120.09191, verified: false },
  // Legacy value, 83 m offshore. The production app says 39.1947,-120.089
  // — 542 m out, which does not square with the 2.0 m depth it reports.
  { id: 2, name: 'Dollar Point', lat: 39.18400, lng: -120.09300, verified: true },
  // Glenbrook: NV EAST shore. Was "NS Station 3" at 38.933,-120.025 —
  // 19 km away on the south-west shore.
  { id: 3, name: 'Glenbrook', lat: 39.08830, lng: -119.94100, verified: true },
  // Legacy value, 12 m offshore (2.0 m depth reported). The production app
  // says 39.1003,-120.161, 1.1 km north. Sits exactly on the 39.09 midline
  // the half-lake destinations split on — it counts as north.
  { id: 4, name: 'Homewood', lat: 39.09000, lng: -120.16100, verified: true },
  // Meeks: absent from TERC's production list; Meeks Bay, 72 m offshore,
  // geocoded. Best effort — needs TERC confirmation.
  { id: 5, name: 'Meeks', lat: 39.03762, lng: -120.12116, verified: false },
  { id: 6, name: 'Rubicon', lat: 39.01032, lng: -120.11319, verified: true },
  // Sand Harbor: NV east shore. Dark since Q4 2024.
  { id: 7, name: 'Sand Harbor', lat: 39.20060, lng: -119.93100, verified: true },
  { id: 8, name: 'Tahoe Vista', lat: 39.23640, lng: -120.06500, verified: true },
  // Tahoe City: NW shore. BOTH sources put this one on land, 2.1 km apart —
  // the app 479 m inland, the legacy table 248 m inland and 1.9 km from the
  // village (200 m from the Cedar Point station, and that table has no Cedar
  // Point row, so it looks like a mix-up). Derived instead from the OSM
  // village centre, nearest open water. Needs TERC. Last seen Jan 2026.
  { id: 9, name: 'Tahoe City', lat: 39.16858, lng: -120.14117, verified: false },
  // Camp Richardson: south shore. Was "NS Station 10" at 38.99,-120.105.
  { id: 10, name: 'Camp Richardson', lat: 38.93940, lng: -120.03900, verified: true },
  // Timber Cove: South Lake Tahoe pier area. Actively reporting. The legacy
  // value is 77 m inland and the app's is 292 m out — far for a dock sensor —
  // so this is derived from the Timber Cove Lodge pier, 72 m offshore.
  { id: 11, name: 'Timber Cove', lat: 38.94770, lng: -119.96813, verified: true },
  // Cedar Point: WEST shore, between Tahoe City and Homewood. The old
  // placeholder put it at 39.225,-119.93 on the east shore, which is why it
  // had been grouped under the Glenbrook destination.
  { id: 12, name: 'Cedar Point', lat: 39.15000, lng: -120.14224, verified: true },
]

export function stationById(id: number): StationDef | undefined {
  return NEARSHORE_STATIONS.find((s) => s.id === id)
}

/** Met station (met-uscg2020) — USCG station, north-west shore near Tahoe City.
 *  Coordinate from TERC's production app; 76 m offshore. */
export const MET_STATION = { id: 1, name: 'USCG 2020 Met Station', lat: 39.18060, lng: -120.11920 }

/**
 * NASA/JPL mid-lake buoys (nasa-tb, ids 1–4 = tb1–tb4). All four verified
 * reporting live (RBR water temp at 0.5 m + air temp + wind, 2026-07-30).
 *
 * Coordinates from TERC's own production real-time app (TERC-79), which
 * publishes these four by the same ids; the API itself returns none. All
 * four sit 3.8–6.4 km offshore in the NW-central lake, as expected for
 * mid-lake buoys. Still unconfirmed by TERC/JPL directly.
 */
export interface BuoyDef {
  id: number
  name: string
  lat: number
  lng: number
}

export const NASA_BUOYS: BuoyDef[] = [
  { id: 1, name: 'NASA Buoy TB1', lat: 39.15500, lng: -120.00400 },
  { id: 2, name: 'NASA Buoy TB2', lat: 39.10970, lng: -120.00800 },
  { id: 3, name: 'NASA Buoy TB3', lat: 39.11080, lng: -120.07300 },
  { id: 4, name: 'NASA Buoy TB4', lat: 39.15530, lng: -120.07100 },
]

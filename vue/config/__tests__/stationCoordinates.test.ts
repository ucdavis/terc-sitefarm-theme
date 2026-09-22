import { describe, expect, it } from 'vitest'
import { MET_STATION, NASA_BUOYS, NEARSHORE_STATIONS } from '../stations'
import { HOMEWOOD_FALLBACK } from '../../composables/useLakeOverview'
import shoreline from './lake-shoreline.fixture.json'
import stationsSource from '../stations.ts?raw'
import overviewSource from '../../composables/useLakeOverview.ts?raw'
import registry from '../../../scripts/registry-sync/registry.data.json'

/**
 * TERC-79. Two invariants about station coordinates, both checked by
 * computation rather than by looking at the map.
 *
 * 1. EVERY marker falls in open water. Before TERC-79, 11 of 18 rendered on
 *    dry land — Glenbrook was 19 km from Glenbrook, Cedar Point was on the
 *    wrong shore. The fixture is OpenStreetMap's Lake Tahoe polygon
 *    (relation 1823287), simplified to a 10 m tolerance; ring 0 is the lake
 *    and the rest are islands, so a marker on Fannette Island fails too.
 *
 * 2. EVERY coordinate carries exactly five decimals. This one is asserted
 *    against the SOURCE TEXT, not the parsed numbers, because 39.15000 and
 *    39.15 are the same double — the whole point is the literal a human
 *    reads and edits. At this latitude a degree of longitude is 86.4 km, so
 *    a two-decimal value carries ±432 m of slop, which is how stations that
 *    sit 26 m off the shoreline ended up inland.
 */

const M_LAT = 110540
const M_LON = 111320 * Math.cos((39.09 * Math.PI) / 180)
const rings = shoreline.rings as [number, number][][]

function inRing(lat: number, lng: number, ring: [number, number][]): boolean {
  const x = lng * M_LON
  const y = lat * M_LAT
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] * M_LON
    const yi = ring[i][1] * M_LAT
    const xj = ring[j][0] * M_LON
    const yj = ring[j][1] * M_LAT
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Open water: inside the lake's outer ring and outside every island. */
function inLakeTahoe(lat: number, lng: number): boolean {
  return inRing(lat, lng, rings[0]) && !rings.slice(1).some((r) => inRing(lat, lng, r))
}

// Cascade (id 1) is the documented exception: TERC's nearshore network is ten
// stations on Lake Tahoe plus one on CASCADE LAKE, which is a separate body of
// water south of Emerald Bay. It is correct for this one to be outside the
// Tahoe polygon — so it is excluded here, by id, with this reason attached.
const CASCADE_LAKE_STATION_ID = 1
const tahoeStations = NEARSHORE_STATIONS.filter((s) => s.id !== CASCADE_LAKE_STATION_ID)

describe('station coordinates', () => {
  it('has the stations to check (the scan is not vacuous)', () => {
    expect(tahoeStations.length).toBe(11)
    expect(NASA_BUOYS.length).toBe(4)
    expect(rings[0].length).toBeGreaterThan(200)
  })

  it.each(tahoeStations.map((s) => [s.name, s] as const))(
    'nearshore station %s sits in open water',
    (_name, s) => {
      expect(inLakeTahoe(s.lat, s.lng)).toBe(true)
    },
  )

  it.each(NASA_BUOYS.map((b) => [b.name, b] as const))('%s sits in open water', (_name, b) => {
    expect(inLakeTahoe(b.lat, b.lng)).toBe(true)
  })

  it('the USCG met station sits in open water', () => {
    expect(inLakeTahoe(MET_STATION.lat, MET_STATION.lng)).toBe(true)
  })

  it('Cascade is deliberately outside Lake Tahoe — it is on Cascade Lake', () => {
    const cascade = NEARSHORE_STATIONS.find((s) => s.id === CASCADE_LAKE_STATION_ID)!
    expect(cascade.name).toBe('Cascade')
    expect(inLakeTahoe(cascade.lat, cascade.lng)).toBe(false)
  })

  it('would catch a marker on dry land (the water test is not vacuous)', () => {
    // Tahoe City's pre-TERC-79 coordinate, 479 m inland in the town.
    expect(inLakeTahoe(39.1711, -120.147)).toBe(false)
    // Fannette Island, in Emerald Bay — inside the outer ring, but land.
    expect(inLakeTahoe(38.95394, -120.10077)).toBe(false)
  })

  // HOMEWOOD_FALLBACK lives in useLakeOverview.ts, not stations.ts, so it
  // escaped every check above — and it had drifted once already (TERC-79: it
  // held nearshore station 4's coordinate, a different instrument 1.1 km
  // away). It is only drawn when the site's JSON:API is down.
  it('the Homewood thermistor-chain fallback marker sits in open water', () => {
    expect(inLakeTahoe(HOMEWOOD_FALLBACK.lat, HOMEWOOD_FALLBACK.lng)).toBe(true)
  })

  it('the Homewood fallback matches the curated registry, not nearshore station 4', () => {
    const tc = registry.stations.find((s) => s.family === 'tc_homewood')!
    expect([HOMEWOOD_FALLBACK.lat, HOMEWOOD_FALLBACK.lng]).toEqual([tc.lat, tc.lng])
    const ns4 = NEARSHORE_STATIONS.find((s) => s.id === 4)!
    expect([HOMEWOOD_FALLBACK.lat, HOMEWOOD_FALLBACK.lng]).not.toEqual([ns4.lat, ns4.lng])
  })

  it('writes the Homewood fallback with exactly five decimals', () => {
    const block = overviewSource.slice(overviewSource.indexOf('HOMEWOOD_FALLBACK = {'))
    const literals = [...block.slice(0, block.indexOf('}')).matchAll(/\b(?:lat|lng): (-?\d+\.(\d+))\b/g)]
    expect(literals.length).toBe(2)
    expect(literals.filter((m) => m[2].length !== 5).map((m) => m[1])).toEqual([])
  })

  // `verified` means a TERC staff member confirmed the COORDINATE. None has
  // been, so none may claim it — a stale true (left over from when the flag
  // meant "the name came from the API") would mislabel a guess as confirmed.
  it('no static station claims a TERC-confirmed coordinate yet', () => {
    expect(NEARSHORE_STATIONS.filter((s) => s.verified).map((s) => s.name)).toEqual([])
    expect(registry.stations.filter((s) => s.verified).map((s) => s.name)).toEqual([])
  })

  it('writes every coordinate literal with exactly five decimals', () => {
    const literals = [...stationsSource.matchAll(/\b(?:lat|lng): (-?\d+\.(\d+))\b/g)]
    expect(literals.length).toBe(34) // 12 nearshore + 4 buoys + 1 met, lat and lng
    const wrong = literals.filter((m) => m[2].length !== 5).map((m) => m[1])
    expect(wrong).toEqual([])
  })
})

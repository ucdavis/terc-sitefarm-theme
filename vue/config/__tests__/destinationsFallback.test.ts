import { describe, expect, it } from 'vitest'
import { DESTINATIONS } from '../destinations'
import destinationsSource from '../destinations.ts?raw'
import registry from '../../../scripts/registry-sync/registry.data.json'

/**
 * TERC-96. The static destinations are the outage fallback for site content,
 * and registry.data.json is what a re-seed writes to the site. Both are
 * pulled from prod (scripts/registry-sync/pull.mjs); this keeps them from
 * drifting apart, so an outage never shows framing the editors replaced.
 *
 * The registry keys stations as "family:id"; the static tier splits them
 * into nearshore ids, buoy ids and the tc-homewood flag.
 */
function staticRefs(d: (typeof DESTINATIONS)[number]): string[] {
  return [
    ...d.stationIds.map((id) => `nearshore_station:${id}`),
    ...(d.buoyIds ?? []).map((id) => `nasa_buoy:${id}`),
    ...(d.includesHomewood ? ['tc_homewood:'] : []),
  ].sort()
}

describe('static destinations mirror registry.data.json', () => {
  it('has the same destinations', () => {
    expect(DESTINATIONS.map((d) => d.id).sort()).toEqual(registry.destinations.map((d) => d.slug).sort())
  })

  for (const r of registry.destinations) {
    it(`${r.slug}: name, coordinates, zoom and stations match`, () => {
      const d = DESTINATIONS.find((x) => x.id === r.slug)!
      expect({ name: d.name, lat: d.lat, lng: d.lng, zoom: d.zoom, stations: staticRefs(d) }).toEqual({
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        zoom: r.zoom,
        stations: [...r.stations].sort(),
      })
    })
  }

  // Same rule as the stations (stationCoordinates.test.ts), checked on the
  // source text because 39.23000 and 39.23 are the same double.
  it('writes every coordinate literal with exactly five decimals', () => {
    const literals = [...destinationsSource.matchAll(/\b(?:lat|lng): (-?\d+\.(\d+))\b/g)]
    expect(literals.length).toBe(DESTINATIONS.length * 2)
    expect(literals.filter((m) => m[2].length !== 5).map((m) => m[1])).toEqual([])
  })
})

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from './lake-locations.fixture.json'
import { DEFAULT_DESTINATION_ZOOM, adaptRegistry, fetchRegistry, staticRegistry } from '../locations'
import { miscCache } from '../../core/cache'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('adaptRegistry (fixture captured from tercdev JSON:API)', () => {
  it('adapts destinations with slug, geo, and per-kind station ids', () => {
    const r = adaptRegistry(fixture as never)
    expect(r.fromSite).toBe(true)
    const incline = r.destinations.find((d) => d.id === 'incline-village')!
    expect(incline.name).toBe('Incline Village')
    expect(incline.lat).toBeCloseTo(39.23)
    // Referenced station 4106 = Dollar Point, nearshore, api id 2.
    expect(incline.stationIds).toEqual([2])
    expect(incline.buoyIds).toEqual([])
    expect(incline.includesHomewood).toBe(false)
  })

  it('maps station types to kinds and keeps per-type source ids', () => {
    const r = adaptRegistry(fixture as never)
    const kinds = Object.fromEntries(r.stations.map((s) => [s.name, `${s.kind}:${s.sourceId}`]))
    expect(kinds['Dollar Point']).toBe('nearshore:2')
  })

  it('drops resources with unknown type or missing geo/slug', () => {
    const r = adaptRegistry({
      data: [
        { type: 'node--lake_locations', id: 'x', attributes: { title: 'No geo', field_location_id: 'no-geo' }, relationships: {} },
      ],
      included: [
        { type: 'node--station', id: 'y', attributes: { title: 'Mystery', field_station_type: 'submarine', field_location_geo_data: { lat: 39, lng: -120 } } },
      ],
    } as never)
    expect(r.destinations).toEqual([])
    expect(r.stations).toEqual([])
  })
})

describe('adaptRegistry: field_location_zoom (TERC-89)', () => {
  const dest = (zoom: unknown) =>
    adaptRegistry({
      data: [
        {
          type: 'node--lake_locations',
          id: 'd1',
          attributes: {
            title: 'North Lake Tahoe',
            field_location_id: 'north-lake-tahoe',
            field_location_geo_data: { lat: 39.185, lng: -120.02 },
            ...(zoom === 'absent' ? {} : { field_location_zoom: zoom }),
          },
          relationships: { field_stations: { data: [] } },
        },
      ],
      included: [],
    } as never).destinations[0]

  it('reads the zoom JSON:API actually sends — a decimal serialized as a string', () => {
    // Captured from local after the seeder wrote it: "11.25", "13.00".
    expect(dest('11.25')).toMatchObject({ zoom: 11.25, maxZoom: 11.25 })
    expect(dest('13.00')).toMatchObject({ zoom: 13, maxZoom: 13 })
  })

  it('also accepts a plain number', () => {
    expect(dest(12)).toMatchObject({ zoom: 12, maxZoom: 12 })
  })

  it('sets NO ceiling when the field is missing, empty or unusable — the fit stays uncapped', () => {
    for (const bad of ['absent', null, '', 'abc', '0', '-3', '99']) {
      const d = dest(bad)
      expect(d.zoom).toBe(DEFAULT_DESTINATION_ZOOM)
      expect(d.maxZoom).toBeUndefined()
    }
  })

  it('caps the static tier with its curated zooms, so both tiers frame alike', () => {
    for (const d of staticRegistry().destinations) expect(d.maxZoom).toBe(d.zoom)
  })
})

describe('fetchRegistry fallback', () => {
  it('serves the static registry when JSON:API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    miscCache.peek('x') // no-op; ensure import side effects settled
    const r = await fetchRegistry()
    expect(r.fromSite).toBe(false)
    expect(r.destinations.length).toBeGreaterThan(0)
    expect(r.stations.some((s) => s.name === 'Timber Cove')).toBe(true)
  })
})

describe('staticRegistry', () => {
  it('exposes the discovery-corrected station names', () => {
    const names = staticRegistry().stations.map((s) => s.name)
    for (const n of ['Dollar Point', 'Sand Harbor', 'Tahoe City', 'Timber Cove', 'Cedar Point']) {
      expect(names).toContain(n)
    }
  })
})

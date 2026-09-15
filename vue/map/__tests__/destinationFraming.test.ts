import { describe, it, expect } from 'vitest'
import {
  destinationBounds,
  destinationMarkerKeys,
  FRAME_MIN_SPAN_DEG,
} from '../destinationFraming'
import type { DestinationDef } from '../../config/destinations'

const dest = (over: Partial<DestinationDef> = {}): DestinationDef => ({
  id: 'd',
  name: 'D',
  lat: 39.1,
  lng: -120.0,
  zoom: 13,
  stationIds: [2, 8],
  ...over,
})

describe('destinationMarkerKeys', () => {
  it('names every family a destination can own', () => {
    expect(destinationMarkerKeys(dest({ buoyIds: [3], includesHomewood: true }))).toEqual([
      'nearshore:2',
      'nearshore:8',
      'buoy:3',
      'homewood:-1',
    ])
  })

  it('omits buoys and homewood when the destination has none', () => {
    expect(destinationMarkerKeys(dest())).toEqual(['nearshore:2', 'nearshore:8'])
  })
})

describe('destinationBounds', () => {
  it('contains every station the destination owns', () => {
    const markers = [
      { key: 'nearshore:2', lat: 39.187, lng: -120.0955 },
      { key: 'nearshore:8', lat: 39.24, lng: -120.053 },
    ]
    const [[south, west], [north, east]] = destinationBounds(dest(), markers)
    for (const m of markers) {
      expect(m.lat).toBeGreaterThan(south)
      expect(m.lat).toBeLessThan(north)
      expect(m.lng).toBeGreaterThan(west)
      expect(m.lng).toBeLessThan(east)
    }
  })

  it('ignores stations belonging to other destinations', () => {
    const far = { key: 'nearshore:11', lat: 38.9, lng: -119.97 }
    const [[south]] = destinationBounds(dest(), [far])
    expect(south).toBeGreaterThan(far.lat)
  })

  it('never frames tighter than the minimum span', () => {
    // One station, sitting on the destination itself: without a floor this
    // would fit a zero-sized box and zoom to street level.
    const [[south, west], [north, east]] = destinationBounds(dest({ stationIds: [2] }), [
      { key: 'nearshore:2', lat: 39.1, lng: -120.0 },
    ])
    expect(north - south).toBeCloseTo(FRAME_MIN_SPAN_DEG, 6)
    expect(east - west).toBeCloseTo(FRAME_MIN_SPAN_DEG, 6)
  })

  it('keeps the destination in frame when no station is placed', () => {
    const d = dest()
    const [[south, west], [north, east]] = destinationBounds(d, [])
    expect(d.lat).toBeGreaterThan(south)
    expect(d.lat).toBeLessThan(north)
    expect(d.lng).toBeGreaterThan(west)
    expect(d.lng).toBeLessThan(east)
  })

  it('grows a small box around its own centre, not off to one side', () => {
    const d = dest({ stationIds: [] })
    const [[south, west], [north, east]] = destinationBounds(d, [])
    expect((north + south) / 2).toBeCloseTo(d.lat, 6)
    expect((east + west) / 2).toBeCloseTo(d.lng, 6)
  })
})

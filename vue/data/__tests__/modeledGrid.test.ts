import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNpy } from '../../core/__tests__/buildNpy'
import { gridCache, miscCache } from '../../core/cache'
import {
  fetchCurrentSpeedGrid,
  fetchGrid,
  fetchModelManifest,
  fetchTemperatureGrid,
  gridKey,
  parseFrameName,
  prefetchAdjacentFrames,
  type ModelFrame,
} from '../modeledGrid'

/** Frames get unique per-test filenames so the module-level gridCache never
 *  collides across tests (same pattern as stationData.test.ts). */
let seq = 0
function frameFor(name: string): ModelFrame {
  const f = parseFrameName(name)
  if (!f) throw new Error(`test frame name invalid: ${name}`)
  return f
}
function uniqueFrame(): ModelFrame {
  // Dates in 1990 are firmly in the past -> deterministic TTL.FOREVER path.
  const day = String(1 + (seq % 27)).padStart(2, '0')
  const mo = String(1 + Math.floor(seq / 27) % 12).padStart(2, '0')
  seq++
  return frameFor(`1990-${mo}-${day} 14.npy`)
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('model-manifest')
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function npyResponse(buf: ArrayBuffer) {
  return { ok: true, arrayBuffer: async () => buf }
}
function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

describe('parseFrameName', () => {
  it('parses date, hour, and the lake-time instant (PDT: UTC-7)', () => {
    const f = frameFor('2026-08-18 14.npy')
    expect(f.date).toBe('2026-08-18')
    expect(f.hour).toBe(14)
    expect(f.time.toISOString()).toBe('2026-08-18T21:00:00.000Z')
  })

  it('pins frames to LAKE wall-clock across DST (PST: UTC-8)', () => {
    // The prototype used the viewer's local clock here — right only in
    // Pacific. lakeWallTimeToDate makes the instant viewer-independent.
    const f = frameFor('2026-01-15 14.npy')
    expect(f.time.toISOString()).toBe('2026-01-15T22:00:00.000Z')
  })

  it('accepts off-cadence hours (the live manifest contains an hour-7 frame)', () => {
    expect(frameFor('2026-08-30 07.npy').hour).toBe(7)
  })

  it('rejects names that are not date-hour .npy files', () => {
    expect(parseFrameName('readme.txt')).toBeNull()
    expect(parseFrameName('2026-08-18.npy')).toBeNull()
    expect(parseFrameName('2026-8-18 14.npy')).toBeNull()
  })

  it('rejects impossible calendar values instead of letting Date roll them over', () => {
    expect(parseFrameName('2026-13-01 14.npy')).toBeNull() // month 13
    expect(parseFrameName('2026-00-01 14.npy')).toBeNull() // month 0
    expect(parseFrameName('2026-02-31 14.npy')).toBeNull() // Feb 31
    expect(parseFrameName('2026-02-29 14.npy')).toBeNull() // non-leap Feb 29
    expect(parseFrameName('2026-08-00 14.npy')).toBeNull() // day 0
    expect(parseFrameName('2026-08-18 99.npy')).toBeNull() // hour 99
    expect(parseFrameName('2024-02-29 14.npy')).not.toBeNull() // real leap day
  })

  it('keeps the spring-forward frame (nonexistent 02:00 resolves nearby, not dropped)', () => {
    // DST starts 2026-03-08: the lake clock jumps 02:00 -> 03:00, so a
    // frame named 02 is a nonexistent wall time. It must survive
    // validation (dropping it would open a 4-hour gap) and resolve inside
    // the gap's neighborhood — lakeWallTimeToDate's two-pass conversion
    // lands on 09:00Z (01:00 PST) — while preserving frame ordering.
    const f = frameFor('2026-03-08 02.npy')
    expect(f.time.toISOString()).toBe('2026-03-08T09:00:00.000Z')
    const before = frameFor('2026-03-08 00.npy')
    const after = frameFor('2026-03-08 04.npy')
    expect(before.time.getTime()).toBeLessThan(f.time.getTime())
    expect(f.time.getTime()).toBeLessThan(after.time.getTime())
  })
})

describe('fetchModelManifest', () => {
  it('sorts frames by time and drops unparseable names', () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        temperature: ['2026-08-19 00.npy', 'junk.npy', '2026-08-18 14.npy'],
        flow: ['2026-08-18 16.npy'],
      }),
    )
    return fetchModelManifest().then((m) => {
      expect(m.temperature.map((f) => f.filename)).toEqual([
        '2026-08-18 14.npy',
        '2026-08-19 00.npy',
      ])
      expect(m.flow).toHaveLength(1)
      expect(fetchMock.mock.calls[0][0]).toContain('/contents.json')
    })
  })

  it('tolerates a variable missing from contents.json', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ temperature: ['2026-08-18 14.npy'] }))
    const m = await fetchModelManifest()
    expect(m.flow).toEqual([])
    expect(m.temperature).toHaveLength(1)
  })

  it('surfaces HTTP failure as a rejection (honest states)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(fetchModelManifest()).rejects.toThrow(/503/)
    miscCache.delete('model-manifest')
  })
})

describe('fetchGrid: temperature', () => {
  it('decodes to °F, preserves the NaN lake mask, and URL-encodes the space', async () => {
    const frame = uniqueFrame()
    fetchMock.mockResolvedValueOnce(npyResponse(buildNpy([1, 3], [NaN, 20, 0])))
    const grid = await fetchTemperatureGrid(frame)
    expect(grid.unit).toBe('°F')
    expect(grid.rows).toBe(1)
    expect(grid.cols).toBe(3)
    expect(Number.isNaN(grid.values[0])).toBe(true)
    expect(grid.values[1]).toBeCloseTo(68) // 20 °C
    expect(grid.values[2]).toBeCloseTo(32) // 0 °C
    expect(grid.flipVertical).toBe(true)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/temperature/')
    expect(url).toContain('%20')
    expect(url).not.toContain(' ')
  })

  it('rejects a non-2D temperature grid', async () => {
    const frame = uniqueFrame()
    fetchMock.mockResolvedValueOnce(npyResponse(buildNpy([2, 1, 3], [1, 2, 3, 4, 5, 6])))
    await expect(fetchTemperatureGrid(frame)).rejects.toThrow(/expected 2D/)
  })
})

describe('fetchGrid: flow', () => {
  it('reduces components-first (2, rows, cols) planes to ft/min speed', async () => {
    const frame = uniqueFrame()
    // u-plane [3, NaN], v-plane [4, 1] -> speeds [5, NaN] m/s.
    fetchMock.mockResolvedValueOnce(npyResponse(buildNpy([2, 1, 2], [3, NaN, 4, 1])))
    const grid = await fetchCurrentSpeedGrid(frame)
    expect(grid.unit).toBe('ft/min')
    expect(grid.rows).toBe(1)
    expect(grid.cols).toBe(2)
    expect(grid.values[0]).toBeCloseTo(5 * 196.850394)
    expect(Number.isNaN(grid.values[1])).toBe(true)
  })

  it('also handles interleaved (rows, cols, 2) layout', async () => {
    const frame = uniqueFrame()
    // Cells (u,v): (3,4) and (0,0).
    fetchMock.mockResolvedValueOnce(npyResponse(buildNpy([1, 2, 2], [3, 4, 0, 0])))
    const grid = await fetchCurrentSpeedGrid(frame)
    expect(grid.values[0]).toBeCloseTo(5 * 196.850394)
    expect(grid.values[1]).toBe(0)
  })

  it('rejects a flow grid with no length-2 component axis', async () => {
    const frame = uniqueFrame()
    fetchMock.mockResolvedValueOnce(npyResponse(buildNpy([3, 1, 3], new Array(9).fill(1))))
    await expect(fetchCurrentSpeedGrid(frame)).rejects.toThrow(/component axis/)
  })
})

describe('caching', () => {
  it('serves the second request for a past frame from cache (no refetch)', async () => {
    const frame = uniqueFrame()
    fetchMock.mockResolvedValueOnce(npyResponse(buildNpy([1, 1], [10])))
    const first = await fetchTemperatureGrid(frame)
    const second = await fetchTemperatureGrid(frame)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keys temperature and flow for the same frame separately', () => {
    const frame = frameFor('1991-06-01 12.npy')
    expect(gridKey('temperature', frame)).not.toBe(gridKey('flow', frame))
  })
})

describe('prefetchAdjacentFrames', () => {
  it('fetches neighbors nearest-first, skipping cached ones, within bounds', async () => {
    const frames = [
      '1992-03-01 00.npy',
      '1992-03-01 02.npy',
      '1992-03-01 04.npy',
      '1992-03-01 06.npy',
    ].map(frameFor)
    // Pre-cache index 2 so it must be skipped.
    fetchMock.mockResolvedValue(npyResponse(buildNpy([1, 1], [10])))
    await fetchGrid('temperature', frames[2])
    fetchMock.mockClear()

    fetchMock.mockResolvedValue(npyResponse(buildNpy([1, 1], [11])))
    prefetchAdjacentFrames('temperature', frames, 1, 4)
    await Promise.resolve()
    const urls = fetchMock.mock.calls.map((c) => decodeURIComponent(c[0] as string))
    // center=1: order tries 2 (cached), 0, 3, -1 (skip), -2 (skip), 5.. (skip).
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('1992-03-01 00.npy')
    expect(urls[1]).toContain('1992-03-01 06.npy')
  })

  it('swallows prefetch failures silently', async () => {
    const frames = [uniqueFrame(), uniqueFrame()]
    fetchMock.mockRejectedValue(new Error('network down'))
    prefetchAdjacentFrames('flow', frames, 0, 1)
    // Flush the rejected promise chain; an unhandled rejection would fail the test.
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

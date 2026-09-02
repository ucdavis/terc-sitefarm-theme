import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bucketFile,
  fetchWaveGrid,
  peekWaveGrid,
  snapToBucket,
  type WaveBucket,
} from '../waveHeight'

const fetchMock = vi.fn()

/**
 * Each test owns a bucket far enough from the others that the neighbour
 * search (±20° of direction, ±2 m/s) can never reach into another test's
 * cached results — the gridCache is module-level and persists across
 * cases. A sequence generator is NOT enough here: adjacent buckets are
 * exactly what the fallback path goes looking for.
 */
const B = {
  conversion: { ws: 5, wd: 0 },
  fallback: { ws: 7, wd: 90 },
  nothingNearby: { ws: 12, wd: 180 },
  caching: { ws: 6, wd: 270 },
  calm: { ws: 0, wd: 45 },
  calmCaching: { ws: 0, wd: 315 },
} as const

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** STWAVE files are nested arrays in metres; 0 encodes land. */
const ok = (nested: (number | null)[][]) => ({ ok: true, json: async () => nested })
const missing = { ok: false, status: 403 }

describe('bucketFile / snapToBucket', () => {
  it('builds the S3 key', () => {
    expect(bucketFile({ ws: 5, wd: 270 })).toBe('H_ws5_wd270.json')
  })

  it('rounds speed to a whole m/s and direction to 5°', () => {
    expect(snapToBucket(4.6, 268)).toEqual({ ws: 5, wd: 270 })
    expect(snapToBucket(0.4, 3)).toEqual({ ws: 0, wd: 5 })
  })

  it('clamps speed to the 0–15 bucket space', () => {
    expect(snapToBucket(-2, 0).ws).toBe(0)
    expect(snapToBucket(40, 0).ws).toBe(15)
  })

  it('wraps direction rather than emitting 360 or a negative', () => {
    expect(snapToBucket(5, 358).wd).toBe(0)
    expect(snapToBucket(5, -10).wd).toBe(350)
    expect(snapToBucket(5, 360).wd).toBe(0)
  })
})

describe('fetchWaveGrid', () => {
  it('converts metres to feet and renders land (exact 0) transparent', async () => {
    fetchMock.mockResolvedValueOnce(ok([[0, 0.5], [1, null]]))
    const { grid, substituted } = await fetchWaveGrid(B.conversion)
    expect(substituted).toBe(false)
    expect(Number.isNaN(grid.values[0])).toBe(true) // land
    expect(grid.values[1]).toBeCloseTo(1.64, 2) // 0.5 m -> ft
    expect(grid.values[2]).toBeCloseTo(3.28, 2)
    expect(Number.isNaN(grid.values[3])).toBe(true) // null also masked
    expect(grid.unit).toBe('ft')
    // STWAVE grids are stored north-first, unlike the .npy model grids.
    expect(grid.flipVertical).toBe(false)
  })

  it('falls back to a neighbouring bucket when the exact one is missing', async () => {
    fetchMock.mockResolvedValueOnce(missing) // exact bucket 403s
    fetchMock.mockResolvedValueOnce(ok([[0.3]])) // first neighbour answers
    const result = await fetchWaveGrid(B.fallback)
    expect(result.substituted).toBe(true)
    expect(result.bucket).not.toEqual(B.fallback)
    expect(result.grid.values[0]).toBeCloseTo(0.98, 2)
  })

  it('reports an explicit error when nothing nearby exists either', async () => {
    fetchMock.mockResolvedValue(missing)
    await expect(fetchWaveGrid(B.nothingNearby)).rejects.toThrow(
      /No wave solution close to/,
    )
  })

  it('caches a bucket so a second hour on the same wind costs no request', async () => {
    const bucket: WaveBucket = B.caching
    fetchMock.mockResolvedValueOnce(ok([[0.4]]))
    const first = await fetchWaveGrid(bucket)
    const second = await fetchWaveGrid(bucket)
    expect(second.grid).toBe(first.grid)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(peekWaveGrid(bucket)).toBe(first.grid)
  })

  describe('flat calm (ws = 0)', () => {
    it('borrows the water mask from ws=1 and renders the lake at 0 ft', async () => {
      // The ws=0 file is entirely zeros, so it cannot say where the lake
      // is; every ws>=1 bucket carries the identical mask (verified live).
      fetchMock.mockResolvedValueOnce(ok([[0, 0.02], [0.01, 0]]))
      const { grid } = await fetchWaveGrid(B.calm)
      expect(Number.isNaN(grid.values[0])).toBe(true) // land stays land
      expect(grid.values[1]).toBe(0) // water is flat, not missing
      expect(grid.values[2]).toBe(0)
      expect(Number.isNaN(grid.values[3])).toBe(true)
      // It asked for the ws=1 shape, never the all-zero ws=0 file.
      expect(fetchMock.mock.calls[0][0]).toContain('H_ws1_wd')
    })

    it('caches the calm grid separately from the ws=1 grid it borrowed', async () => {
      fetchMock.mockResolvedValueOnce(ok([[0.02, 0]]))
      const calm = await fetchWaveGrid(B.calmCaching)
      expect(peekWaveGrid(B.calmCaching)).toBe(calm.grid)
      const borrowed = peekWaveGrid({ ws: 1, wd: B.calmCaching.wd })
      expect(borrowed).toBeDefined()
      expect(borrowed).not.toBe(calm.grid)
      expect(borrowed?.values[0]).toBeCloseTo(0.066, 2) // still real heights
    })
  })
})


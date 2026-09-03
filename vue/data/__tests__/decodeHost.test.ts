import { afterEach, describe, expect, it } from 'vitest'
import { buildNpy } from '../../core/__tests__/buildNpy'
import { setGridWorkerForTests, type GridWorkerRequest } from '../../core/gridWorker'
import { decodeGrid, decodeWave } from '../decodeHost'
import { decodeWaveGrid } from '../gridDecode'

const bytesOf = (nested: unknown) => new TextEncoder().encode(JSON.stringify(nested)).buffer

afterEach(() => setGridWorkerForTests(undefined))

describe('decodeHost', () => {
  it('decodes .npy inline when there is no worker — same result as the pure decoder', async () => {
    setGridWorkerForTests(null)
    const grid = await decodeGrid('temperature', buildNpy([1, 2], [20, NaN]))
    expect(grid.unit).toBe('°F')
    expect(grid.values[0]).toBeCloseTo(68)
    expect(Number.isNaN(grid.values[1])).toBe(true)
  })

  it('hands .npy bytes to the worker as a clone, never transferred', async () => {
    const buf = buildNpy([1, 1], [10])
    const seen: { req?: GridWorkerRequest } = {}
    setGridWorkerForTests({
      async request<T>(req: GridWorkerRequest) {
        seen.req = req
        return { rows: 1, cols: 1, values: new Float64Array([50]), unit: '°F', flipVertical: true, flipHorizontal: false } as T
      },
    })
    const grid = await decodeGrid('temperature', buf)
    expect(grid.values[0]).toBe(50)
    expect(seen.req?.kind).toBe('npy')
    // The caller's buffer must still be usable: if the worker died after
    // this request, the inline fallback would need it.
    expect(buf.byteLength).toBeGreaterThan(0)
  })

  it('decodes wave-bucket bytes inline: metres to feet, exact 0 is land', async () => {
    setGridWorkerForTests(null)
    const grid = await decodeWave(bytesOf([[0.3048, 0, null]]), false)
    expect(grid.unit).toBe('ft')
    expect(grid.values[0]).toBeCloseTo(1)
    expect(Number.isNaN(grid.values[1])).toBe(true)
    expect(Number.isNaN(grid.values[2])).toBe(true)
    expect(grid.flipVertical).toBe(false) // STWAVE is north-first
  })

  it('routes a wave decode through the worker with the zero policy', async () => {
    const seen: { req?: GridWorkerRequest } = {}
    setGridWorkerForTests({
      async request<T>(req: GridWorkerRequest) {
        seen.req = req
        return decodeWaveGrid((req as { bytes: ArrayBuffer }).bytes, true) as T
      },
    })
    const grid = await decodeWave(bytesOf([[0, 0.5]]), true)
    expect(seen.req?.kind).toBe('wave')
    expect(grid.values[0]).toBe(0) // zeroIsWater honoured end to end
  })
})

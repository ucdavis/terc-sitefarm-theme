// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isProxy, reactive } from 'vue'
import { CURRENT_SCALE, TEMPERATURE_SCALE } from '../../core/colorScale'
import { setGridWorkerForTests, type GridWorkerRequest } from '../../core/gridWorker'
import type { ScalarGrid } from '../../data/gridDecode'

// happy-dom has no canvas; the synchronous fallback renderer is stubbed so
// the routing and memoization are what's under test.
vi.mock('../fieldImage', () => ({
  renderFieldImage: vi.fn(() => 'data:image/png;base64,sync'),
}))

import { renderFieldImage } from '../fieldImage'
import { renderFieldUrl, resetFieldRendererForTests } from '../fieldRenderer'

function grid(v = 50): ScalarGrid {
  return { rows: 1, cols: 1, values: new Float64Array([v]), unit: '°F', flipVertical: true, flipHorizontal: false }
}

let objectUrls = 0
const created: string[] = []
const revoked: string[] = []

beforeEach(() => {
  objectUrls = 0
  created.length = 0
  revoked.length = 0
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => {
      const u = `blob:mem-${++objectUrls}`
      created.push(u)
      return u
    },
    revokeObjectURL: (u: string) => revoked.push(u),
  })
  vi.mocked(renderFieldImage).mockClear()
})
afterEach(() => {
  resetFieldRendererForTests()
  setGridWorkerForTests(undefined)
  vi.unstubAllGlobals()
})

const blobWorker = () => {
  const seen: GridWorkerRequest[] = []
  setGridWorkerForTests({
    async request<T>(req: GridWorkerRequest) {
      seen.push(req)
      return new Blob(['png']) as T
    },
  })
  return seen
}

describe('renderFieldUrl', () => {
  it('renders in the worker and returns an object URL for the blob', async () => {
    const seen = blobWorker()
    const url = await renderFieldUrl(grid(), TEMPERATURE_SCALE)
    expect(url).toBe('blob:mem-1')
    expect(seen).toHaveLength(1)
    expect(seen[0].kind).toBe('render')
    expect(renderFieldImage).not.toHaveBeenCalled()
  })

  it('memoizes per grid and scale, so playback across a drawn frame renders nothing', async () => {
    const seen = blobWorker()
    const g = grid()
    const first = await renderFieldUrl(g, TEMPERATURE_SCALE)
    const again = await renderFieldUrl(g, TEMPERATURE_SCALE)
    expect(again).toBe(first)
    expect(seen).toHaveLength(1)
    // A different scale on the same grid is a different picture.
    await renderFieldUrl(g, CURRENT_SCALE)
    expect(seen).toHaveLength(2)
    // A different grid object is a different picture, even with equal values.
    await renderFieldUrl(grid(), TEMPERATURE_SCALE)
    expect(seen).toHaveLength(3)
  })

  it('posts a plain, cloneable grid even when handed a reactive proxy', async () => {
    // Component props deliver Vue's reactive Proxy of the cached grid; a
    // Proxy cannot be structured-cloned into a worker (DataCloneError,
    // found live). The memo must also see the proxy and the raw object as
    // one grid.
    const seen = blobWorker()
    const raw = grid()
    const proxied = reactive(raw) as ScalarGrid
    const first = await renderFieldUrl(proxied, TEMPERATURE_SCALE)
    const sent = (seen[0] as { grid: ScalarGrid }).grid
    expect(isProxy(sent)).toBe(false)
    expect(Object.getPrototypeOf(sent)).toBe(Object.prototype)
    expect(sent.values).toBe(raw.values)
    expect(await renderFieldUrl(raw, TEMPERATURE_SCALE)).toBe(first)
    expect(seen).toHaveLength(1)
  })

  it('falls back to the synchronous canvas path without a worker', async () => {
    setGridWorkerForTests(null)
    expect(await renderFieldUrl(grid(), TEMPERATURE_SCALE)).toBe('data:image/png;base64,sync')
    expect(renderFieldImage).toHaveBeenCalledOnce()
    expect(created).toHaveLength(0)
  })

  it('reports null when neither path can produce an image', async () => {
    setGridWorkerForTests(null)
    vi.mocked(renderFieldImage).mockReturnValueOnce(null)
    expect(await renderFieldUrl(grid(), TEMPERATURE_SCALE)).toBeNull()
  })

  it('revokes the least recently used object URL once the memo is full', async () => {
    blobWorker()
    const grids = Array.from({ length: 65 }, (_, i) => grid(i))
    for (const g of grids) await renderFieldUrl(g, TEMPERATURE_SCALE)
    expect(created).toHaveLength(65)
    expect(revoked).toEqual(['blob:mem-1'])
    // The evicted grid re-renders; a recent one does not.
    await renderFieldUrl(grids[64], TEMPERATURE_SCALE)
    expect(created).toHaveLength(65)
  })
})

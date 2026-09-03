/**
 * Field image rendering for the main thread (TERC-47): where the picture
 * gets made, and remembering that it was.
 *
 * Two things keep playback smooth:
 *  1. Rendering runs in the grid worker via OffscreenCanvas when one is
 *     available (the PNG encode of a 695×406 wave grid is the single
 *     heaviest thing the main thread did per tick), falling back to the
 *     synchronous canvas path otherwise.
 *  2. Rendered images are memoized per (grid, scale). Grids are immutable
 *     objects held by the cache, so identity is a sound key — and once a
 *     frame has been drawn, playing back across it costs nothing at all.
 *
 * Worker renders come back as Blobs and become object URLs, which must be
 * revoked; the memo is a bounded LRU that revokes on eviction. Its cap
 * exceeds the grid cache's, so a playback window never thrashes it.
 */
import { toRaw } from 'vue'
import type { ColorScale } from '../core/colorScale'
import { offload } from '../core/gridWorker'
import type { ScalarGrid } from '../data/gridDecode'
import { renderFieldImage } from './fieldImage'

const MAX_MEMO = 64

/** Insertion-ordered so the first key is the least recently rendered. */
const memo = new Map<string, string>()
const gridIds = new WeakMap<ScalarGrid, number>()
let nextGridId = 1

function memoKey(grid: ScalarGrid, scale: ColorScale): string {
  let id = gridIds.get(grid)
  if (id === undefined) {
    id = nextGridId++
    gridIds.set(grid, id)
  }
  return `${id}:${scale.name}`
}

function remember(key: string, url: string): void {
  memo.delete(key)
  memo.set(key, url)
  while (memo.size > MAX_MEMO) {
    const [oldestKey, oldestUrl] = memo.entries().next().value as [string, string]
    memo.delete(oldestKey)
    if (oldestUrl.startsWith('blob:')) URL.revokeObjectURL(oldestUrl)
  }
}

/**
 * A URL for the grid painted through the scale — memoized, and rendered
 * off-thread when possible. Null when no image can be produced (no canvas
 * support), which callers must treat as "remove the overlay".
 */
export async function renderFieldUrl(input: ScalarGrid, scale: ColorScale): Promise<string | null> {
  // The grid arrives through a component prop, i.e. as Vue's reactive
  // Proxy of the cached object. A Proxy can't be structured-cloned into a
  // worker (DataCloneError — found live), and the memo must key on the one
  // underlying grid, not on whichever proxy happened to reach us.
  const grid = toRaw(input)
  const key = memoKey(grid, scale)
  const hit = memo.get(key)
  if (hit) {
    remember(key, hit) // LRU touch
    return hit
  }
  // Plain payloads only: exactly the fields the worker reads.
  const payload: ScalarGrid = {
    rows: grid.rows,
    cols: grid.cols,
    values: grid.values,
    unit: grid.unit,
    flipVertical: grid.flipVertical,
    flipHorizontal: grid.flipHorizontal,
  }
  const plainScale: ColorScale = {
    name: scale.name,
    unit: scale.unit,
    min: scale.min,
    max: scale.max,
    stops: [...scale.stops],
  }
  const blob = await offload<Blob | null>({ kind: 'render', grid: payload, scale: plainScale }, () => null)
  const url = blob ? URL.createObjectURL(blob) : renderFieldImage(grid, scale)
  if (url) remember(key, url)
  return url
}

/** Test seam: forget every rendered image. */
export function resetFieldRendererForTests(): void {
  for (const url of memo.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  memo.clear()
}

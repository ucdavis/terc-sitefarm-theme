// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { shallowRef } from 'vue'
import type { ScalarGrid } from '../../data/gridDecode'
import { MAP_ENGINE_INJECTION_KEY, type MapEngine } from '../../map/engine'
import { CURRENT_SCALE, TEMPERATURE_SCALE } from '../../core/colorScale'

// The renderer (worker/canvas/memo) has its own suite; here only the
// engine-facing contract is under test, so it's stubbed to a fake URL.
vi.mock('../../map/fieldRenderer', () => ({
  renderFieldUrl: vi.fn(async () => 'blob:fake'),
}))

import FieldOverlay from '../FieldOverlay.vue'
import { renderFieldUrl } from '../../map/fieldRenderer'

function makeEngine() {
  const calls: { op: string; id: string; url?: string; opacity?: number }[] = []
  const engine = {
    clearGroup() {},
    addBadgeMarker() {},
    addCircleMarker() {},
    flyTo() {},
    fitBounds() {},
    invalidateSize() {},
    setImageOverlay(id: string, url: string, _b: unknown, opacity: number) {
      calls.push({ op: 'set', id, url, opacity })
    },
    removeImageOverlay(id: string) {
      calls.push({ op: 'remove', id })
    },
    destroy() {},
  } as unknown as MapEngine
  return { engine, calls }
}

function grid(v = 50): ScalarGrid {
  return {
    rows: 1,
    cols: 1,
    values: new Float64Array([v]),
    unit: '°F',
    flipVertical: true,
    flipHorizontal: false,
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const last = <T,>(a: T[]) => a[a.length - 1]

const mountOverlay = (
  engineRef: ReturnType<typeof shallowRef<MapEngine | null>>,
  props: Record<string, unknown>,
) =>
  mount(FieldOverlay, {
    props: { scale: TEMPERATURE_SCALE, grid: null, ...props },
    global: { provide: { [MAP_ENGINE_INJECTION_KEY]: engineRef } },
  })

beforeEach(() => {
  vi.mocked(renderFieldUrl).mockReset()
  vi.mocked(renderFieldUrl).mockImplementation(async () => 'blob:fake')
})

describe('FieldOverlay', () => {
  it('draws through the engine seam once the engine and grid exist', async () => {
    const { engine, calls } = makeEngine()
    mountOverlay(shallowRef<MapEngine | null>(engine), { grid: grid() })
    await flush()
    expect(calls).toEqual([{ op: 'set', id: 'scalar-field', url: 'blob:fake', opacity: 1 }])
  })

  it('waits for a late-arriving engine (map mounts after the overlay)', async () => {
    const { engine, calls } = makeEngine()
    const engineRef = shallowRef<MapEngine | null>(null)
    mountOverlay(engineRef, { grid: grid() })
    await flush()
    expect(calls).toHaveLength(0)
    engineRef.value = engine
    await flush()
    expect(calls.filter((c) => c.op === 'set')).toHaveLength(1)
  })

  it('removes the overlay when the grid goes away and on unmount', async () => {
    const { engine, calls } = makeEngine()
    const w = mountOverlay(shallowRef<MapEngine | null>(engine), { grid: grid() })
    await flush()
    await w.setProps({ grid: null })
    expect(last(calls)).toEqual({ op: 'remove', id: 'scalar-field' })
    await w.setProps({ grid: grid() })
    await flush()
    w.unmount()
    expect(last(calls)).toEqual({ op: 'remove', id: 'scalar-field' })
  })

  it('removes a stale overlay when a render attempt yields no image', async () => {
    const { engine, calls } = makeEngine()
    const w = mountOverlay(shallowRef<MapEngine | null>(engine), { grid: grid() })
    await flush()
    expect(last(calls).op).toBe('set')
    vi.mocked(renderFieldUrl).mockResolvedValueOnce(null)
    await w.setProps({ grid: grid(51) })
    await flush()
    expect(last(calls)).toEqual({ op: 'remove', id: 'scalar-field' })
  })

  it('lets only the newest render touch the map when a slow one finishes late', async () => {
    // Rendering is async (it may run in the worker): a playback tick or a
    // fast step must never be overwritten by an earlier frame that took
    // longer to render.
    const { engine, calls } = makeEngine()
    let releaseSlow: (v: string) => void = () => {}
    vi.mocked(renderFieldUrl)
      .mockImplementationOnce(() => new Promise<string>((r) => (releaseSlow = r)))
      .mockImplementationOnce(async () => 'blob:newest')
    const w = mountOverlay(shallowRef<MapEngine | null>(engine), { grid: grid(1) })
    await w.setProps({ grid: grid(2) }) // second render, resolves first
    await flush()
    expect(last(calls)).toEqual({ op: 'set', id: 'scalar-field', url: 'blob:newest', opacity: 1 })
    releaseSlow('blob:stale') // first render finishes late
    await flush()
    expect(calls.filter((c) => c.url === 'blob:stale')).toHaveLength(0)
    expect(last(calls).url).toBe('blob:newest')
  })

  it('removes the overlay when the render itself fails', async () => {
    // A rejected render must not leave the previous frame on the map
    // looking current (PR review finding).
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { engine, calls } = makeEngine()
    const w = mountOverlay(shallowRef<MapEngine | null>(engine), { grid: grid() })
    await flush()
    expect(last(calls).op).toBe('set')
    vi.mocked(renderFieldUrl).mockRejectedValueOnce(new Error('convertToBlob failed'))
    await w.setProps({ grid: grid(51) })
    await flush()
    expect(last(calls)).toEqual({ op: 'remove', id: 'scalar-field' })
  })

  it('ignores a failure from a superseded render', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { engine, calls } = makeEngine()
    const slow: { reject?: (e: unknown) => void } = {}
    vi.mocked(renderFieldUrl)
      .mockImplementationOnce(() => new Promise<string>((_, rej) => (slow.reject = rej)))
      .mockImplementationOnce(async () => 'blob:newest')
    const w = mountOverlay(shallowRef<MapEngine | null>(engine), { grid: grid(1) })
    await w.setProps({ grid: grid(2) })
    await flush()
    expect(last(calls).url).toBe('blob:newest')
    slow.reject?.(new Error('stale render failed'))
    await flush()
    // The newest frame stays; the stale failure removed nothing.
    expect(last(calls)).toEqual({ op: 'set', id: 'scalar-field', url: 'blob:newest', opacity: 1 })
  })

  it('re-renders when the scale changes, not just the grid', async () => {
    const { engine } = makeEngine()
    const w = mountOverlay(shallowRef<MapEngine | null>(engine), { grid: grid() })
    await flush()
    await w.setProps({ scale: CURRENT_SCALE })
    await flush()
    expect(vi.mocked(renderFieldUrl)).toHaveBeenCalledTimes(2)
  })

  it('is a no-op without a hosting LakeMap (no provided engine)', async () => {
    const w = mount(FieldOverlay, { props: { scale: TEMPERATURE_SCALE, grid: grid() } })
    await flush()
    expect(vi.mocked(renderFieldUrl)).not.toHaveBeenCalled()
    expect(w.html()).toContain('hidden')
  })
})

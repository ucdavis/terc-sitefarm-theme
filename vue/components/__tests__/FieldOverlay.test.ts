// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { shallowRef } from 'vue'
import type { ScalarGrid } from '../../data/gridDecode'
import { MAP_ENGINE_INJECTION_KEY, type MapEngine } from '../../map/engine'
import { TEMPERATURE_SCALE } from '../../core/colorScale'

// happy-dom has no canvas 2D; the real renderer would return null. Stub it
// so the engine-facing contract is what's under test here (the pixel math
// has its own suite in map/__tests__/fieldImage.test.ts).
vi.mock('../../map/fieldImage', () => ({
  renderFieldImage: vi.fn(() => 'data:image/png;base64,fake'),
}))

import FieldOverlay from '../FieldOverlay.vue'
import { renderFieldImage } from '../../map/fieldImage'

function makeEngine() {
  const calls: { op: string; id: string; url?: string; opacity?: number }[] = []
  const engine = {
    clearGroup() {},
    addBadgeMarker() {},
    addCircleMarker() {},
    flyTo() {},
    fitBounds() {},
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

function grid(): ScalarGrid {
  return {
    rows: 1,
    cols: 1,
    values: new Float64Array([50]),
    unit: '°F',
    flipVertical: true,
    flipHorizontal: false,
  }
}

const mountOverlay = (engineRef: ReturnType<typeof shallowRef<MapEngine | null>>, props: Record<string, unknown>) =>
  mount(FieldOverlay, {
    props: { scale: TEMPERATURE_SCALE, grid: null, ...props },
    global: { provide: { [MAP_ENGINE_INJECTION_KEY]: engineRef } },
  })

describe('FieldOverlay', () => {
  it('draws through the engine seam once the engine and grid exist', async () => {
    const { engine, calls } = makeEngine()
    const engineRef = shallowRef<MapEngine | null>(engine)
    mountOverlay(engineRef, { grid: grid() })
    await Promise.resolve()
    expect(calls).toEqual([
      { op: 'set', id: 'scalar-field', url: 'data:image/png;base64,fake', opacity: 1 },
    ])
  })

  it('waits for a late-arriving engine (map mounts after the overlay)', async () => {
    const { engine, calls } = makeEngine()
    const engineRef = shallowRef<MapEngine | null>(null)
    const w = mountOverlay(engineRef, { grid: grid() })
    expect(calls).toHaveLength(0)
    engineRef.value = engine
    await w.vm.$nextTick()
    expect(calls.filter((c) => c.op === 'set')).toHaveLength(1)
  })

  it('removes the overlay when the grid goes away and on unmount', async () => {
    const { engine, calls } = makeEngine()
    const engineRef = shallowRef<MapEngine | null>(engine)
    const w = mountOverlay(engineRef, { grid: grid() })
    await w.setProps({ grid: null })
    expect(calls[calls.length - 1]).toEqual({ op: 'remove', id: 'scalar-field' })
    await w.setProps({ grid: grid() })
    w.unmount()
    expect(calls[calls.length - 1]).toEqual({ op: 'remove', id: 'scalar-field' })
  })

  it('removes a stale overlay when a render attempt yields no image', async () => {
    const { engine, calls } = makeEngine()
    const engineRef = shallowRef<MapEngine | null>(engine)
    const w = mountOverlay(engineRef, { grid: grid() })
    await Promise.resolve()
    expect(calls[calls.length - 1]).toEqual({
      op: 'set',
      id: 'scalar-field',
      url: 'data:image/png;base64,fake',
      opacity: 1,
    })

    // Canvas 2D unavailable (or a render failure) must not leave the
    // PREVIOUS frame's image looking current on the map (PR review finding).
    vi.mocked(renderFieldImage).mockReturnValueOnce(null)
    await w.setProps({ grid: grid() })
    expect(calls[calls.length - 1]).toEqual({ op: 'remove', id: 'scalar-field' })
  })

  it('is a no-op without a hosting LakeMap (no provided engine)', () => {
    const w = mount(FieldOverlay, {
      props: { scale: TEMPERATURE_SCALE, grid: grid() },
    })
    expect(w.html()).toContain('hidden')
  })
})

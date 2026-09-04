// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { OverviewMarker } from '../../composables/useLakeOverview'

// Live markers, controllable per test (the welcome's hint derives from them).
const markers = ref<OverviewMarker[]>([])
vi.mock('../../composables/useLakeOverview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composables/useLakeOverview')>()),
  useLakeOverview: () => ({ markers, reload: () => {} }),
  markerKey: (kind: string, id: number) => `${kind}:${id}`,
}))
vi.mock('../../data/conditionBands', () => ({
  loadConditionBands: async () => {},
}))
// Site content: the static registry, with a description written for one
// destination — the only way a description ever arrives (TERC-9).
vi.mock('../../data/locations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../data/locations')>()
  const withDescription = () => {
    const r = mod.staticRegistry()
    return {
      ...r,
      fromSite: true,
      destinations: r.destinations.map((d) =>
        d.id === 'incline-village'
          ? { ...d, description: '<p>North shore — the water warms <em>earliest</em> here.</p>' }
          : d,
      ),
    }
  }
  return { ...mod, fetchRegistry: async () => withDescription() }
})

import CurrentConditionsShell from '../CurrentConditionsShell.vue'
import { syncFromLocation } from '../../composables/useConditionsState'

const mountShell = () =>
  mount(CurrentConditionsShell, {
    global: {
      stubs: { LakeMap: true, WaterQualityView: true, PlanYourDayView: true, CacheDiagnostics: true },
    },
  })
const flush = () => new Promise((r) => setTimeout(r, 0))
const pick = async (w: ReturnType<typeof mountShell>, name: string) =>
  w.findAll('.cc-dest').find((b) => b.text() === name)!.trigger('click')

beforeEach(() => {
  markers.value = []
  window.history.replaceState(null, '', '/real-time-conditions')
  syncFromLocation()
})

describe('CurrentConditionsShell map aside (TERC-9)', () => {
  it('welcomes beside the map when the whole lake is shown', async () => {
    const w = mountShell()
    await flush()
    const aside = w.get('.cc-location-desc.cc-welcome')
    expect(aside.attributes('aria-label')).toBe('Welcome to Lake Tahoe')
    expect(aside.text()).toContain('Pick a destination above')
    expect(w.get('.cc-map-row').classes()).toContain('cc-map-row--with-aside')
    // Nothing is reporting in this fixture, so no hint.
    expect(aside.find('.cc-welcome-hint').exists()).toBe(false)
  })

  it('lists the destinations reporting right now, derived from live markers', async () => {
    // Station 2 belongs to Incline Village in the static registry.
    markers.value = [
      { key: 'nearshore:2', kind: 'nearshore', sourceId: 2, name: 'Dollar Point', lat: 39.2, lng: -120.1, status: 'reporting' } as OverviewMarker,
    ]
    const w = mountShell()
    await flush()
    const hint = w.get('.cc-welcome-hint')
    expect(hint.text()).toContain('reporting stations right now')
    expect(hint.text()).toContain('Incline Village')
    expect(hint.text()).not.toContain('Glenbrook')
  })

  it('replaces the welcome with the editor-written description for a described place', async () => {
    const w = mountShell()
    await flush()
    await pick(w, 'Incline Village')
    expect(w.find('.cc-welcome').exists()).toBe(false)
    const aside = w.get('.cc-location-desc')
    expect(aside.attributes('aria-label')).toBe('About Incline Village')
    expect(aside.get('h3').text()).toBe('Incline Village')
    // Rendered as HTML, not escaped text.
    expect(aside.find('.cc-location-desc-body em').text()).toBe('earliest')
  })

  it('shows no aside for a destination nobody has written up, and the welcome again on reset', async () => {
    const w = mountShell()
    await flush()
    await pick(w, 'Glenbrook')
    expect(w.find('.cc-location-desc').exists()).toBe(false)
    expect(w.get('.cc-map-row').classes()).not.toContain('cc-map-row--with-aside')
    await pick(w, 'Show whole lake')
    expect(w.find('.cc-welcome').exists()).toBe(true)
  })
})

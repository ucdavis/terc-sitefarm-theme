// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('../../composables/useLakeOverview', () => ({
  useLakeOverview: () => ({ markers: ref([]), reload: () => {} }),
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
  window.history.replaceState(null, '', '/real-time-conditions')
  syncFromLocation()
})

describe('CurrentConditionsShell location description (TERC-9)', () => {
  it('shows nothing beside the map until a described destination is chosen', async () => {
    const w = mountShell()
    await flush()
    expect(w.find('.cc-location-desc').exists()).toBe(false)
    expect(w.get('.cc-map-row').classes()).not.toContain('cc-map-row--with-aside')
  })

  it('renders the editor-written description beside the map for the selected place', async () => {
    const w = mountShell()
    await flush()
    await pick(w, 'Incline Village')
    const aside = w.get('.cc-location-desc')
    expect(aside.attributes('aria-label')).toBe('About Incline Village')
    expect(aside.get('h3').text()).toBe('Incline Village')
    // Rendered as HTML, not escaped text.
    expect(aside.find('.cc-location-desc-body em').text()).toBe('earliest')
    expect(w.get('.cc-map-row').classes()).toContain('cc-map-row--with-aside')
  })

  it('goes away for a destination nobody has written up, and on reset', async () => {
    const w = mountShell()
    await flush()
    await pick(w, 'Incline Village')
    expect(w.find('.cc-location-desc').exists()).toBe(true)
    await pick(w, 'Glenbrook')
    expect(w.find('.cc-location-desc').exists()).toBe(false)
    await pick(w, 'Incline Village')
    await pick(w, 'Show whole lake')
    expect(w.find('.cc-location-desc').exists()).toBe(false)
  })
})

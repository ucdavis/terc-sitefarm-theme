// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount as vtuMount } from '@vue/test-utils'
import { ref } from 'vue'

// The lake map has its own suite (LakeMap.test.ts) and the overview
// composable fetches live station data — stub both so shell tests stay
// network-free and focused on shell behavior.
vi.mock('../../composables/useLakeOverview', () => ({
  useLakeOverview: () => ({ markers: ref([]), reload: () => {} }),
  markerKey: (kind: string, id: number) => `${kind}:${id}`,
}))
vi.mock('../../data/conditionBands', () => ({
  loadConditionBands: async () => {},
}))

import CurrentConditionsShell from '../CurrentConditionsShell.vue'
import { syncFromLocation } from '../../composables/useConditionsState'

const mount = (component: typeof CurrentConditionsShell, props: Record<string, unknown> = {}) =>
  vtuMount(component, {
    props,
    global: { stubs: { LakeMap: true, WaterQualityView: true, CacheDiagnostics: true } },
  })

beforeEach(() => {
  window.history.replaceState(null, '', '/lake-conditions')
  syncFromLocation()
})

describe('CurrentConditionsShell', () => {
  it('renders the two view tabs, destination selector, badge, and disclaimer', () => {
    const w = mount(CurrentConditionsShell)
    expect(w.findAll('.cc-tab').map((t) => t.text())).toEqual([
      'Plan Your Day',
      'Water Quality',
    ])
    expect(w.text()).toContain('Where are you going?')
    expect(w.find('.source-badge').text()).toContain('tepfsail50 REST API')
    expect(w.find('.cc-disclaimer').text()).toContain('provisional')
    expect(w.find('.cc-forecast h3').text()).toBe('Forecasted Conditions')
  })

  it('keeps the selected destination when switching views', async () => {
    const w = mount(CurrentConditionsShell)
    await w.findAll('.cc-dest').find((b) => b.text() === 'Homewood')!.trigger('click')
    await w.findAll('.cc-tab')[1].trigger('click')
    await w.findAll('.cc-tab')[0].trigger('click')
    expect(w.find('.cc-view h3').text()).toBe('Plan Your Day')
    expect(w.find('.cc-view-selection').text()).toContain('For Homewood')
  })

  it('sends old Plan Your Day + deep links to Plan Your Day', () => {
    window.history.replaceState(null, '', '/lake-conditions?cc-view=plan-your-day-extended')
    syncFromLocation()
    const w = mount(CurrentConditionsShell)
    expect(w.find('.cc-tab.active').text()).toBe('Plan Your Day')
  })

  it('block-form toggles control the phase chip, source chips, and cache diagnostics', () => {
    // Defaults: badges on, diagnostics off (matches the block form defaults).
    const def = mount(CurrentConditionsShell)
    expect(def.find('.phase-chip').exists()).toBe(true)
    expect(def.find('.source-chip').exists()).toBe(true)
    expect(def.find('cache-diagnostics-stub').exists()).toBe(false)

    // PDB checkbox values arrive as '0'/'1' strings.
    const off = mount(CurrentConditionsShell, { showPhase: '0', showSources: '0', debug: '1' })
    expect(off.find('.phase-chip').exists()).toBe(false)
    expect(off.find('.source-chip').exists()).toBe(false)
    expect(off.find('.source-badge').exists()).toBe(false) // both off -> no badge row at all
    expect(off.find('cache-diagnostics-stub').exists()).toBe(true)

    // Independent: sources without phase.
    const mixed = mount(CurrentConditionsShell, { showPhase: '0', showSources: '1' })
    expect(mixed.find('.phase-chip').exists()).toBe(false)
    expect(mixed.find('.source-chip').exists()).toBe(true)
  })

  it('names the current selection in the block heading', async () => {
    const w = mount(CurrentConditionsShell)
    expect(w.find('.cc-head h2').text()).toBe('Lake Tahoe Current Conditions')
    await w.findAll('.cc-dest').find((b) => b.text() === 'Incline Village')!.trigger('click')
    expect(w.find('.cc-head h2').text()).toBe('Lake Tahoe Current Conditions for Incline Village')
    await w.findAll('.cc-dest').find((b) => b.text() === 'Show whole lake')!.trigger('click')
    expect(w.find('.cc-head h2').text()).toBe('Lake Tahoe Current Conditions')
  })

  it('exposes destination selection state and announces changes to assistive technology', async () => {
    const w = mount(CurrentConditionsShell)
    const live = w.find('[aria-live="polite"]')
    expect(live.text()).toBe('Showing the whole lake.')
    const homewood = w.findAll('.cc-dest').find((b) => b.text() === 'Homewood')!
    expect(homewood.attributes('aria-pressed')).toBe('false')
    await homewood.trigger('click')
    expect(homewood.attributes('aria-pressed')).toBe('true')
    expect(live.text()).toBe('Showing Homewood.')
  })

  it('renders the Water Quality view on its tab (TERC-21)', async () => {
    const w = mount(CurrentConditionsShell)
    await w.findAll('.cc-tab')[1].trigger('click')
    expect(w.find('.cc-view h3').text()).toBe('Water Quality')
    expect(w.find('water-quality-view-stub').exists()).toBe(true)
  })

  it('"Show whole lake" appears with a selection and resets it', async () => {
    const w = mount(CurrentConditionsShell)
    expect(w.text()).not.toContain('Show whole lake')
    await w.findAll('.cc-dest').find((b) => b.text() === 'Glenbrook')!.trigger('click')
    const reset = w.findAll('.cc-dest').find((b) => b.text() === 'Show whole lake')!
    await reset.trigger('click')
    expect(w.find('.cc-view-selection').text()).toContain('whole lake')
    expect(w.text()).not.toContain('Show whole lake')
  })
})

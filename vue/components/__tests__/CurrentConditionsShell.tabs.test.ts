// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// Same network-free setup as CurrentConditionsShell.test.ts.
vi.mock('../../composables/useLakeOverview', () => ({
  useLakeOverview: () => ({ markers: ref([]), reload: () => {} }),
  markerKey: (kind: string, id: number) => `${kind}:${id}`,
}))
vi.mock('../../data/conditionBands', () => ({
  loadConditionBands: async () => {},
}))
vi.mock('../../data/locations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../data/locations')>()
  return { ...mod, fetchRegistry: async () => mod.staticRegistry() }
})

import CurrentConditionsShell from '../CurrentConditionsShell.vue'
import { syncFromLocation } from '../../composables/useConditionsState'

const mountShell = () =>
  mount(CurrentConditionsShell, {
    global: {
      stubs: { LakeMap: true, WaterQualityView: true, PlanYourDayView: true, CacheDiagnostics: true },
    },
  })

beforeEach(() => {
  window.history.replaceState({}, '', '/real-time-conditions')
  syncFromLocation()
})

/**
 * TERC-55: the Phase 1 shell's view switcher is a full ARIA tabs widget —
 * the same ViewTabs the Forecasted Conditions shell uses — instead of the
 * earlier nav + aria-current pattern.
 */
describe('CurrentConditionsShell tabs (TERC-55)', () => {
  it('exposes a labelled tablist with one tab stop and a labelled panel', () => {
    const w = mountShell()
    const list = w.get('[role="tablist"]')
    expect(list.attributes('aria-label')).toBe('Current Conditions views')
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['Plan Your Day', 'Water Quality'])
    // Roving tabindex: exactly one tab is in the tab order.
    expect(tabs.map((t) => t.attributes('tabindex'))).toEqual(['0', '-1'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(w.find('nav').exists()).toBe(false)
    expect(w.find('[aria-current]').exists()).toBe(false)
  })

  it('wires the active tab to the panel by id in both directions', async () => {
    const w = mountShell()
    const panel = w.get('[role="tabpanel"]')
    let active = w.get('[role="tab"][aria-selected="true"]')
    expect(active.attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(panel.attributes('aria-labelledby')).toBe(active.attributes('id'))

    await w.findAll('[role="tab"]')[1].trigger('click')
    active = w.get('[role="tab"][aria-selected="true"]')
    expect(active.text()).toBe('Water Quality')
    // The single panel re-pairs with whichever tab is active.
    expect(w.get('[role="tabpanel"]').attributes('id')).toBe(active.attributes('aria-controls'))
    expect(w.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(active.attributes('id'))
    expect(w.get('.cc-view h3').text()).toBe('Water Quality')
  })

  it('switches views with the arrow keys, wrapping, plus Home and End', async () => {
    const w = mountShell()
    const list = w.get('[role="tablist"]')
    await list.trigger('keydown', { key: 'ArrowRight' })
    expect(w.get('.cc-view h3').text()).toBe('Water Quality')
    expect(w.findAll('[role="tab"]').map((t) => t.attributes('tabindex'))).toEqual(['-1', '0'])
    await list.trigger('keydown', { key: 'ArrowRight' }) // wraps
    expect(w.get('.cc-view h3').text()).toBe('Plan Your Day')
    await list.trigger('keydown', { key: 'End' })
    expect(w.get('.cc-view h3').text()).toBe('Water Quality')
    await list.trigger('keydown', { key: 'Home' })
    expect(w.get('.cc-view h3').text()).toBe('Plan Your Day')
  })

  it('announces the view change politely', async () => {
    const w = mountShell()
    await w.findAll('[role="tab"]')[1].trigger('click')
    const announcements = w.findAll('[aria-live="polite"]').map((p) => p.text())
    expect(announcements).toContain('Water Quality view selected.')
  })

  it('gives each shell instance disjoint tab ids (multi-instance pages)', () => {
    const a = mountShell()
    const b = mountShell()
    const idsA = a.findAll('[role="tab"]').map((t) => t.attributes('id'))
    const idsB = b.findAll('[role="tab"]').map((t) => t.attributes('id'))
    for (const id of idsA) expect(idsB).not.toContain(id)
  })

  it('uses the underline treatment so the shell keeps its approved look', () => {
    const w = mountShell()
    expect(w.get('[role="tablist"]').classes()).toContain('view-tabs--underline')
  })
})

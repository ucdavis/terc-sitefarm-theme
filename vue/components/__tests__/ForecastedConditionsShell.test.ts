// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { miscCache } from '../../core/cache'
import { resetModelTimeForTests } from '../../composables/useModelTime'

const NAMES = ['2026-08-19 12.npy', '2026-08-19 14.npy', '2026-08-19 16.npy']

const fetchMock = vi.fn()

import ForecastedConditionsShell from '../ForecastedConditionsShell.vue'

const mountShell = (props: Record<string, unknown> = {}) =>
  mount(ForecastedConditionsShell, {
    props,
    global: { stubs: { LakeMap: true, CacheDiagnostics: true } },
  })

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ temperature: NAMES, flow: NAMES }),
  })
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('model-manifest')
  resetModelTimeForTests()
})
afterEach(() => {
  resetModelTimeForTests()
  vi.unstubAllGlobals()
})

describe('ForecastedConditionsShell', () => {
  it('renders the heading, the three registered view tabs, and the map stage', async () => {
    const w = mountShell()
    await flush()
    expect(w.text()).toContain('Lake Tahoe Forecasted Conditions')
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['Water Temperature', 'Currents', 'Wave Height'])
    expect(w.find('lake-map-stub').exists()).toBe(true)
  })

  it('switches panels via tabs and announces the change politely', async () => {
    // v-show visibility asserted via the style attribute — happy-dom's
    // isVisible() does not honor display:none reliably.
    const hidden = (sel: string) =>
      (w.get(sel).attributes('style') ?? '').includes('display: none')
    const w = mountShell()
    await flush()
    expect(hidden('#fc-panel-water-temperature')).toBe(false)
    expect(hidden('#fc-panel-currents')).toBe(true)
    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(hidden('#fc-panel-currents')).toBe(false)
    expect(hidden('#fc-panel-water-temperature')).toBe(true)
    expect(w.get('[aria-live="polite"]').text()).toContain('Currents view selected.')
  })

  it('placeholder panels honestly name the story delivering each layer', async () => {
    const w = mountShell()
    await flush()
    expect(w.get('#fc-panel-water-temperature').text()).toContain('TERC-23')
    await w.findAll('[role="tab"]')[2].trigger('click')
    expect(w.get('#fc-panel-wave-height').text()).toContain('TERC-24')
  })

  it('loads the manifest itself and shows the selected lake time in the caption', async () => {
    const w = mountShell()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await flush()
    expect(w.get('#fc-panel-water-temperature').text()).toContain('(lake time)')
  })

  it('shows a manifest failure as an alert, honestly', async () => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    const w = mountShell()
    await flush()
    await flush()
    const alert = w.get('[role="alert"]')
    expect(alert.text()).toContain('could not be loaded')
    expect(alert.text()).toContain('503')
  })

  it('links back to Real-Time Conditions (configurable path)', async () => {
    const w = mountShell({ realTimePath: '/custom-path' })
    await flush()
    const link = w.get('.fc-realtime a')
    expect(link.attributes('href')).toBe('/custom-path')
    expect(link.text()).toContain('Real-Time Conditions')
  })

  it('hides source chips and shows diagnostics per block-form toggles (0/1 strings)', async () => {
    const w = mountShell({ showSources: '0', debug: '1' })
    await flush()
    expect(w.find('.source-chip').exists()).toBe(false)
    expect(w.find('cache-diagnostics-stub').exists()).toBe(true)
  })
})

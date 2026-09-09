// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { miscCache } from '../../core/cache'
import { resetModelTimeForTests } from '../../composables/useModelTime'

const NAMES = ['2026-08-19 12.npy', '2026-08-19 14.npy', '2026-08-19 16.npy']

const fetchMock = vi.fn()

import ForecastedConditionsShell from '../ForecastedConditionsShell.vue'

// Each stub keeps its own element name (as VTU's auto-stubs would) and
// renders the `side` slot, where the shell's editor-owned text lands (TERC-64).
const sideSlotStub = (tag: string) => ({ template: `<${tag}><slot name="side" /></${tag}>` })

const mountShell = (props: Record<string, unknown> = {}) =>
  mount(ForecastedConditionsShell, {
    props,
    // WaterTemperatureView has its own suite; stubbing it keeps shell tests
    // free of grid fetches.
    global: {
      stubs: {
        LakeMap: true,
        CacheDiagnostics: true,
        WaterTemperatureView: sideSlotStub('water-temperature-view-stub'),
        CurrentsView: sideSlotStub('currents-view-stub'),
        WaveHeightView: sideSlotStub('wave-height-view-stub'),
      },
    },
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
  // The shell writes ?fc-view= to the URL (TERC-12) and happy-dom shares
  // location across a file's tests — start each one from a clean address.
  window.history.replaceState(null, '', '/forecasted-conditions')
})
afterEach(() => {
  resetModelTimeForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ForecastedConditionsShell', () => {
  it('renders the heading, the three view tabs, and the active view component', async () => {
    const w = mountShell()
    await flush()
    expect(w.text()).toContain('Lake Tahoe Forecasted Conditions')
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['Water Temperature', 'Currents', 'Wave Height'])
    expect(w.find('water-temperature-view-stub').exists()).toBe(true)
  })

  it('mounts only the active view — an offscreen one would fetch unseen grids', async () => {
    const w = mountShell()
    await flush()
    const tabs = w.findAll('[role="tab"]')

    await tabs[1].trigger('click')
    expect(w.find('currents-view-stub').exists()).toBe(true)
    expect(w.find('water-temperature-view-stub').exists()).toBe(false)
    expect(w.find('wave-height-view-stub').exists()).toBe(false)

    await tabs[2].trigger('click')
    expect(w.find('wave-height-view-stub').exists()).toBe(true)
    expect(w.find('currents-view-stub').exists()).toBe(false)
  })

  it('switches panels via tabs and announces the change politely', async () => {
    // Panels located positionally (ids are per-instance); v-show asserted
    // via the style attribute — happy-dom's isVisible() does not honor
    // display:none reliably.
    const w = mountShell()
    const hidden = (i: number) =>
      (w.findAll('[role="tabpanel"]')[i].attributes('style') ?? '').includes('display: none')
    await flush()
    expect(hidden(0)).toBe(false)
    expect(hidden(1)).toBe(true)
    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(hidden(1)).toBe(false)
    expect(hidden(0)).toBe(true)
    expect(w.get('[aria-live="polite"]').text()).toContain('Currents view selected.')
  })

  it('renders the editor-owned text in the active view\'s reading column, defaults included (TERC-9)', async () => {
    const w = mountShell()
    await flush()
    const panels = w.findAll('[role="tabpanel"]')
    const tabs = w.findAll('[role="tab"]')
    // Only the active view is mounted, so its aside is the only one in the DOM.
    const aside = () => w.get('.fc-panel-aside')
    expect(panels[0].find('.fc-panel-aside').exists()).toBe(true)
    expect(aside().attributes('aria-label')).toBe('About Water Temperature')
    expect(aside().text()).toContain('cold upwellings')
    expect(aside().text()).toContain('cold-water shock')
    // Blank lines in the text become paragraphs.
    expect(aside().findAll('p')).toHaveLength(2)
    await tabs[1].trigger('click')
    expect(panels[1].get('.fc-panel-aside').text()).toContain('rip currents')
    await tabs[2].trigger('click')
    expect(panels[2].get('.fc-panel-aside').text()).toContain('the fetch')
    expect(w.findAll('.fc-panel-aside')).toHaveLength(1)
    // The views themselves no longer carry the copy.
    expect(w.find('.wt-safety, .cv-safety, .wv-safety').exists()).toBe(false)
  })

  it('takes intro and per-view text from the block form', async () => {
    const w = mountShell({
      introText: 'Custom intro.\n\nSecond paragraph.',
      currentsText: 'Editors wrote this about currents.',
    })
    await flush()
    const intro = w.get('.fc-intro')
    expect(intro.findAll('p').map((p) => p.text())).toEqual(['Custom intro.', 'Second paragraph.'])
    const panels = w.findAll('[role="tabpanel"]')
    // Unconfigured views keep their defaults.
    expect(panels[0].get('.fc-panel-aside').text()).toContain('cold-water shock')
    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(panels[1].get('.fc-panel-aside').text()).toBe('Editors wrote this about currents.')
  })

  it('loads the manifest itself and shows the selected lake time in the caption', async () => {
    const w = mountShell()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await flush()
    expect(w.findAll('[role="tabpanel"]')[0].text()).toContain('(lake time)')
  })

  it('wires tabs to panels with matching per-instance ids', async () => {
    const w = mountShell()
    await flush()
    const tab = w.findAll('[role="tab"]')[0]
    const panel = w.findAll('[role="tabpanel"]')[0]
    expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'))
  })

  it('gives each shell instance disjoint tab ids (multi-instance pages)', async () => {
    const a = mountShell()
    const b = mountShell()
    await flush()
    const idsA = a.findAll('[role="tab"]').map((t) => t.attributes('id'))
    const idsB = b.findAll('[role="tab"]').map((t) => t.attributes('id'))
    for (const id of idsA) expect(idsB).not.toContain(id)
  })

  it('manifest failure offers a retry that recovers in place', async () => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ temperature: NAMES, flow: NAMES }),
    })
    const w = mountShell()
    await flush()
    await flush()
    const retry = w.get('.fc-retry')
    expect(retry.text()).toContain('Try again')
    await retry.trigger('click')
    await flush()
    await flush()
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(w.get('.frame-count').text()).toContain(`/ ${NAMES.length}`)
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

  describe('deep-linkable view (TERC-12)', () => {
    it('defaults to Water Temperature with no param or an unknown one', async () => {
      window.history.replaceState(null, '', '/forecasted-conditions?fc-view=nonsense')
      const w = mountShell()
      await flush()
      expect(w.get('[role="tab"][aria-selected="true"]').text()).toBe('Water Temperature')
      // An unknown value is dropped from the URL rather than preserved.
      expect(new URLSearchParams(window.location.search).get('fc-view')).toBeNull()
    })

    it('opens the view named in ?fc-view=', async () => {
      window.history.replaceState(null, '', '/forecasted-conditions?fc-view=currents')
      const w = mountShell()
      await flush()
      expect(w.get('[role="tab"][aria-selected="true"]').text()).toBe('Currents')
    })

    it('PUSHES a chosen view so Back can walk the views visited, and clears it for the default', async () => {
      window.history.replaceState(null, '', '/forecasted-conditions?other=1')
      const push = vi.spyOn(window.history, 'pushState')
      const replace = vi.spyOn(window.history, 'replaceState')
      const w = mountShell()
      await flush()
      expect(replace).not.toHaveBeenCalled() // nothing to normalise
      await w.findAll('[role="tab"]')[2].trigger('click')
      const q = new URLSearchParams(window.location.search)
      expect(q.get('fc-view')).toBe('wave-height')
      expect(q.get('other')).toBe('1') // unrelated params survive
      expect(push).toHaveBeenCalledTimes(1)
      await w.findAll('[role="tab"]')[0].trigger('click')
      expect(new URLSearchParams(window.location.search).get('fc-view')).toBeNull()
      expect(push).toHaveBeenCalledTimes(2)
      expect(replace).not.toHaveBeenCalled()
    })

    it('normalises an unknown param with REPLACE, adding no history entry', async () => {
      window.history.replaceState(null, '', '/forecasted-conditions?fc-view=nonsense')
      const push = vi.spyOn(window.history, 'pushState')
      const replace = vi.spyOn(window.history, 'replaceState')
      mountShell()
      await flush()
      expect(replace).toHaveBeenCalledTimes(1)
      expect(push).not.toHaveBeenCalled()
    })

    it('follows Back/Forward (popstate) without writing history', async () => {
      window.history.replaceState(null, '', '/forecasted-conditions')
      const w = mountShell()
      await flush()
      await w.findAll('[role="tab"]')[1].trigger('click') // pushes ?fc-view=currents
      expect(new URLSearchParams(window.location.search).get('fc-view')).toBe('currents')

      // The browser restores the previous entry and fires popstate.
      window.history.replaceState(null, '', '/forecasted-conditions')
      const push = vi.spyOn(window.history, 'pushState')
      const replace = vi.spyOn(window.history, 'replaceState')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await flush()
      expect(w.get('[role="tab"][aria-selected="true"]').text()).toBe('Water Temperature')
      expect(push).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
      expect(window.location.search).toBe('') // the restored entry is left alone
    })
  })
})

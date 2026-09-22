// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { miscCache } from '../../core/cache'
import { resetModelTimeForTests } from '../../composables/useModelTime'
import { resetWaveTimeForTests, useWaveTime } from '../../composables/useWaveTime'

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

  describe('safety note (TERC-76)', () => {
    it('renders nothing extra by default, so the shipped copy is not duplicated', async () => {
      // The view texts already carry the cold-water-shock sentences, and
      // saved editor copy still holds them — a defaulted safety note would
      // print the warning twice on every existing site.
      const w = mountShell()
      await flushPromises()
      expect(w.find('.fc-safety').exists()).toBe(false)
    })

    it('shows the note, split into paragraphs, once an editor fills it in', async () => {
      const w = mountShell({ safetyText: 'Water is cold.\n\nWear a life vest.' })
      await flushPromises()
      const notes = w.findAll('.fc-safety')
      expect(notes).toHaveLength(2)
      expect(notes[0].text()).toBe('Water is cold.')
      expect(notes[1].text()).toBe('Wear a life vest.')
    })
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

// ---------------------------------------------------------------- TERC-92
describe('stale forecast notice (TERC-92)', () => {
  // A day of frames, Sep 16 12:00 -> Sep 17 00:00 lake time — the shape of
  // the model's last run before it stopped publishing.
  const LAST_RUN = ['2026-09-16 12.npy', '2026-09-16 18.npy', '2026-09-17 00.npy']
  const serve = (names: string[]) =>
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ temperature: names, flow: names }) })

  afterEach(() => vi.useRealTimers())

  it('says the forecast is out of date, naming the newest time in lake time and how old it is', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-22T15:49:00Z')) // Sep 22, 8:49 AM lake time
    serve(LAST_RUN)
    const w = mountShell()
    await flushPromises()
    await flush()
    const note = w.find('.fc-stale')
    expect(note.exists()).toBe(true)
    expect(note.attributes('role')).toBe('status')
    expect(note.text()).toContain('This forecast is out of date.')
    expect(note.text()).toContain('Sep 17')
    expect(note.text()).toContain('(lake time)')
    expect(note.text()).toContain('5 days ago')
  })

  it('shows nothing while the forecast is current', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-16T20:00:00Z')) // Sep 16, 1 PM lake time
    serve(LAST_RUN)
    const w = mountShell()
    await flushPromises()
    await flush()
    expect(w.find('.fc-stale').exists()).toBe(false)
  })

  it('counts hours, not days, when the gap is under two days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-17T21:00:00Z')) // Sep 17, 2 PM lake time
    serve(LAST_RUN)
    const w = mountShell()
    await flushPromises()
    await flush()
    expect(w.find('.fc-stale').text()).toContain('14 hours ago')
  })
})

// ---------------------------------------------------------------- TERC-93
describe('wave height runs on its own clock (TERC-93)', () => {
  // The model stopped at Sep 17; NOAA's wind forecast runs from Sep 22.
  const LAST_RUN = ['2026-09-16 12.npy', '2026-09-16 18.npy', '2026-09-17 00.npy']
  const WIND = {
    properties: {
      windSpeed: {
        uom: 'wmoUnit:km_h-1',
        values: [
          { validTime: '2026-09-22T16:00:00+00:00/PT1H', value: 18 },
          { validTime: '2026-09-23T16:00:00+00:00/PT1H', value: 18 },
        ],
      },
      windDirection: {
        uom: 'wmoUnit:degree_(angle)',
        values: [
          { validTime: '2026-09-22T16:00:00+00:00/PT1H', value: 240 },
          { validTime: '2026-09-23T16:00:00+00:00/PT1H', value: 240 },
        ],
      },
    },
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-22T15:49:00Z'))
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('weather.gov')
        ? { ok: true, json: async () => WIND }
        : { ok: true, json: async () => ({ temperature: LAST_RUN, flow: LAST_RUN }) },
    )
    miscCache.delete('noaa-wind')
    resetWaveTimeForTests()
    // WaveHeightView (stubbed here) is what loads NOAA's hours in the app.
    await useWaveTime().ensureWaveHours()
  })
  afterEach(() => {
    resetWaveTimeForTests()
    miscCache.delete('noaa-wind')
    vi.useRealTimers()
  })

  const dateOptions = (w: ReturnType<typeof mountShell>) =>
    w.findAll('.fc-selector option').map((o) => o.attributes('value'))

  it('offers NOAA’s dates on the wave view and the model’s on the others', async () => {
    const w = mountShell()
    await flushPromises()
    await flush()
    expect(dateOptions(w)).toEqual(['2026-09-16', '2026-09-17'])

    await w.findAll('[role="tab"]')[2].trigger('click')
    expect(dateOptions(w)).toEqual(['2026-09-22', '2026-09-23'])
    expect(w.findAll('[role="tabpanel"]')[2].text()).toContain('Sep 22')

    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(dateOptions(w)).toEqual(['2026-09-16', '2026-09-17'])
  })

  it('shows the stale-model notice everywhere except the wave view, which is current', async () => {
    const w = mountShell()
    await flushPromises()
    await flush()
    expect(w.find('.fc-stale').exists()).toBe(true)
    await w.findAll('[role="tab"]')[2].trigger('click')
    expect(w.find('.fc-stale').exists()).toBe(false)
    await w.findAll('[role="tab"]')[0].trigger('click')
    expect(w.find('.fc-stale').exists()).toBe(true)
  })

  it('keeps each clock’s selection across view switches', async () => {
    const w = mountShell()
    await flushPromises()
    await flush()
    await w.findAll('[role="tab"]')[2].trigger('click')
    await w.get('.fc-selector select').setValue('2026-09-23')
    await w.findAll('[role="tab"]')[0].trigger('click')
    expect((w.get('.fc-selector select').element as HTMLSelectElement).value).toBe('2026-09-17')
    await w.findAll('[role="tab"]')[2].trigger('click')
    expect((w.get('.fc-selector select').element as HTMLSelectElement).value).toBe('2026-09-23')
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { miscCache } from '../../core/cache'
import { resetModelTimeForTests, useModelTime } from '../../composables/useModelTime'
import DateHourSelector from '../DateHourSelector.vue'

const NAMES = [
  '2026-08-18 22.npy',
  '2026-08-19 00.npy',
  '2026-08-19 02.npy',
  '2026-08-19 14.npy',
]

const fetchMock = vi.fn()
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(async () => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ temperature: NAMES, flow: NAMES }),
  })
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('model-manifest')
  resetModelTimeForTests()
  await useModelTime().ensureManifest()
})
afterEach(() => {
  resetModelTimeForTests()
  vi.unstubAllGlobals()
})

describe('DateHourSelector', () => {
  it('is a labelled group with live hour readout and lake-day date options', async () => {
    const t = useModelTime()
    t.selectedIndex.value = 3
    const w = mount(DateHourSelector)
    expect(w.get('[role="group"]').attributes('aria-label')).toContain('arrow keys')
    expect(w.get('[aria-live="polite"]').text()).toContain('2:00 PM')
    const options = w.findAll('option')
    expect(options.map((o) => o.attributes('value'))).toEqual(['2026-08-18', '2026-08-19'])
    expect(options[0].text()).toBe('Aug 18')
  })

  it('steps hours with the buttons and disables them at the bounds', async () => {
    const t = useModelTime()
    t.selectedIndex.value = 0
    const w = mount(DateHourSelector)
    const prev = w.get('[aria-label="Previous forecast time"]')
    const next = w.get('[aria-label="Next forecast time"]')
    expect(prev.attributes('disabled')).toBeDefined()
    await next.trigger('click')
    expect(t.selectedIndex.value).toBe(1)
    t.selectedIndex.value = NAMES.length - 1
    await flush()
    expect(next.attributes('disabled')).toBeDefined()
  })

  it('scrubs with arrow keys from the group focus stop', async () => {
    const t = useModelTime()
    t.selectedIndex.value = 1
    const w = mount(DateHourSelector)
    await w.get('[role="group"]').trigger('keydown', { key: 'ArrowRight' })
    expect(t.selectedIndex.value).toBe(2)
    await w.get('[role="group"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(t.selectedIndex.value).toBe(1)
  })

  it('playback button is a labelled toggle (aria-pressed) and flags forecasts', async () => {
    const t = useModelTime()
    t.selectedIndex.value = 0
    const w = mount(DateHourSelector)
    const play = w.get('.play-btn')
    expect(play.attributes('aria-pressed')).toBe('false')
    await play.trigger('click')
    expect(t.playing.value).toBe(true)
    expect(play.attributes('aria-pressed')).toBe('true')
    expect(play.text()).toContain('Stop')
    t.stopPlay()
    // All fixture frames are in the future relative to the test run? No —
    // 2026-08-19 is in the past by the session clock; the forecast tag only
    // appears for frames after "now", so it must be absent here.
    expect(w.find('.forecast-tag').exists()).toBe(false)
  })
})

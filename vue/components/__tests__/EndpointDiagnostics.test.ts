// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EndpointDiagnostics from '../EndpointDiagnostics.vue'
import { enableRequestLog, resetRequestLogForTests, tracedFetch } from '../../core/requestLog'

// The panel claims page-wide ownership on mount; release it after every
// test so the next instance renders.
let mounted: ReturnType<typeof mount>[] = []
const mountPanel = () => {
  const w = mount(EndpointDiagnostics)
  mounted.push(w)
  return w
}

beforeEach(() => {
  resetRequestLogForTests()
  enableRequestLog()
  localStorage.clear()
})
afterEach(() => {
  mounted.forEach((w) => w.unmount())
  mounted = []
  vi.unstubAllGlobals()
})

describe('EndpointDiagnostics', () => {
  it('lists one row per endpoint family with outcome, timing, totals and the last error — as a real table', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'content-length': '2' } }))
        .mockResolvedValueOnce(new Response('', { status: 503, statusText: 'Service Unavailable' }))
        .mockResolvedValueOnce(new Response('[]', { status: 200 })),
    )
    await tracedFetch('https://h/v1/report/met-uscg2020?id=1&rptdate=20260903')
    await tracedFetch('https://h/v1/report/ns-station-range?id=4')
    await tracedFetch('https://h/v1/report/ns-station-range?id=4')
    const w = mountPanel()

    expect(w.get('section').attributes('aria-label')).toBe('Endpoint diagnostics')
    expect(w.findAll('thead th').map((t) => t.text())).toEqual(['Endpoint', 'URL', 'Last', 'Time', 'Result', 'Payload', 'Calls', 'Last error'])
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    // Grouped and sorted by family; the newest call leads each row.
    expect(rows[0].get('th').text()).toBe('report · met-uscg2020 #1')
    expect(rows[0].text()).toContain('OK 200')
    expect(rows[0].text()).toContain('2 B')
    // The actual URL hit, in full (TERC-65).
    expect(rows[0].get('.url code').text()).toBe('https://h/v1/report/met-uscg2020?id=1&rptdate=20260903')
    expect(rows[1].get('th').text()).toBe('report · ns-station-range #4')
    expect(rows[1].text()).toContain('OK 200') // latest call succeeded…
    expect(rows[1].text()).toContain('2 (1 failed)') // …one of two failed
    expect(rows[1].text()).toContain('HTTP 503 Service Unavailable')
    // Status is spoken, not just colored.
    expect(w.get('[role="status"]').text()).toBe('3 requests, 1 failed.')
  })

  it('collapses to a toggle with a proper expanded state', async () => {
    const w = mountPanel()
    const toggle = w.get('.ep-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(w.text()).toContain('No requests yet.')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(w.find('.ep-body').exists()).toBe(false)
  })

  it('moves with the arrow keys from its handle, remembers the spot, and Home puts it back (TERC-65)', async () => {
    const w = mountPanel()
    const panel = w.get('section')
    const handle = w.get('.ep-handle')
    expect(handle.attributes('aria-label')).toContain('arrow keys')
    expect(panel.attributes('style') ?? '').toBe('')
    expect(w.find('.ep-reset').exists()).toBe(false)

    await handle.trigger('keydown', { key: 'ArrowRight' })
    await handle.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    expect(panel.attributes('style')).toContain('left: 10px')
    expect(panel.attributes('style')).toContain('top: 50px')
    expect(panel.classes()).toContain('moved')
    expect(JSON.parse(localStorage.getItem('terc-endpoint-panel-pos')!)).toEqual({ left: 10, top: 50 })

    // A fresh mount comes back where it was left.
    w.unmount()
    mounted.pop()
    const w2 = mountPanel()
    await w2.vm.$nextTick()
    expect(w2.get('section').attributes('style')).toContain('left: 10px')

    await w2.get('.ep-reset').trigger('click')
    expect(w2.get('section').attributes('style') ?? '').toBe('')
    expect(localStorage.getItem('terc-endpoint-panel-pos')).toBeNull()

    await w2.get('.ep-handle').trigger('keydown', { key: 'ArrowLeft' })
    await w2.get('.ep-handle').trigger('keydown', { key: 'Home' })
    expect(w2.find('.ep-reset').exists()).toBe(false)
  })

  it('drags with the pointer from its handle and never leaves the viewport', async () => {
    const w = mountPanel()
    const handle = w.get('.ep-handle')
    await handle.trigger('pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    await handle.trigger('pointermove', { clientX: 160, clientY: 130 })
    await handle.trigger('pointerup')
    const style = w.get('section').attributes('style')
    expect(style).toContain('left: 60px')
    expect(style).toContain('top: 30px')
    // Dragging far off-screen is clamped to the window.
    await handle.trigger('pointerdown', { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
    await handle.trigger('pointermove', { clientX: -5000, clientY: -5000 })
    await handle.trigger('pointerup')
    expect(w.get('section').attributes('style')).toContain('left: 0px')
    expect(w.get('section').attributes('style')).toContain('top: 0px')
  })

  it('resizes from the keyboard as well as the pointer grip, remembers the size, Home restores it (Copilot, PR #31)', async () => {
    // The table area only exists once something has been requested.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
    await tracedFetch('/jsonapi/node/lake_locations')
    const w = mountPanel()
    const grip = w.get('.ep-resize')
    expect(grip.attributes('aria-label')).toContain('arrow keys')
    expect(w.get('.ep-scroll').attributes('style') ?? '').toBe('')

    await grip.trigger('keydown', { key: 'ArrowRight' })
    await grip.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    const style = w.get('.ep-scroll').attributes('style')!
    // happy-dom reports no layout, so growth starts from the code defaults (480×240).
    expect(style).toContain('width: 504px')
    expect(style).toContain('height: 312px')
    expect(JSON.parse(localStorage.getItem('terc-endpoint-panel-size')!)).toEqual({ w: 504, h: 312 })

    // Never smaller than the minimum.
    for (let i = 0; i < 30; i++) await grip.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(w.get('.ep-scroll').attributes('style')).toContain('width: 260px')

    await grip.trigger('keydown', { key: 'Home' })
    expect(w.get('.ep-scroll').attributes('style') ?? '').toBe('')
    expect(localStorage.getItem('terc-endpoint-panel-size')).toBeNull()
  })


  it('the ⤡ control also works with the pointer: drag resizes, a click maximizes and restores (TERC-69)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
    await tracedFetch('/jsonapi/node/lake_locations')
    const w = mountPanel()
    const grip = w.get('.ep-resize')
    const scroll = () => w.get('.ep-scroll').attributes('style') ?? ''

    // Drag: deltas apply to the default size (480×240 in the test DOM).
    await grip.trigger('pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    await grip.trigger('pointermove', { clientX: 140, clientY: 120 })
    await grip.trigger('pointerup')
    expect(scroll()).toContain('width: 520px')
    expect(scroll()).toContain('height: 260px')
    expect(grip.attributes('aria-pressed')).toBe('true')

    // Click (no movement) while resized -> restore the default.
    await grip.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    await grip.trigger('pointerup')
    expect(scroll()).toBe('')
    expect(grip.attributes('aria-pressed')).toBe('false')
    expect(grip.attributes('aria-label')).toContain('click to maximize')

    // Click while default -> maximize, clamped to the viewport.
    await grip.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    await grip.trigger('pointerup')
    expect(scroll()).toContain(`width: ${window.innerWidth - 56}px`)
    expect(scroll()).toContain(`height: ${Math.round(window.innerHeight * 0.8)}px`)
    expect(grip.attributes('aria-label')).toContain('restore the default size')

    // Enter does the same from the keyboard.
    await grip.trigger('keydown', { key: 'Enter' })
    expect(scroll()).toBe('')
  })
})

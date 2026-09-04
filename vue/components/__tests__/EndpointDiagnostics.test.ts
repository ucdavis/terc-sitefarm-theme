// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EndpointDiagnostics from '../EndpointDiagnostics.vue'
import { enableRequestLog, resetRequestLogForTests, tracedFetch } from '../../core/requestLog'

beforeEach(() => {
  resetRequestLogForTests()
  enableRequestLog()
})
afterEach(() => vi.unstubAllGlobals())

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
    const w = mount(EndpointDiagnostics)

    expect(w.get('section').attributes('aria-label')).toBe('Endpoint diagnostics')
    expect(w.findAll('thead th').map((t) => t.text())).toEqual(['Endpoint', 'Last', 'Time', 'Result', 'Payload', 'Calls', 'Last error'])
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    // Grouped and sorted by family; the newest call leads each row.
    expect(rows[0].get('th').text()).toBe('report · met-uscg2020 #1')
    expect(rows[0].text()).toContain('OK 200')
    expect(rows[0].text()).toContain('2 B')
    expect(rows[1].get('th').text()).toBe('report · ns-station-range #4')
    expect(rows[1].text()).toContain('OK 200') // latest call succeeded…
    expect(rows[1].text()).toContain('2 (1 failed)') // …one of two failed
    expect(rows[1].text()).toContain('HTTP 503 Service Unavailable')
    // Status is spoken, not just colored.
    expect(w.get('[role="status"]').text()).toBe('3 requests, 1 failed.')
    w.unmount() // releases page-wide ownership for the next instance
  })

  it('collapses to a toggle with a proper expanded state', async () => {
    const w = mount(EndpointDiagnostics)
    const toggle = w.get('.ep-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(w.text()).toContain('No requests yet.')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(w.find('.ep-body').exists()).toBe(false)
  })
})

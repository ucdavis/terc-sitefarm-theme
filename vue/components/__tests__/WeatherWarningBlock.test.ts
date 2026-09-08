// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WeatherWarningBlock from '../WeatherWarningBlock.vue'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function response(severities: string[]) {
  return {
    ok: true,
    json: async () => ({
      features: severities.map((severity, index) => ({
        id: `alert-${index}`,
        properties: { severity },
      })),
    }),
  }
}

describe('WeatherWarningBlock', () => {
  it('renders the compact alert count and highest severity', async () => {
    fetchMock.mockResolvedValue(response(['Moderate']))
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()

    expect(String(fetchMock.mock.calls[0][0])).toContain('zone=CAZ072%2CNVZ002')
    expect(wrapper.classes()).toContain('alert--warning')
    expect(wrapper.classes()).toContain('alert--icon')
    expect(wrapper.find('.alert__inner').exists()).toBe(true)
    expect(wrapper.text()).toContain('1 active alert')
    expect(wrapper.text()).toContain('Highest severity: Moderate')
    expect(wrapper.find('button').text()).toBe('Refresh')
  })

  it('chooses the highest severity across all active alerts', async () => {
    fetchMock.mockResolvedValue(response(['Minor', 'Extreme', 'Severe']))
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()

    expect(wrapper.text()).toContain('3 active alerts')
    expect(wrapper.text()).toContain('Highest severity: Extreme')
  })

  it('refreshes the data when requested', async () => {
    fetchMock.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(['Severe']))
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()
    expect(wrapper.text()).toContain('0 active alerts')

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Highest severity: Severe')
  })

  it('treats a null or non-object JSON body as an invalid response, not a crash', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => null })
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()
    expect(wrapper.text()).toMatch(/unavailable|failed|could not/i)
  })

  it('shows failures honestly and allows another refresh', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()

    expect(wrapper.text()).toContain('Weather alerts unavailable')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  describe('sample alert (TERC-66)', () => {
    it('renders the archived advisory without touching the network, labelled as a sample', async () => {
      const wrapper = mount(WeatherWarningBlock, { props: { sampleAlert: 1 } })
      // The fixture is a lazily loaded chunk, so wait for it rather than for microtasks.
      await vi.waitFor(() => expect(wrapper.text()).toContain('1 active alert'))
      expect(fetchMock).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Sample alert — not live')
      expect(wrapper.text()).toContain('Highest severity: Moderate')
      expect(wrapper.get('section').attributes('aria-label')).toContain('sample alert, not live')
      expect(wrapper.get('section').classes()).toContain('weather-warning--sample')
      // Refresh stays in sample mode.
      await wrapper.get('.weather-warning__refresh').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('1 active alert'))
      expect(fetchMock).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Sample alert — not live')
    })

    it('is off by default and accepts the checkbox forms PDB sends', async () => {
      fetchMock.mockResolvedValue(response(['Minor']))
      const live = mount(WeatherWarningBlock)
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(live.text()).not.toContain('Sample alert')
      for (const off of [0, '0', false]) {
        fetchMock.mockClear()
        mount(WeatherWarningBlock, { props: { sampleAlert: off } })
        await flushPromises()
        expect(fetchMock).toHaveBeenCalledTimes(1)
      }
      for (const on of ['1', true]) {
        fetchMock.mockClear()
        const w = mount(WeatherWarningBlock, { props: { sampleAlert: on } })
        await vi.waitFor(() => expect(w.text()).toContain('1 active alert'))
        expect(fetchMock).not.toHaveBeenCalled()
        expect(w.text()).toContain('Sample alert')
      }
    })
  })
})

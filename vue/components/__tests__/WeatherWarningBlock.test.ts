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

  it('shows failures honestly and allows another refresh', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()

    expect(wrapper.text()).toContain('Weather alerts unavailable')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })
})

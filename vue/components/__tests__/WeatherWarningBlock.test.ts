// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sampleMock = vi.fn()

vi.mock('../../data/weatherAlerts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/weatherAlerts')>()
  return {
    ...actual,
    sampleWeatherAlerts: (...args: unknown[]) => sampleMock(...args),
  }
})

import WeatherWarningBlock from '../WeatherWarningBlock.vue'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  sampleMock.mockReset().mockResolvedValue([])
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function response(severities: string[]) {
  return {
    ok: true,
    json: async () => ({
      features: severities.map((severity, index) => ({
        id: `https://api.weather.gov/alerts/alert-${index}`,
        properties: {
          event: 'Winter Storm Warning',
          severity,
          headline: 'Heavy snow expected around Lake Tahoe',
          areaDesc: 'Greater Lake Tahoe Area',
          affectedZones: [
            'https://api.weather.gov/zones/forecast/CAZ072',
            'https://api.weather.gov/zones/forecast/NVZ002',
          ],
          description: 'Travel could be very difficult.',
          instruction: 'Avoid unnecessary travel.',
          urgency: 'Expected',
          certainty: 'Likely',
          onset: '2026-09-08T18:00:00-07:00',
          ends: '2026-09-09T06:00:00-07:00',
          senderName: 'NWS Reno NV',
        },
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

  it('renders an alert card whose full text can be expanded', async () => {
    fetchMock.mockResolvedValue(response(['Severe']))
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()

    const card = wrapper.get('.weather-alert-card')
    expect(card.text()).toContain('Winter Storm Warning')
    const detailsToggle = card.get('.weather-alert-card__details-toggle')
    expect(detailsToggle.text()).toBe('Show more')
    expect(detailsToggle.attributes('aria-expanded')).toBe('false')
    expect(card.find('.weather-alert-card__meta').exists()).toBe(false)

    await detailsToggle.trigger('click')
    expect(detailsToggle.text()).toBe('Show less')
    expect(detailsToggle.attributes('aria-expanded')).toBe('true')
    expect(card.get('.weather-alert-card__meta').text()).toContain('Greater Lake Tahoe Area, California')
    expect(card.get('.weather-alert-card__meta').text()).toContain('Greater Lake Tahoe Area, Nevada')

    const toggle = card.findAll('.weather-alert-card__toggle')[1]
    expect(toggle.text()).toBe('Full text')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(card.find('pre').exists()).toBe(false)

    await toggle.trigger('click')
    expect(toggle.text()).toBe('Hide full text')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(card.get('pre').text()).toContain('Travel could be very difficult.')
  })

  it('chooses the highest severity across all active alerts', async () => {
    fetchMock.mockResolvedValue(response(['Minor', 'Extreme', 'Severe']))
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()

    expect(wrapper.text()).toContain('3 active alerts')
    expect(wrapper.text()).toContain('Highest severity: Extreme')
  })

  it('does not display the block when there are no active alerts', async () => {
    fetchMock.mockResolvedValue(response([]))
    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()

    expect(wrapper.find('.weather-warning').exists()).toBe(false)
    expect(wrapper.find('.weather-warning__list').exists()).toBe(false)
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

  it('hides stale cards while a refresh is in progress or has failed', async () => {
    let rejectRefresh!: (reason?: unknown) => void
    const pendingRefresh = new Promise<never>((_, reject) => {
      rejectRefresh = reject
    })
    fetchMock
      .mockResolvedValueOnce(response(['Severe']))
      .mockImplementationOnce(() => pendingRefresh)

    const wrapper = mount(WeatherWarningBlock)
    await flushPromises()
    expect(wrapper.find('.weather-warning__list').exists()).toBe(true)

    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Checking weather alerts')
    expect(wrapper.find('.weather-warning__list').exists()).toBe(false)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()

    rejectRefresh(new Error('boom'))
    await flushPromises()
    expect(wrapper.text()).toContain('Weather alerts unavailable')
    expect(wrapper.find('.weather-warning__list').exists()).toBe(false)
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('treats a sample-load failure as an error state', async () => {
    sampleMock.mockRejectedValueOnce(new Error('sample failed'))

    const wrapper = mount(WeatherWarningBlock, { props: { sampleAlert: true } })
    await flushPromises()

    expect(wrapper.text()).toContain('Weather alerts unavailable')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  describe('sample alert (TERC-66)', () => {
    // This file mocks sampleWeatherAlerts (see the top); these tests want the
    // real archived fixture behind it.
    const useRealSample = async () => {
      const real = await vi.importActual<typeof import('../../data/weatherAlerts')>('../../data/weatherAlerts')
      sampleMock.mockImplementation(() => real.sampleWeatherAlerts())
    }

    it('renders the archived advisory without touching the network, labelled as a sample', async () => {
      await useRealSample()
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
      await useRealSample()
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

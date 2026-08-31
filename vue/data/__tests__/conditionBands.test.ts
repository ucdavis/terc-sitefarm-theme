// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from './condition-bands.fixture.json'
import {
  adaptConditionBands,
  loadConditionBands,
  resetConditionBandsForTests,
} from '../conditionBands'
import {
  assessMetric,
  applyConditionBands,
  bandsFromSite,
  resetBandsForTests,
} from '../../config/qualitative'
import { miscCache } from '../../core/cache'

beforeEach(() => {
  resetConditionBandsForTests()
  resetBandsForTests()
  miscCache.delete('condition-bands')
})
afterEach(() => vi.unstubAllGlobals())

describe('adaptConditionBands', () => {
  it('adapts the seeded vocabulary (fixture captured from the local site)', () => {
    const bands = adaptConditionBands(fixture)
    expect(Object.keys(bands).sort()).toEqual(['turbidity', 'waterTemp'])
    expect(bands.turbidity!.map((b) => b.label)).toEqual([
      'Crystal clear',
      'Clear',
      'Slightly cloudy',
      'Murky',
    ])
    expect(bands.turbidity![3].max).toBe(Number.POSITIVE_INFINITY)
    expect(bands.waterTemp![0]).toMatchObject({ label: 'Very cold', tone: 'caution', max: 50 })
  })

  it('orders bands by value, never by term order — null max sorts last', () => {
    const bands = adaptConditionBands({
      data: [
        { attributes: { name: 'Top', field_metric_key: 'turbidity', field_band_max_value: null, field_band_tone: 'caution', field_band_sentence: 's' } },
        { attributes: { name: 'High', field_metric_key: 'turbidity', field_band_max_value: 20, field_band_tone: 'fair', field_band_sentence: 's' } },
        { attributes: { name: 'Low', field_metric_key: 'turbidity', field_band_max_value: 1, field_band_tone: 'good', field_band_sentence: 's' } },
      ],
    })
    expect(bands.turbidity!.map((b) => b.label)).toEqual(['Low', 'High', 'Top'])
  })

  it('skips terms with unknown metrics, bad tones, or missing sentences', () => {
    const bands = adaptConditionBands({
      data: [
        { attributes: { name: 'A', field_metric_key: 'not_a_metric', field_band_max_value: 1, field_band_tone: 'good', field_band_sentence: 's' } },
        { attributes: { name: 'B', field_metric_key: 'turbidity', field_band_max_value: 1, field_band_tone: 'sparkly', field_band_sentence: 's' } },
        { attributes: { name: 'C', field_metric_key: 'turbidity', field_band_max_value: 1, field_band_tone: 'good', field_band_sentence: '' } },
        { attributes: { name: 'D', field_metric_key: 'turbidity', field_band_max_value: 1, field_band_tone: 'good', field_band_sentence: 'ok' } },
      ],
    })
    expect(bands.turbidity!.map((b) => b.label)).toEqual(['D'])
  })
})

describe('site bands wired into assessMetric', () => {
  it('editor bands replace the placeholders reactively', () => {
    expect(assessMetric('turbidity', 0.5)?.label).toBe('Crystal clear')
    applyConditionBands({
      turbidity: [
        { label: 'Gin clear', sentence: 'Editors renamed this.', tone: 'good', max: 1 },
        { label: 'Cloudy', sentence: 'And this.', tone: 'fair', max: Number.POSITIVE_INFINITY },
      ],
    })
    expect(assessMetric('turbidity', 0.5)?.label).toBe('Gin clear')
    expect(bandsFromSite.value).toBe(true)
  })

  it('a metric missing from site content keeps its static bands', () => {
    applyConditionBands({
      turbidity: [{ label: 'Only band', sentence: 's', tone: 'good', max: Number.POSITIVE_INFINITY }],
    })
    // waterTemp not in the site payload -> static placeholder still answers
    expect(assessMetric('waterTemp', 70)?.label).toBe('Pleasant')
  })

  it('loadConditionBands applies fetched bands once, and failure keeps the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }))
    await loadConditionBands()
    expect(assessMetric('turbidity', 0.5)?.label).toBe('Crystal clear')
    expect(bandsFromSite.value).toBe(true)

    resetBandsForTests()
    resetConditionBandsForTests()
    miscCache.delete('condition-bands')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await loadConditionBands()
    expect(bandsFromSite.value).toBe(false)
    expect(assessMetric('turbidity', 0.5)?.label).toBe('Crystal clear') // static
  })
})

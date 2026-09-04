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
import { brandChipColors } from '../../config/brandPalette'

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

  it('handles decimal-field string values (tercdev serializes max as strings)', () => {
    const bands = adaptConditionBands({
      data: [
        { attributes: { name: 'Top', field_metric_key: 'wind_speed', field_band_max_value: null, field_band_tone: 'caution', field_band_sentence: 's' } },
        { attributes: { name: 'Windy', field_metric_key: 'wind_speed', field_band_max_value: '20.00', field_band_tone: 'caution', field_band_sentence: 's' } },
        { attributes: { name: 'Breezy', field_metric_key: 'wind_speed', field_band_max_value: '12.00', field_band_tone: 'fair', field_band_sentence: 's' } },
        { attributes: { name: 'Light air', field_metric_key: 'wind_speed', field_band_max_value: '5.00', field_band_tone: 'good', field_band_sentence: 's' } },
      ],
    })
    // Lexicographic sorting would give '12' < '20' < '5' — numeric must win.
    expect(bands.windSpeed!.map((b) => b.label)).toEqual(['Light air', 'Breezy', 'Windy', 'Top'])
    expect(bands.windSpeed![1].max).toBe(12)
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

  it('a metric without an open-ended top band falls back to static bands', () => {
    applyConditionBands({
      // All finite maxes — an editor deleted the blank-max "Murky" term.
      turbidity: [
        { label: 'Crystal clear', sentence: 's', tone: 'good', max: 1 },
        { label: 'Slightly cloudy', sentence: 's', tone: 'fair', max: 20 },
      ],
      // Valid set: terminal Infinity band present.
      conductivity: [
        { label: 'Site band', sentence: 's', tone: 'good', max: Number.POSITIVE_INFINITY },
      ],
    })
    // 500 NTU must NOT be rated "Slightly cloudy" — static "Murky" answers.
    expect(assessMetric('turbidity', 500)?.label).toBe('Murky')
    expect(assessMetric('conductivity', 99)?.label).toBe('Site band')
  })

  it('a failed load re-arms the guard so a later call can retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await loadConditionBands()
    expect(bandsFromSite.value).toBe(false)

    miscCache.delete('condition-bands')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }))
    await loadConditionBands() // must not be blocked by the failed first try
    expect(bandsFromSite.value).toBe(true)
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

/** A minimal bands body with one term that references a brand term. */
const TAHOE_UUID = 'aaaaaaaa-0000-4000-8000-000000000001'
const bodyWithBrand = (brandRef: { id: string } | null, included: unknown[] = []) => ({
  data: [
    {
      id: 'bbbbbbbb-0000-4000-8000-000000000001',
      attributes: {
        name: 'Pleasant',
        field_metric_key: 'water_temp',
        field_band_max_value: null,
        field_band_tone: 'good',
        field_band_sentence: 'Comfortable swimming.',
      },
      relationships: { field_band_brand_color: { data: brandRef ? { type: 'taxonomy_term--sf_branding', ...brandRef } : null } },
    },
  ],
  included: included as never[],
})
const tahoeTerm = { type: 'taxonomy_term--sf_branding', id: TAHOE_UUID, attributes: { name: 'Tahoe', field_sf_brand_color: 'tahoe' } }

describe('brand colors on bands (TERC-60)', () => {
  it('reads the referenced brand term\'s identifier and carries it on the band', () => {
    const bands = adaptConditionBands(bodyWithBrand({ id: TAHOE_UUID }, [tahoeTerm]))
    expect(bands.waterTemp?.[0].brand).toBe('tahoe')
    applyConditionBands(bands)
    expect(assessMetric('waterTemp', 70)?.brand).toBe('tahoe')
  })

  it('no reference = no brand (tone default), with no noise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bands = adaptConditionBands(bodyWithBrand(null))
    expect(bands.waterTemp?.[0]).not.toHaveProperty('brand')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns, naming the band, and falls back when the identifier is not in the audited palette', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const offPalette = { ...tahoeTerm, attributes: { field_sf_brand_color: 'neon-lime' } }
    const bands = adaptConditionBands(bodyWithBrand({ id: TAHOE_UUID }, [offPalette]))
    expect(bands.waterTemp?.[0].brand).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('"Pleasant"')
    expect(String(warn.mock.calls[0][0])).toContain('"neon-lime"')
    warn.mockRestore()
  })

  it('warns and falls back when the referenced term did not come back in `included`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bands = adaptConditionBands(bodyWithBrand({ id: TAHOE_UUID }))
    expect(bands.waterTemp?.[0].brand).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('never takes a hex from content — only identifiers resolve', () => {
    const hexTerm = { ...tahoeTerm, attributes: { field_sf_brand_color: '#ff0000' } }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bands = adaptConditionBands(bodyWithBrand({ id: TAHOE_UUID }, [hexTerm]))
    expect(bands.waterTemp?.[0].brand).toBeUndefined()
    expect(brandChipColors('#ff0000')).toBeNull()
    vi.restoreAllMocks()
  })

  it('asks for the brand terms with the bands, and falls back to a plain request on a site without the field', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400 }) // include rejected: field not there yet
      .mockResolvedValueOnce({ ok: true, json: async () => fixture })
    vi.stubGlobal('fetch', fetchMock)
    await loadConditionBands()
    expect(bandsFromSite.value).toBe(true)
    expect(String(fetchMock.mock.calls[0][0])).toContain('include=field_band_brand_color')
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('include=')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('add-brand-color-field.php')
    warn.mockRestore()
  })

  it('any other failure of the include request is a real failure, not a silent downgrade', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadConditionBands()
    expect(bandsFromSite.value).toBe(false)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

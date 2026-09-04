// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StationCard from '../StationCard.vue'
import { TONE_COLORS, brandChipColors } from '../../config/brandPalette'

/**
 * Band chips take their colors from config/brandPalette.ts as custom
 * properties (TERC-60): a brand when the band carries one, the tone
 * default otherwise. The component owns no color of its own.
 */
const card = (assessment: Record<string, unknown>) =>
  mount(StationCard, {
    props: { label: 'Water temperature', value: 70, unit: '°F', assessment: assessment as never },
  })

describe('StationCard band chip colors', () => {
  it('paints a branded band with its audited brand treatment', () => {
    const w = card({ label: 'Pleasant', sentence: 'Nice.', tone: 'good', brand: 'tahoe' })
    const style = (w.get('.assess').element as HTMLElement).style
    const tahoe = brandChipColors('tahoe')!
    expect(style.getPropertyValue('--band-bg')).toBe(tahoe.bg)
    expect(style.getPropertyValue('--band-fg')).toBe(tahoe.fg)
  })

  it('paints an unbranded band with its tone default', () => {
    const w = card({ label: 'Cold', sentence: 'Brr.', tone: 'caution' })
    const style = (w.get('.assess').element as HTMLElement).style
    expect(style.getPropertyValue('--band-bg')).toBe(TONE_COLORS.caution.bg)
    expect(style.getPropertyValue('--band-fg')).toBe(TONE_COLORS.caution.fg)
  })
})

import { describe, expect, it } from 'vitest'
import { AA_TEXT, contrastRatio, relativeLuminance } from '../../core/contrast'
import {
  BRAND_PALETTE,
  TONE_COLORS,
  bandChipColors,
  bandChipStyle,
  brandChipColors,
  chipTreatment,
  isUsableBrand,
} from '../brandPalette'

/**
 * The accessibility audit (TERC-60): every chip treatment code can hand to
 * the UI — tone defaults and every brand identifier — meets WCAG AA for
 * normal text, by computation. If a palette edit ever breaks that, this
 * fails before it ships.
 */

/** `field_sf_brand_color` allowed values, mirrored from SiteFarm's
 *  field.storage.taxonomy_term.field_sf_brand_color.yml. */
const SITEFARM_IDENTIFIERS = [
  'rec-pool', 'tahoe', 'gunrock', 'bodega', 'rain', 'arboretum', 'putah-creek', 'delta',
  'farmers-market', 'sage', 'quad', 'redwood', 'golden-state', 'sunflower', 'poppy',
  'california', 'rose', 'strawberry', 'double-decker', 'merlot', 'thiebaud-icing', 'redbud',
  'pinot', 'cabernet', 'centennial-walk-gray', 'primary', 'secondary', 'admin-blue',
]

describe('brand palette audit', () => {
  it('covers every identifier an editor can pick in SiteFarm', () => {
    for (const id of SITEFARM_IDENTIFIERS) expect(BRAND_PALETTE[id], id).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each(Object.entries(BRAND_PALETTE))('%s chip is AA (≥ 4.5:1) and its text stays a shade of the brand', (id, hex) => {
    const chip = brandChipColors(id)
    expect(chip, `${id} must be usable`).not.toBeNull()
    expect(contrastRatio(chip!.fg, chip!.bg)).toBeGreaterThanOrEqual(AA_TEXT)
    // A tint behind dark text — light enough to read as a chip on a white card.
    expect(relativeLuminance(chip!.bg)).toBeGreaterThan(0.6)
    // The text is the brand itself or a darkening of it, never a hue swap.
    expect(relativeLuminance(chip!.fg)).toBeLessThanOrEqual(relativeLuminance(hex) + 1e-9)
    expect(isUsableBrand(id)).toBe(true)
  })

  it.each(Object.entries(TONE_COLORS))('tone default "%s" is AA', (_tone, c) => {
    expect(contrastRatio(c.fg, c.bg)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('leaves an already-dark brand as its own text color', () => {
    // Aggie Blue on its tint passes without darkening.
    expect(chipTreatment(BRAND_PALETTE.primary)?.fg).toBe(BRAND_PALETTE.primary)
  })

  it('rejects identifiers outside the palette', () => {
    expect(brandChipColors('unitrans-red')).toBeNull() // legacy class name, not an identifier
    expect(brandChipColors('#ff0000')).toBeNull() // a hex from content is never honoured
    expect(isUsableBrand('nope')).toBe(false)
  })

  it('band colors: brand when set and usable, else the tone default', () => {
    expect(bandChipColors({ tone: 'good', brand: 'tahoe' })).toEqual(brandChipColors('tahoe'))
    expect(bandChipColors({ tone: 'good', brand: 'not-a-brand' })).toEqual(TONE_COLORS.good)
    expect(bandChipColors({ tone: 'caution' })).toEqual(TONE_COLORS.caution)
  })

  it('exposes the colors to components as custom properties only', () => {
    const style = bandChipStyle({ tone: 'info', brand: 'double-decker' })
    expect(Object.keys(style).sort()).toEqual(['--band-bg', '--band-fg'])
    expect(style['--band-fg']).toBe(brandChipColors('double-decker')!.fg)
  })
})

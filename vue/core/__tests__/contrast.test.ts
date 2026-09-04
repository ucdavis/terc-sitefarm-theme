import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, mix, relativeLuminance, rgbToHex } from '../contrast'

/**
 * Reference points from the WCAG definition itself, so the audit in
 * brandPalette.test.ts rests on arithmetic checked against known values.
 */
describe('contrast', () => {
  it('parses short and long hex forms', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#022851')).toEqual([2, 40, 81])
    expect(rgbToHex([2, 40, 81])).toBe('#022851')
    expect(() => hexToRgb('blue')).toThrow()
  })

  it('computes WCAG relative luminance', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6)
    // sRGB mid-gray: (0.5 + 0.055) / 1.055 ^ 2.4
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3)
  })

  it('computes the contrast ratio, order-independently', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 6)
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 6)
    // The classic AA boundary: #767676 passes on white, #777 does not.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5)
  })

  it('mixes linearly and clamps the amount', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 2)).toBe('#ffffff')
  })
})

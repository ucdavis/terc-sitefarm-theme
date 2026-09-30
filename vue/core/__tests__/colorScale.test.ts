import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCALE,
  FULL_SPECTRUM_STOPS,
  TEMPERATURE_SCALE,
  WAVE_SCALE,
  formatScaleValue,
  scaleColor,
  scaleGradientCss,
  type ColorScale,
} from '../colorScale'

const SIMPLE: ColorScale = {
  name: 'Test',
  unit: 'x',
  min: 0,
  max: 10,
  stops: ['#000000', '#ffffff'],
}

describe('scaleColor', () => {
  it('returns the endpoint colors at min and max', () => {
    expect(scaleColor(SIMPLE, 0)).toEqual([0, 0, 0])
    expect(scaleColor(SIMPLE, 10)).toEqual([255, 255, 255])
  })

  it('clamps values outside the scale range', () => {
    expect(scaleColor(SIMPLE, -100)).toEqual([0, 0, 0])
    expect(scaleColor(SIMPLE, 100)).toEqual([255, 255, 255])
  })

  it('interpolates linearly between stops', () => {
    expect(scaleColor(SIMPLE, 5)).toEqual([128, 128, 128])
  })

  it('temperature scale spans 40-80 °F cool-to-warm', () => {
    expect(TEMPERATURE_SCALE.min).toBe(40)
    expect(TEMPERATURE_SCALE.max).toBe(80)
    const [rCold] = scaleColor(TEMPERATURE_SCALE, 40)
    const [rWarm] = scaleColor(TEMPERATURE_SCALE, 80)
    expect(rCold).toBeLessThan(rWarm) // blue end vs red end
  })
})

describe('scaleGradientCss', () => {
  it('builds a gradient from the same stops the renderer uses', () => {
    expect(scaleGradientCss(SIMPLE)).toBe('linear-gradient(to top, #000000, #ffffff)')
  })
})

// TERC-81: wave height uses the same full-spectrum gradation as temperature,
// so both forecast maps read blue = low, red = high. Pinned so the two can
// never quietly drift back into looking like different kinds of map.
describe('full-spectrum forecast scales (TERC-81)', () => {
  it('wave height and temperature share the full-spectrum stops', () => {
    expect(WAVE_SCALE.stops).toEqual([...FULL_SPECTRUM_STOPS])
    expect(TEMPERATURE_SCALE.stops).toEqual([...FULL_SPECTRUM_STOPS])
  })

  it('wave height runs navy at calm to red at the top of its range', () => {
    const hex = (rgb: [number, number, number]) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
    expect(hex(scaleColor(WAVE_SCALE, 0))).toBe(FULL_SPECTRUM_STOPS[0])
    expect(hex(scaleColor(WAVE_SCALE, 5))).toBe(FULL_SPECTRUM_STOPS[FULL_SPECTRUM_STOPS.length - 1])
  })

  it('keeps each scale its own copy, so mutating one cannot recolour the other', () => {
    expect(WAVE_SCALE.stops).not.toBe(TEMPERATURE_SCALE.stops)
  })

  it('leaves the wave range unchanged at 0-5 ft', () => {
    expect([WAVE_SCALE.min, WAVE_SCALE.max, WAVE_SCALE.unit]).toEqual([0, 5, 'ft'])
  })
})

// TERC-100: the science team asked for current speed in mph with the model's
// own m/s in parentheses. Both numbers come from this one scale, which is
// what keeps the colorbar, the map and the spoken text alternative from ever
// naming different units.
describe('a scale with a second unit (TERC-100)', () => {
  it('reads current speed in mph', () => {
    expect(CURRENT_SCALE.unit).toBe('mph')
    expect(CURRENT_SCALE.secondary?.unit).toBe('m/s')
  })

  it('tops out at 1.1 mph, above every speed the model has published', () => {
    // Highest single cell across the published window was 0.82 mph
    // (0.367 m/s, measured 2026-09-30); the legend must sit above it so the
    // fastest water is a color on the bar and not a clipped maximum.
    expect(CURRENT_SCALE.max).toBe(1.1)
    expect(CURRENT_SCALE.min).toBe(0)
  })

  it('puts a tick on each 0.1 mph — a colorbar whose labels are exact', () => {
    const step = (CURRENT_SCALE.max - CURRENT_SCALE.min) / (CURRENT_SCALE.stops.length - 1)
    expect(step).toBeCloseTo(0.1, 10)
  })

  it('writes both units, the second in parentheses', () => {
    expect(formatScaleValue(CURRENT_SCALE, 0.34, 2)).toBe('0.34 mph (0.15 m/s)')
    expect(formatScaleValue(CURRENT_SCALE, 1.1, 1)).toBe('1.1 mph (0.49 m/s)')
    expect(formatScaleValue(CURRENT_SCALE, 0, 2)).toBe('0.00 mph (0.00 m/s)')
  })

  it('converts to the unit the model actually publishes', () => {
    // 0.5 mph is 0.22 m/s: the parenthesised number must be a conversion,
    // not the same digits with a different label.
    expect(formatScaleValue(CURRENT_SCALE, 0.5, 2)).toBe('0.50 mph (0.22 m/s)')
  })

  it('says nothing extra for the scales that have one unit', () => {
    expect(formatScaleValue(TEMPERATURE_SCALE, 62.4, 0)).toBe('62 °F')
    expect(formatScaleValue(WAVE_SCALE, 1.25, 1)).toBe('1.3 ft')
  })
})

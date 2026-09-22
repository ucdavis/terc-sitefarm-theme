import { describe, expect, it } from 'vitest'
import {
  FULL_SPECTRUM_STOPS,
  TEMPERATURE_SCALE,
  WAVE_SCALE,
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

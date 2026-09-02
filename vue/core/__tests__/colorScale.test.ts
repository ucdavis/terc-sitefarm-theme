import { describe, expect, it } from 'vitest'
import { TEMPERATURE_SCALE, scaleColor, scaleGradientCss, type ColorScale } from '../colorScale'

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

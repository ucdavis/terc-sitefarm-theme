// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GradientLegend from '../GradientLegend.vue'
import {
  CURRENT_SCALE,
  TEMPERATURE_SCALE,
  WAVE_SCALE,
  scaleGradientCss,
  type ColorScale,
} from '../../core/colorScale'

/**
 * The colorbar is the only place a sighted visitor can turn a color on the
 * map back into a number, so it has to agree with the scale exactly — and,
 * since TERC-100, say current speed in both mph and the model's own m/s.
 */
const mountLegend = (scale: ColorScale, variant?: 'floating' | 'panel') =>
  mount(GradientLegend, { props: { scale, ...(variant ? { variant } : {}) } })

const tickTexts = (w: ReturnType<typeof mountLegend>) =>
  w.findAll('.legend-tick-value').map((s) => s.text())

const secondTexts = (w: ReturnType<typeof mountLegend>) =>
  w.findAll('.legend-tick-second').map((s) => s.text())

describe('GradientLegend', () => {
  it('paints the bar from the same stops the field renderer uses', () => {
    const bar = mountLegend(CURRENT_SCALE, 'panel').get('.legend-bar')
    expect(bar.attributes('style')).toContain(scaleGradientCss(CURRENT_SCALE))
    // The gradient carries no information a screen reader can use; the ticks do.
    expect(bar.attributes('aria-hidden')).toBe('true')
  })

  it('labels one tick per color stop in the panel variant', () => {
    const ticks = tickTexts(mountLegend(CURRENT_SCALE, 'panel'))
    expect(ticks).toHaveLength(CURRENT_SCALE.stops.length)
  })

  // Vue condenses a leading space inside an inline tag, so the old markup
  // ("{{ tick }}<em> {{ unit }}</em>") rendered "100ft/min" (TERC-100).
  it('puts a space between the number and its unit', () => {
    expect(tickTexts(mountLegend(WAVE_SCALE, 'panel'))[0]).toBe('5.0 ft')
    expect(tickTexts(mountLegend(TEMPERATURE_SCALE, 'panel'))[0]).toBe('80 °F')
  })

  it('runs the ticks high to low, so they read with the vertical bar', () => {
    const ticks = tickTexts(mountLegend(TEMPERATURE_SCALE, 'panel'))
    expect(ticks[0]).toContain('80 °F')
    expect(ticks[ticks.length - 1]).toContain('40 °F')
  })
})

// TERC-100. Lake currents run about 0.03–0.12 mph, so the numbers are small
// and the second unit is what lets anyone check them against the model's own
// output. Both units come from the scale, never from a copy in the template.
describe('a scale with a second unit (TERC-100)', () => {
  it('labels every tick in mph with m/s in parentheses', () => {
    const w = mountLegend(CURRENT_SCALE, 'panel')
    const ticks = tickTexts(w)
    const seconds = secondTexts(w)
    expect(ticks[0]).toBe('1.1 mph')
    expect(seconds[0]).toBe('(0.49 m/s)')
    expect(ticks[ticks.length - 1]).toBe('0.0 mph')
    expect(seconds[seconds.length - 1]).toBe('(0.00 m/s)')
    expect(seconds).toHaveLength(ticks.length)
    expect(ticks.every((t) => /^\d\.\d mph$/.test(t))).toBe(true)
  })

  it('steps by a clean 0.1 mph, so no tick label is a rounded lie', () => {
    const mph = tickTexts(mountLegend(CURRENT_SCALE, 'panel')).map((t) =>
      Number.parseFloat(t),
    )
    expect(mph).toEqual([1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0])
  })

  it('announces both units at both ends of the scale', () => {
    const label = mountLegend(CURRENT_SCALE, 'panel').get('[role="group"]').attributes('aria-label')
    expect(label).toBe('Current speed color scale, from 0.0 mph (0.00 m/s) to 1.1 mph (0.49 m/s)')
  })

  it('leaves the single-unit scales alone', () => {
    expect(tickTexts(mountLegend(WAVE_SCALE, 'panel'))[0]).toBe('5.0 ft')
    expect(secondTexts(mountLegend(WAVE_SCALE, 'panel'))).toEqual([])
    expect(mountLegend(WAVE_SCALE, 'panel').find('.legend-tick-second').exists()).toBe(false)
    expect(
      mountLegend(TEMPERATURE_SCALE, 'panel').get('[role="group"]').attributes('aria-label'),
    ).toBe('Surface temperature color scale, from 40 °F to 80 °F')
  })

  it('keeps the compact floating card to one number per tick', () => {
    // Its ticks are bare numbers with the unit in a footer below the bar —
    // a second unit there would have nothing to attach itself to.
    const w = mountLegend(CURRENT_SCALE, 'floating')
    expect(tickTexts(w)).toEqual(['1.1', '0.8', '0.6', '0.3', '0.0'])
    expect(secondTexts(w)).toEqual([])
    expect(w.get('.legend-unit').text()).toBe('mph')
  })
})

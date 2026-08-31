// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/** Chart.js needs a real canvas context; capture its config instead. */
const chartConfigs = vi.hoisted(() => [] as Record<string, unknown>[])
vi.mock('chart.js', () => {
  class Chart {
    static register() {}
    constructor(_el: unknown, config: Record<string, unknown>) {
      chartConfigs.push(config)
    }
    destroy() {}
  }
  return {
    Chart,
    LineController: {},
    LineElement: {},
    PointElement: {},
    LinearScale: {},
    TimeScale: {},
    Tooltip: {},
    Legend: {},
    Filler: {},
  }
})
vi.mock('chartjs-adapter-date-fns', () => ({}))

import TimeSeriesChart from '../TimeSeriesChart.vue'

// 2026-01-15T00:30Z is Jan 14, 4:30 PM at the lake (PST, UTC-8) — a viewer
// in any timezone must see the lake wall time.
const WINTER_INSTANT = new Date('2026-01-15T00:30:00Z')
const SUMMER_INSTANT = new Date('2026-07-15T00:30:00Z') // Jul 14, 5:30 PM PDT

const SERIES = [
  {
    label: 'Dollar Point',
    color: '#0e6ba8',
    points: [
      { x: WINTER_INSTANT, y: 41.2 },
      { x: SUMMER_INSTANT, y: null },
    ],
  },
  { label: 'Rubicon', color: '#1c8c62', points: [{ x: SUMMER_INSTANT, y: null }] },
]

function lastConfig() {
  return chartConfigs[chartConfigs.length - 1] as {
    options: {
      plugins: { tooltip: { callbacks: { title: (items: { parsed: { x: number } }[]) => string } } }
      scales: { x: { ticks: { callback: (v: unknown) => string } } }
    }
  }
}

describe('TimeSeriesChart', () => {
  it('formats tooltips and axis ticks in lake time, not viewer-local (TERC-43)', () => {
    mount(TimeSeriesChart, { props: { series: SERIES, unit: '°F', title: 'Water temperature' } })
    const cfg = lastConfig()
    expect(cfg.options.plugins.tooltip.callbacks.title([{ parsed: { x: WINTER_INSTANT.getTime() } }]))
      .toBe('Jan 14, 4:30 PM (lake time)')
    expect(cfg.options.plugins.tooltip.callbacks.title([{ parsed: { x: SUMMER_INSTANT.getTime() } }]))
      .toBe('Jul 14, 5:30 PM (lake time)') // DST respected
    expect(cfg.options.scales.x.ticks.callback(WINTER_INSTANT.getTime())).toBe('Jan 14')
  })

  it('exposes a screen-reader summary of each series and hides the canvas', () => {
    const w = mount(TimeSeriesChart, {
      props: { series: SERIES, unit: '°F', title: 'Water temperature' },
    })
    const box = w.find('.chart-box')
    expect(box.attributes('role')).toBe('img')
    const label = box.attributes('aria-label')!
    expect(label).toContain('Water temperature time-series chart')
    expect(label).toContain('Dollar Point: latest 41.2 °F at Jan 14, 4:30 PM lake time')
    expect(label).toContain('Rubicon: no data in this range')
    expect(w.find('canvas').attributes('aria-hidden')).toBe('true')
  })
})

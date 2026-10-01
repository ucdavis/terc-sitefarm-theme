// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import ConditionLevels from '../ConditionLevels.vue'
import { applyConditionBands, resetBandsForTests, type QualityMetric } from '../../config/qualitative'
import {
  declareVisibleMetrics,
  resetVisibleMetricsForTests,
} from '../../composables/useVisibleMetrics'

/**
 * TERC-95. The panel answers "what do the other levels mean?", so what
 * matters is that it shows EVERY level with its range, in order, and that it
 * describes the bands actually in force — not a copy that can go stale.
 */
const mountPanel = () => mount(ConditionLevels)

async function open(w: ReturnType<typeof mountPanel>) {
  await w.find('.cl-toggle').trigger('click')
  return w
}

afterEach(() => {
  resetBandsForTests()
  resetVisibleMetricsForTests()
})

/** The panel as a view renders it: inside something declaring what is shown. */
function mountUnderView(metrics: QualityMetric[]) {
  const declared = ref(metrics)
  return mount(
    defineComponent({
      setup() {
        declareVisibleMetrics(declared)
        return () => h(ConditionLevels)
      },
    }),
  )
}

describe('ConditionLevels', () => {
  it('starts collapsed and toggles, reporting its state to assistive tech', async () => {
    const w = mountPanel()
    const btn = w.find('.cl-toggle')
    expect(btn.attributes('aria-expanded')).toBe('false')
    expect(btn.attributes('aria-controls')).toBe(w.find('.cl-panel').attributes('id'))
    expect(w.find('.cl-panel').attributes('style')).toContain('display: none')

    await open(w)
    expect(w.find('.cl-toggle').attributes('aria-expanded')).toBe('true')
    expect(w.find('.cl-panel').attributes('style') ?? '').not.toContain('display: none')
  })

  it('previews what is inside: real chip colors plus the counts, in words too', async () => {
    const w = mountPanel()
    const swatches = w.findAll('.cl-swatch')
    expect(swatches.length).toBeGreaterThan(0)
    // The actual band colors, not a decorative palette of their own.
    expect(swatches[0].attributes('style')).toContain('--band-bg')
    // Decorative: the hint carries the same promise as text, so a screen
    // reader is not read a row of empty swatches.
    expect(w.get('.cl-swatches').attributes('aria-hidden')).toBe('true')
    expect(w.get('.cl-hint').text()).toMatch(/\d+ levels across \d+ measurements/)

    // Both disappear once the panel is open — the panel itself is the answer.
    await open(w)
    expect(w.find('.cl-swatches').exists()).toBe(false)
    expect(w.find('.cl-hint').exists()).toBe(false)
  })

  it('lists every metric, each band in order, with ranges that meet end to end', async () => {
    const w = await open(mountPanel())
    const captions = w.findAll('caption').map((c) => c.text())
    expect(captions).toContain('Water temperature')
    expect(captions).toContain('Wave height')
    expect(captions).toHaveLength(8)

    const temp = w.findAll('table').find((t) => t.find('caption').text() === 'Water temperature')!
    const rows = temp.findAll('tbody tr').map((r) => r.findAll('td').map((d) => d.text()))
    expect(rows[0][0]).toBe('Very cold')
    // The lowest band is open at the bottom, the highest open at the top, and
    // each range starts where the previous one ended.
    expect(rows[0][1]).toBe('Below 50 °F')
    expect(rows[1][1]).toBe('50–60 °F')
    expect(rows[rows.length - 1][1]).toBe('75 °F and above')
    // The editor's sentence, not a paraphrase.
    expect(rows[0][2]).toContain('Dangerously cold')
  })

  it('names the level in text inside the chip, so color is never the only cue', async () => {
    const w = await open(mountPanel())
    const chip = w.find('.cl-chip')
    expect(chip.text()).toBe('Very cold')
    expect(chip.attributes('style')).toContain('--band-bg')
  })

  it('uses tables with column headers, so the ranges are navigable', async () => {
    const w = await open(mountPanel())
    const headers = w.find('table').findAll('th')
    expect(headers.map((h) => h.text())).toEqual(['Level', 'Range', 'What it means'])
    expect(headers.every((h) => h.attributes('scope') === 'col')).toBe(true)
  })

  it('describes the bands in force, so editor-owned bands replace the built-ins here too', async () => {
    applyConditionBands({
      waterTemp: [
        { max: 60, label: 'Chilly', sentence: 'Editor wrote this.', tone: 'caution' },
        { max: Number.POSITIVE_INFINITY, label: 'Fine', sentence: 'And this.', tone: 'good' },
      ],
    })
    const w = await open(mountPanel())
    const temp = w.findAll('table').find((t) => t.find('caption').text() === 'Water temperature')!
    const rows = temp.findAll('tbody tr').map((r) => r.findAll('td').map((d) => d.text()))
    expect(rows).toEqual([
      ['Chilly', 'Below 60 °F', 'Editor wrote this.'],
      ['Fine', '60 °F and above', 'And this.'],
    ])
    // Untouched metrics keep theirs — the same per-metric fallback the
    // readings use.
    const waves = w.findAll('table').find((t) => t.find('caption').text() === 'Wave height')!
    expect(waves.findAll('tbody tr')[0].text()).toContain('Calm')
  })

  it('makes a table keyboard-scrollable only when it actually overflows', async () => {
    const w = await open(mountPanel())
    const box = w.find('.cl-scroll')
    // happy-dom reports no layout, so nothing overflows: the containers must
    // then stay OUT of the tab order rather than adding dead stops. The
    // overflowing case is verified live (320px viewport, Playwright).
    expect(box.attributes('tabindex')).toBeUndefined()
    expect(box.attributes('role')).toBeUndefined()
  })

  it('drops trailing zeros from thresholds — 0.50 is a number, "0.5" is a threshold', async () => {
    const w = await open(mountPanel())
    const waves = w.findAll('table').find((t) => t.find('caption').text() === 'Wave height')!
    expect(waves.findAll('tbody tr')[0].findAll('td')[1].text()).toBe('Below 0.5 ft')
  })
})

// TERC-103: the panel covers what the active view is showing. It is under
// the map, outside the view panels, so it has no way to know on its own —
// and explaining levels for measurements nobody can see is noise.
describe('ConditionLevels follows the visible measurements (TERC-103)', () => {
  it('covers only the metrics the view declared', async () => {
    const w = await open(
      mountUnderView(['airTemp', 'windSpeed', 'waterTemp', 'waveHeight', 'turbidity']),
    )
    const captions = w.findAll('caption').map((c) => c.text())
    expect(captions).toEqual([
      'Water temperature',
      'Wave height',
      'Air temperature',
      'Wind',
      'Turbidity',
    ])
    expect(captions).not.toContain('Chlorophyll')
  })

  it('counts only those measurements on the closed button, and counts them in English', async () => {
    // The button promises "N levels across M measurements" — it would be
    // lying if it counted bands the panel then declines to show. One
    // measurement is a real state: a focused mid-lake buoy charts only
    // water temperature (Copilot review, PR #65).
    const w = mountUnderView(['waterTemp'])
    const hint = w.get('.cl-hint').text()
    expect(hint).toContain('across 1 measurement,')
    expect(hint).not.toContain('1 measurements')
    const temp = (await open(w)).findAll('tbody tr').length
    expect(hint).toContain(`${temp} levels`)
  })

  it('describes everything when no view has declared anything', async () => {
    const w = await open(mountPanel())
    expect(w.findAll('caption')).toHaveLength(8)
  })
})

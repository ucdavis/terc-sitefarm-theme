// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConditionLevels from '../ConditionLevels.vue'
import { applyConditionBands, resetBandsForTests } from '../../config/qualitative'

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

afterEach(() => resetBandsForTests())

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

  it('drops trailing zeros from thresholds — 0.50 is a number, "0.5" is a threshold', async () => {
    const w = await open(mountPanel())
    const waves = w.findAll('table').find((t) => t.find('caption').text() === 'Wave height')!
    expect(waves.findAll('tbody tr')[0].findAll('td')[1].text()).toBe('Below 0.5 ft')
  })
})

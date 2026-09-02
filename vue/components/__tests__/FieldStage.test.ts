// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { ScalarGrid } from '../../data/gridDecode'
import { empty, failure, loading, success, type RequestState } from '../../core/requestState'
import { CURRENT_SCALE, TEMPERATURE_SCALE } from '../../core/colorScale'
import FieldStage from '../FieldStage.vue'

/** 1x3 grid: index 0 is west, index 2 is east (unflipped columns). */
function grid(values: number[]): ScalarGrid {
  return {
    rows: 1,
    cols: values.length,
    values: new Float64Array(values),
    unit: '°F',
    flipVertical: true,
    flipHorizontal: false,
  }
}

const BASE = {
  scale: TEMPERATURE_SCALE,
  subject: 'Forecast surface temperature',
  mapDescription: 'Map of Lake Tahoe colored by forecast surface water temperature.',
  emptyMessage: 'No forecast temperature data is available for this hour.',
  errorMessage: 'The temperature forecast for this hour could not be loaded.',
}

/** A real stub rather than an auto-stub: auto-stubs lowercase camelCase
 *  props, so the accessible name would be unassertable. */
const LakeMapStub = defineComponent({
  props: { ariaLabel: { type: String, default: '' } },
  setup: (props, { slots }) => () =>
    h('div', { 'data-testid': 'field-map', 'aria-label': props.ariaLabel }, slots.default?.()),
})

const STUBS = { LakeMap: LakeMapStub, FieldOverlay: true, GradientLegend: true }

const mapLabelOf = (w: ReturnType<typeof mount>) =>
  w.get('[data-testid="field-map"]').attributes('aria-label')

const mountStage = (state: RequestState<ScalarGrid>, overrides: Record<string, unknown> = {}) =>
  mount(FieldStage, {
    props: { ...BASE, state, ...overrides },
    slots: { default: '<p class="test-intro">Safety copy</p>' },
    global: { stubs: STUBS },
  })

describe('FieldStage', () => {
  it('renders the intro slot in every state', () => {
    for (const state of [loading(), empty(), failure(new Error('x')), success(grid([50]))]) {
      expect(mountStage(state as RequestState<ScalarGrid>).find('.test-intro').exists()).toBe(true)
    }
  })

  it('summarizes range AND location as visible text (map text alternative)', () => {
    const w = mountStage(success(grid([51.6, NaN, 68.4])))
    const text = w.get('.field-summary').text()
    expect(text).toContain('Forecast surface temperature ranges from about 52 °F')
    expect(text).toContain('to about 68 °F')
    // Location, not just numbers.
    expect(text).toMatch(/shore|end of the lake/)
  })

  it('composes the map accessible name from the description plus the summary', () => {
    const label = mapLabelOf(mountStage(success(grid([51.6, NaN, 68.4]))))
    expect(label).toContain('Map of Lake Tahoe colored by forecast surface water temperature.')
    expect(label).toContain('ranges from about 52 °F')
  })

  it('states the empty case honestly when every cell is masked', () => {
    const w = mountStage(success(grid([NaN, NaN])))
    expect(w.get('.field-summary').text()).toBe(BASE.emptyMessage)
    expect(mapLabelOf(w)).toContain(BASE.emptyMessage)
  })

  it('shows no summary at all before any grid has loaded', () => {
    expect(mountStage(loading()).find('.field-summary').exists()).toBe(false)
  })

  it('shows the loading skeleton, and the error as an alert', async () => {
    expect(mountStage(loading()).find('[role="status"]').exists()).toBe(true)
    const w = mountStage(failure(new Error('grid HTTP 503')))
    expect(w.get('[role="alert"]').text()).toBe(BASE.errorMessage)
  })

  it('formats spoken values with the scale unit and the requested precision', () => {
    const speeds = mountStage(success(grid([12.4, 61.7])), {
      scale: CURRENT_SCALE,
      subject: 'Forecast current speed',
    })
    expect(speeds.get('.field-summary').text()).toContain('about 12 ft/min')

    const decimals = mountStage(success(grid([0.42, 2.68])), {
      scale: CURRENT_SCALE,
      subject: 'Forecast wave height',
      digits: 1,
    })
    expect(decimals.get('.field-summary').text()).toContain('about 0.4 ft/min')
  })

  it('renders the chrome slot for per-view extras', () => {
    const w = mount(FieldStage, {
      props: { ...BASE, state: success(grid([50])) },
      slots: { chrome: '<div class="test-chrome">wind</div>' },
      global: { stubs: STUBS },
    })
    expect(w.find('.test-chrome').exists()).toBe(true)
  })
})

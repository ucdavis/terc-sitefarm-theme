// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { ScalarGrid } from '../../data/gridDecode'
import { failure, loading, success, type RequestState } from '../../core/requestState'

const fieldState = ref<RequestState<ScalarGrid>>(loading())
vi.mock('../../composables/useModeledField', () => ({
  useModeledField: () => ({ state: fieldState }),
}))

import WaterTemperatureView from '../WaterTemperatureView.vue'

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

const mountView = () =>
  mount(WaterTemperatureView, {
    global: { stubs: { LakeMap: true, FieldOverlay: true, GradientLegend: true } },
  })

describe('WaterTemperatureView', () => {
  it('always shows the cold-water safety copy, whatever the data state', () => {
    fieldState.value = loading()
    const w = mountView()
    expect(w.text()).toContain('cold-water shock')
    expect(w.text()).toContain('upwelling')
  })

  it('summarizes range AND location as visible text (map text alternative)', async () => {
    fieldState.value = loading()
    const w = mountView()
    expect(w.find('.wt-summary').exists()).toBe(false)
    // min at storage index 0 (west), max at index 2 (east) of a 1x3 grid.
    fieldState.value = success(grid([51.6, NaN, 68.4]))
    await w.vm.$nextTick()
    const text = w.get('.wt-summary').text()
    expect(text).toContain('ranges from about 52 °F')
    expect(text).toContain('to about 68 °F')
    // Location, not just numbers (the PR review's core ask).
    expect(text).toMatch(/shore|end of the lake/)
  })

  it('shows the skeleton while loading and an honest alert on failure', async () => {
    fieldState.value = loading()
    const w = mountView()
    expect(w.find('[role="status"]').exists()).toBe(true)
    fieldState.value = failure(new Error('grid HTTP 503'))
    await w.vm.$nextTick()
    expect(w.get('[role="alert"]').text()).toContain('could not be loaded')
  })

  it('says so honestly when every cell is NaN, rather than staying silent (all-mask grid)', async () => {
    fieldState.value = success(grid([NaN, NaN]))
    const w = mountView()
    await w.vm.$nextTick()
    expect(w.get('.wt-summary').text()).toContain('No forecast temperature data is available')
  })
})

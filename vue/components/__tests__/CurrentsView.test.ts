// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { ScalarGrid } from '../../data/gridDecode'
import { loading, success, type RequestState } from '../../core/requestState'

// Generic stage behavior is covered by FieldStage.test.ts; this suite
// covers what the view itself contributes.
const fieldState = ref<RequestState<ScalarGrid>>(loading())
const requested: string[] = []
vi.mock('../../composables/useModeledField', () => ({
  useModeledField: (variable: string) => {
    requested.push(variable)
    return { state: fieldState }
  },
}))

import CurrentsView from '../CurrentsView.vue'

function grid(values: number[]): ScalarGrid {
  return {
    rows: 1,
    cols: values.length,
    values: new Float64Array(values),
    unit: 'mph',
    flipVertical: true,
    flipHorizontal: false,
  }
}

const mountView = () => {
  requested.length = 0
  return mount(CurrentsView, {
    global: { stubs: { LakeMap: true, FieldOverlay: true, GradientLegend: true } },
  })
}

describe('CurrentsView', () => {
  it('reads the flow grids, not the temperature grids', () => {
    mountView()
    expect(requested).toEqual(['flow'])
  })


  // TERC-100: mph to two decimals, with the model's own m/s alongside.
  // Lake currents run 0.03-0.12 mph, so whole numbers would flatten the
  // whole lake to "0 mph" and one decimal to two indistinguishable steps.
  it('speaks its summary in mph with m/s in parentheses', async () => {
    fieldState.value = success(grid([0.06, NaN, 0.34]))
    const w = mountView()
    await w.vm.$nextTick()
    const text = w.get('.field-readout-text').text()
    expect(text).toContain('Forecast current speed ranges from about 0.06 mph (0.03 m/s)')
    expect(text).toContain('to about 0.34 mph (0.15 m/s)')
    expect(text).toMatch(/shore|end of the lake/)
  })
})

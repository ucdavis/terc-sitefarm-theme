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
    unit: 'ft/min',
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


  it('speaks its summary as current speed in ft/min', async () => {
    fieldState.value = success(grid([8.2, NaN, 74.9]))
    const w = mountView()
    await w.vm.$nextTick()
    const text = w.get('.field-summary').text()
    expect(text).toContain('Forecast current speed ranges from about 8 ft/min')
    expect(text).toContain('to about 75 ft/min')
    expect(text).toMatch(/shore|end of the lake/)
  })
})

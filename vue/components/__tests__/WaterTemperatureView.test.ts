// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { ScalarGrid } from '../../data/gridDecode'
import { loading, success, type RequestState } from '../../core/requestState'

// The stage's generic behavior (summary, empty/error states, map label)
// has its own suite in FieldStage.test.ts; this one covers what the view
// itself contributes — its copy and which field it asks for.
const fieldState = ref<RequestState<ScalarGrid>>(loading())
const requested: string[] = []
vi.mock('../../composables/useModeledField', () => ({
  useModeledField: (variable: string) => {
    requested.push(variable)
    return { state: fieldState }
  },
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

const mountView = () => {
  requested.length = 0
  return mount(WaterTemperatureView, {
    global: { stubs: { LakeMap: true, FieldOverlay: true, GradientLegend: true } },
  })
}

describe('WaterTemperatureView', () => {
  it('reads the temperature grids, not the flow grids', () => {
    mountView()
    expect(requested).toEqual(['temperature'])
  })


  it('speaks its summary in degrees Fahrenheit', async () => {
    fieldState.value = success(grid([51.6, NaN, 68.4]))
    const w = mountView()
    await w.vm.$nextTick()
    const text = w.get('.field-summary').text()
    expect(text).toContain('Forecast surface temperature')
    expect(text).toContain('°F')
  })
})

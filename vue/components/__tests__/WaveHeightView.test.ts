// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { ScalarGrid } from '../../data/gridDecode'
import { empty, loading, success, type RequestState } from '../../core/requestState'
import type { HourlyWind } from '../../data/noaa'
import type { WaveBucket } from '../../data/waveHeight'

const state = ref<RequestState<ScalarGrid>>(loading())
const wind = ref<HourlyWind | null>(null)
const windOffsetHours = ref(0)
const bucket = ref<WaveBucket | null>(null)
const substituted = ref(false)

vi.mock('../../composables/useWaveField', () => ({
  useWaveField: () => ({
    state,
    wind,
    windOffsetHours,
    bucket,
    substituted,
    isCalm: computed(() => bucket.value?.ws === 0),
  }),
}))

import WaveHeightView from '../WaveHeightView.vue'

function grid(values: number[]): ScalarGrid {
  return {
    rows: 1,
    cols: values.length,
    values: new Float64Array(values),
    unit: 'ft',
    flipVertical: false,
    flipHorizontal: false,
  }
}

function reset() {
  state.value = loading()
  wind.value = null
  windOffsetHours.value = 0
  bucket.value = null
  substituted.value = false
}

const mountView = () =>
  mount(WaveHeightView, {
    global: { stubs: { LakeMap: true, FieldOverlay: true, GradientLegend: true } },
  })

describe('WaveHeightView', () => {
  it('always explains what drives waves — wind, fetch, and depth', () => {
    reset()
    const w = mountView()
    expect(w.text()).toContain('fetch')
    expect(w.text()).toContain('sheltered bay')
  })

  it('states the wind in plain language, not just a bearing', async () => {
    reset()
    wind.value = { speedMs: 5, speedMph: 11.4, dirDeg: 240 }
    bucket.value = { ws: 5, wd: 240 }
    const w = mountView()
    await w.vm.$nextTick()
    // "from the west-southwest" reads aloud; "240°" does not.
    expect(w.get('.wv-wind-text').text()).toContain('11 mph from the west-southwest')
  })

  it('discloses when the wind came from a neighbouring hour or bucket', async () => {
    reset()
    wind.value = { speedMs: 5, speedMph: 11.4, dirDeg: 240 }
    bucket.value = { ws: 5, wd: 240 }
    windOffsetHours.value = -2
    substituted.value = true
    const w = mountView()
    await w.vm.$nextTick()
    const text = w.get('.wv-wind-text').text()
    expect(text).toContain('2 hours earlier')
    expect(text).toContain('nearest available wind solution')
  })

  it('explains a flat-calm lake instead of letting it look broken', async () => {
    reset()
    wind.value = { speedMs: 0.2, speedMph: 0.4, dirDeg: 10 }
    bucket.value = { ws: 0, wd: 10 }
    state.value = success(grid([0, 0]))
    const w = mountView()
    await w.vm.$nextTick()
    const note = w.get('.wv-calm')
    expect(note.attributes('role')).toBe('status')
    expect(note.text()).toContain('no measurable waves')
    expect(note.text()).toContain('not missing')
  })

  it('shows no calm note when there is real wind', async () => {
    reset()
    wind.value = { speedMs: 6, speedMph: 13.4, dirDeg: 200 }
    bucket.value = { ws: 6, wd: 200 }
    state.value = success(grid([1.2, 2.4]))
    const w = mountView()
    await w.vm.$nextTick()
    expect(w.find('.wv-calm').exists()).toBe(false)
  })

  it('says hours outside the wind forecast have no wave data, and hides the indicator', async () => {
    reset()
    state.value = empty()
    const w = mountView()
    await w.vm.$nextTick()
    expect(w.get('.field-summary').text()).toContain('No wind forecast covers this hour')
    expect(w.find('.wv-wind').exists()).toBe(false)
  })

  it('speaks wave heights to a tenth of a foot', async () => {
    reset()
    wind.value = { speedMs: 6, speedMph: 13.4, dirDeg: 200 }
    bucket.value = { ws: 6, wd: 200 }
    state.value = success(grid([0.42, 2.68]))
    const w = mountView()
    await w.vm.$nextTick()
    const text = w.get('.field-summary').text()
    expect(text).toContain('Forecast wave height ranges from about 0.4 ft')
    expect(text).toContain('to about 2.7 ft')
  })
})

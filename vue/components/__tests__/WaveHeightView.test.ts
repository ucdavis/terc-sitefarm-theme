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
const bucket = ref<WaveBucket | null>(null)
const substituted = ref(false)

vi.mock('../../composables/useWaveField', () => ({
  useWaveField: () => ({
    state,
    wind,
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
  bucket.value = null
  substituted.value = false
}

const mountView = () =>
  mount(WaveHeightView, {
    global: { stubs: { LakeMap: true, FieldOverlay: true, GradientLegend: true } },
  })

describe('WaveHeightView', () => {
  it('states the wind in plain language, not just a bearing', async () => {
    reset()
    wind.value = { speedMs: 5, speedMph: 11.4, dirDeg: 240 }
    bucket.value = { ws: 5, wd: 240 }
    const w = mountView()
    await w.vm.$nextTick()
    // "from the west-southwest" reads aloud; "240°" does not.
    expect(w.get('.wv-wind-text').text()).toContain('11 mph from the west-southwest')
  })

  it('points the arrow where the wind blows, accounting for the glyph', async () => {
    reset()
    // The glyph points east (bearing 90) unrotated, and dirDeg is where
    // the wind comes FROM, so a 240° wind blowing toward 60° needs
    // rotate(330deg) — not rotate(60deg), which would aim it southeast.
    wind.value = { speedMs: 5, speedMph: 11.4, dirDeg: 240 }
    bucket.value = { ws: 5, wd: 240 }
    const w = mountView()
    await w.vm.$nextTick()
    expect(w.get('.wv-arrow').attributes('style')).toContain('rotate(330deg)')
    expect(w.get('.wv-arrow').attributes('aria-hidden')).toBe('true')
  })

  it('discloses when a neighbouring wind solution stood in', async () => {
    reset()
    wind.value = { speedMs: 5, speedMph: 11.4, dirDeg: 240 }
    bucket.value = { ws: 5, wd: 240 }
    substituted.value = true
    const w = mountView()
    await w.vm.$nextTick()
    const text = w.get('.wv-wind-text').text()
    expect(text).toContain('nearest available wind solution')
    // Every hour on the wave axis is one of NOAA's own (TERC-93), so the old
    // "wind borrowed from N hours earlier" caveat cannot arise any more.
    expect(text).not.toMatch(/hours? (earlier|later)/)
  })

  it('credits the wind forecast to the National Weather Service, linking the same grid cell', async () => {
    reset()
    wind.value = { speedMs: 5, speedMph: 11.4, dirDeg: 240 }
    bucket.value = { ws: 5, wd: 240 }
    const w = mountView()
    await w.vm.$nextTick()
    const credit = w.get('.wv-attribution')
    expect(credit.text()).toBe('Wind forecast: National Weather Service (NOAA)')
    const link = credit.get('a')
    expect(link.text()).toBe('National Weather Service (NOAA)')
    // The point page for 39.065,-120.045 resolves to REV/33,87 — the
    // gridpoint the wind is fetched from (endpoints.ts).
    expect(link.attributes('href')).toBe('https://forecast.weather.gov/MapClick.php?lat=39.065&lon=-120.045')
  })

  it('shows no attribution while there is no wind to attribute', async () => {
    reset()
    const w = mountView()
    await w.vm.$nextTick()
    expect(w.find('.wv-attribution').exists()).toBe(false)
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
    expect(w.get('.field-readout-text').text()).toContain('No wind forecast covers this hour')
    expect(w.find('.wv-wind').exists()).toBe(false)
  })

  it('speaks wave heights to a tenth of a foot', async () => {
    reset()
    wind.value = { speedMs: 6, speedMph: 13.4, dirDeg: 200 }
    bucket.value = { ws: 6, wd: 200 }
    state.value = success(grid([0.42, 2.68]))
    const w = mountView()
    await w.vm.$nextTick()
    const text = w.get('.field-readout-text').text()
    expect(text).toContain('Forecast wave height ranges from about 0.4 ft')
    expect(text).toContain('to about 2.7 ft')
  })
})

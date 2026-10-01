// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import {
  declareVisibleMetrics,
  resetVisibleMetricsForTests,
  useVisibleMetrics,
} from '../useVisibleMetrics'
import { METRIC_META, type QualityMetric } from '../../config/qualitative'

/**
 * TERC-103. The levels matrix lives outside the view panels, so the view has
 * to tell it what is on screen. What matters is that the hand-over is exact:
 * the panel must never describe a metric the visitor cannot see, and must
 * never go blank because two views changed places.
 */
const ALL = Object.keys(METRIC_META) as QualityMetric[]

/** A stand-in view that declares `metrics` for as long as it is mounted. */
const View = (metrics: QualityMetric[] | ReturnType<typeof ref<QualityMetric[]>>) =>
  defineComponent({
    setup() {
      declareVisibleMetrics(Array.isArray(metrics) ? computed(() => metrics) : (metrics as never))
      return () => h('div')
    },
  })

/** Reads the declaration the way ConditionLevels does. */
const Panel = defineComponent({
  setup() {
    const visible = useVisibleMetrics()
    return () => h('div', visible.value.join(','))
  },
})

const shown = () => mount(Panel).text().split(',').filter(Boolean)

afterEach(() => resetVisibleMetricsForTests())

describe('useVisibleMetrics', () => {
  it('describes everything until a view says otherwise', () => {
    expect(shown()).toEqual(ALL)
  })

  it('narrows to what the view declared', () => {
    mount(View(['airTemp', 'windSpeed', 'waterTemp', 'waveHeight', 'turbidity']))
    expect(shown()).toEqual(['waterTemp', 'waveHeight', 'airTemp', 'windSpeed', 'turbidity'])
  })

  it('keeps the canonical order, so a metric appearing never reshuffles the rest', () => {
    // Declared back to front; the panel still reads in METRIC_META order, so
    // opening "Show more data" inserts rows in place.
    mount(View(['chlorophyll', 'waterTemp', 'airTemp']))
    expect(shown()).toEqual(['waterTemp', 'airTemp', 'chlorophyll'])
  })

  it('follows a declaration that changes while the view stays mounted', async () => {
    const metrics = ref<QualityMetric[]>(['waterTemp'])
    mount(View(metrics))
    expect(shown()).toEqual(['waterTemp'])
    metrics.value = ['waterTemp', 'turbidity']
    expect(shown()).toEqual(['waterTemp', 'turbidity'])
  })

  it('ignores a metric declared twice', () => {
    mount(View(['waterTemp', 'waterTemp', 'airTemp']))
    expect(shown()).toEqual(['waterTemp', 'airTemp'])
  })

  it('goes back to everything when the declaring view unmounts', () => {
    const w = mount(View(['waterTemp']))
    expect(shown()).toEqual(['waterTemp'])
    w.unmount()
    expect(shown()).toEqual(ALL)
  })

  it('survives a view switch whichever way round mount and unmount run', () => {
    // Vue may mount the incoming view before unmounting the outgoing one.
    // Without the ownership token the outgoing view's teardown would blank
    // the panel for the view now on screen.
    const outgoing = mount(View(['waterTemp', 'turbidity']))
    const incoming = mount(View(['airTemp']))
    outgoing.unmount()
    expect(shown()).toEqual(['airTemp'])

    // ...and the ordinary order still withdraws properly.
    incoming.unmount()
    expect(shown()).toEqual(ALL)
  })
})

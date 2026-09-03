// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { DestinationDef } from '../../config/destinations'
import { LAKE_GRID_BOUNDS } from '../../config/lakeGrid'
import type { EngineInitOpts, LatLng, LatLngBounds, MapEngine } from '../../map/engine'
import LakeMap from '../LakeMap.vue'

/**
 * The interactive Real-Time map now frames the whole lake (fit-lake) in a
 * portrait column. Two things must hold: a deep link to a destination
 * keeps its own framing instead of being overridden by the lake fit, and
 * "Show whole lake" refits the lake box rather than flying to the old
 * centre + zoom.
 */
function makeFakeEngine() {
  const state = { init: null as EngineInitOpts | null, flights: [] as LatLng[], fits: [] as LatLngBounds[] }
  const engine: MapEngine = {
    clearGroup() {},
    addBadgeMarker() {},
    addCircleMarker() {},
    flyTo(center) {
      state.flights.push(center)
    },
    fitBounds(bounds) {
      state.fits.push(bounds)
    },
    invalidateSize() {},
    setImageOverlay() {},
    removeImageOverlay() {},
    destroy() {},
  }
  return { state, factory: (_el: HTMLElement, opts: EngineInitOpts) => ((state.init = opts), engine) }
}

const homewood: DestinationDef = {
  id: 'homewood',
  name: 'Homewood',
  lat: 39.08,
  lng: -120.16,
  zoom: 13,
  stationIds: [],
}

describe('LakeMap with fit-lake (interactive)', () => {
  it('opens fitted to the lake when nothing is selected', () => {
    const { state, factory } = makeFakeEngine()
    mount(LakeMap, { props: { fitLake: true, engineFactory: factory, destinations: [homewood] } })
    expect(state.init?.fitBounds).toEqual(LAKE_GRID_BOUNDS)
  })

  it('keeps a deep-linked destination framing rather than fitting the lake over it', () => {
    const { state, factory } = makeFakeEngine()
    mount(LakeMap, {
      props: { fitLake: true, engineFactory: factory, destinations: [homewood], selectedDestinationId: 'homewood' },
    })
    expect(state.init?.fitBounds).toBeUndefined()
    expect(state.init?.center).toEqual([homewood.lat, homewood.lng])
    expect(state.init?.zoom).toBe(13)
  })

  it('"Show whole lake" refits the lake box instead of flying to centre + zoom', async () => {
    const { state, factory } = makeFakeEngine()
    const w = mount(LakeMap, {
      props: { fitLake: true, engineFactory: factory, destinations: [homewood], selectedDestinationId: 'homewood' },
    })
    await w.setProps({ selectedDestinationId: null })
    expect(state.fits[state.fits.length - 1]).toEqual(LAKE_GRID_BOUNDS)
    expect(state.flights).toHaveLength(0)
  })

  it('still flies to centre + zoom without fit-lake (the old behaviour)', async () => {
    const { state, factory } = makeFakeEngine()
    const w = mount(LakeMap, {
      props: { engineFactory: factory, destinations: [homewood], selectedDestinationId: 'homewood' },
    })
    await w.setProps({ selectedDestinationId: null })
    expect(state.flights).toHaveLength(1)
    expect(state.fits).toHaveLength(0)
  })
})

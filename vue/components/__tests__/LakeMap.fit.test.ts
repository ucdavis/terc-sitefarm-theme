// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { DestinationDef } from '../../config/destinations'
import { LAKE_GRID_BOUNDS } from '../../config/lakeGrid'
import { LAKE_CENTER, STATION_FOCUS_ZOOM } from '../../config/lakeView'
import type { OverviewMarker } from '../../composables/useLakeOverview'
import type { EngineInitOpts, LatLng, LatLngBounds, MapEngine } from '../../map/engine'
import LakeMap from '../LakeMap.vue'
import { destinationBounds } from '../../map/destinationFraming'

/**
 * The interactive Real-Time map now frames the whole lake (fit-lake) in a
 * portrait column. Two things must hold: a deep link to a destination
 * keeps its own framing instead of being overridden by the lake fit, and
 * "Show whole lake" refits the lake box rather than flying to the old
 * centre + zoom.
 */
function makeFakeEngine() {
  const state = { init: null as EngineInitOpts | null, flights: [] as LatLng[], zooms: [] as number[], fits: [] as LatLngBounds[] }
  const engine: MapEngine = {
    clearGroup() {},
    addBadgeMarker() {},
    addCircleMarker() {},
    flyTo(center, zoom) {
      state.flights.push(center)
      state.zooms.push(zoom)
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
    // TERC-74: a destination opens fitted to its own stations, not to the
    // lake box and not at a hand-picked zoom.
    expect(state.init?.fitBounds).toEqual(destinationBounds(homewood, []))
    expect(state.init?.fitBounds).not.toEqual(LAKE_GRID_BOUNDS)
    expect(state.init?.center).toEqual([homewood.lat, homewood.lng])
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

/**
 * Deep links can name a destination or station that only exists in the
 * site registry, which arrives AFTER the map mounted on the static one
 * (Copilot, PR #24). The map must fly once the entry resolves — and only
 * once: marker polls and registry swaps re-deliver the same entry.
 */
const siteOnly: DestinationDef = { id: 'skunk-harbor', name: 'Skunk Harbor', lat: 39.15, lng: -119.94, zoom: 14, stationIds: [] }
const marker = (over: Partial<OverviewMarker> = {}): OverviewMarker =>
  ({ key: 'nearshore:12', kind: 'nearshore', sourceId: 12, name: 'Cave Rock', lat: 39.04, lng: -119.95, status: 'reporting', waterTemp: 60, time: null, locationVerified: false, ...over }) as OverviewMarker

describe('LakeMap flies to a selection that resolves late', () => {
  it('flies to a deep-linked destination when the site registry finally delivers it, once', async () => {
    const { state, factory } = makeFakeEngine()
    const w = mount(LakeMap, {
      props: { fitLake: true, engineFactory: factory, destinations: [homewood], selectedDestinationId: 'skunk-harbor' },
    })
    // Unknown on the static registry: opens on the whole lake, no flight.
    expect(state.init?.fitBounds).toEqual(LAKE_GRID_BOUNDS)
    expect(state.flights).toHaveLength(0)

    await w.setProps({ destinations: [homewood, siteOnly] })
    // TERC-74: it is framed on its stations, so the move is a fit, not a fly.
    expect(state.fits[state.fits.length - 1]).toEqual(destinationBounds(siteOnly, []))
    expect(state.flights).toHaveLength(0)
    const fitsSoFar = state.fits.length

    // A registry swap re-delivering the same destination must not re-frame.
    await w.setProps({ destinations: [{ ...homewood }, { ...siteOnly }] })
    expect(state.fits).toHaveLength(fitsSoFar)

    // Clearing still returns to the whole lake.
    await w.setProps({ selectedDestinationId: null })
    expect(state.fits[state.fits.length - 1]).toEqual(LAKE_GRID_BOUNDS)
  })

  it('flies to a deep-linked station when its marker is seeded, and not again on every poll', async () => {
    const { state, factory } = makeFakeEngine()
    const w = mount(LakeMap, { props: { engineFactory: factory, focusedStationKey: 'nearshore:12' } })
    expect(state.init?.center).toEqual(LAKE_CENTER)
    expect(state.flights).toHaveLength(0)

    await w.setProps({ overviewMarkers: [marker()] })
    expect(state.flights).toEqual([[39.04, -119.95]])
    expect(state.zooms).toEqual([STATION_FOCUS_ZOOM])

    // Polls refresh the reading; the framing stays put.
    await w.setProps({ overviewMarkers: [marker({ waterTemp: 61 })] })
    await w.setProps({ overviewMarkers: [marker({ status: 'offline', waterTemp: null })] })
    expect(state.flights).toHaveLength(1)
  })

  it('refits a selected destination when reseeded marker coordinates change its bounds, but not for reading-only updates', async () => {
    const seededDestination: DestinationDef = { ...siteOnly, stationIds: [12] }
    const { state, factory } = makeFakeEngine()
    const w = mount(LakeMap, {
      props: {
        engineFactory: factory,
        destinations: [seededDestination],
        selectedDestinationId: 'skunk-harbor',
        overviewMarkers: [marker()],
      },
    })
    expect(state.init?.fitBounds).toEqual(destinationBounds(seededDestination, [marker()]))

    await w.setProps({ overviewMarkers: [marker({ waterTemp: 61 })] })
    expect(state.fits).toHaveLength(0)

    const movedMarker = marker({ lat: 39.09, lng: -119.92 })
    await w.setProps({ overviewMarkers: [movedMarker] })
    expect(state.fits[state.fits.length - 1]).toEqual(destinationBounds(seededDestination, [movedMarker]))
  })
})

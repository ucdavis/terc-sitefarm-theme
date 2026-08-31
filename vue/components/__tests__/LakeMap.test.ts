// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LakeMap from '../LakeMap.vue'
import { LAKE_CENTER, LAKE_DEFAULT_ZOOM, STATION_FOCUS_ZOOM } from '../../config/lakeView'
import type { BadgeMarkerOpts, CircleMarkerOpts, EngineInitOpts, LatLng, MapEngine } from '../../map/engine'
import type { OverviewMarker } from '../../composables/useLakeOverview'
import type { DestinationDef } from '../../config/destinations'

/**
 * The fake engine IS the swappability acceptance test (TERC-17): LakeMap
 * runs its full behavior against a non-Leaflet engine, proving nothing
 * above the seam depends on the map library.
 */
function makeFakeEngine() {
  const state = {
    init: null as EngineInitOpts | null,
    badges: [] as { group: string; opts: BadgeMarkerOpts }[],
    circles: [] as { group: string; opts: CircleMarkerOpts }[],
    flights: [] as { center: LatLng; zoom: number }[],
    destroyed: false,
  }
  const engine: MapEngine = {
    clearGroup(group) {
      state.badges = state.badges.filter((b) => b.group !== group)
      state.circles = state.circles.filter((c) => c.group !== group)
    },
    addBadgeMarker(group, opts) {
      state.badges.push({ group, opts })
    },
    addCircleMarker(group, opts) {
      state.circles.push({ group, opts })
    },
    flyTo(center, zoom) {
      state.flights.push({ center, zoom })
    },
    destroy() {
      state.destroyed = true
    },
  }
  return { state, factory: (_el: HTMLElement, opts: EngineInitOpts) => ((state.init = opts), engine) }
}

const DEST: DestinationDef = {
  id: 'homewood',
  name: 'Homewood',
  lat: 39.086,
  lng: -120.16,
  zoom: 13,
  stationIds: [4],
}

function marker(over: Partial<OverviewMarker>): OverviewMarker {
  return {
    key: 'nearshore:4',
    name: 'Homewood',
    lat: 39.086,
    lng: -120.159,
    kind: 'nearshore',
    sourceId: 4,
    waterTemp: 61.3,
    time: new Date('2026-08-30T18:00:00Z'),
    status: 'reporting',
    locationVerified: false,
    ...over,
  }
}

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1]
}

function mountMap(props: Record<string, unknown> = {}) {
  const fake = makeFakeEngine()
  const wrapper = mount(LakeMap, { props: { engineFactory: fake.factory, ...props } })
  return { fake, wrapper }
}

describe('LakeMap', () => {
  it('opens on the whole lake by default', () => {
    const { fake } = mountMap()
    expect(fake.state.init?.center).toEqual(LAKE_CENTER)
    expect(fake.state.init?.zoom).toBe(LAKE_DEFAULT_ZOOM)
  })

  it('opens on a preselected destination (deep link, reload)', () => {
    const { fake } = mountMap({ destinations: [DEST], selectedDestinationId: 'homewood' })
    expect(fake.state.init?.center).toEqual([DEST.lat, DEST.lng])
    expect(fake.state.init?.zoom).toBe(DEST.zoom)
  })

  it('opens on a prefocused station, preferring it over a destination', () => {
    const { fake } = mountMap({
      destinations: [DEST],
      selectedDestinationId: 'homewood',
      overviewMarkers: [marker({})],
      focusedStationKey: 'nearshore:4',
    })
    expect(fake.state.init?.center).toEqual([39.086, -120.159])
    expect(fake.state.init?.zoom).toBe(STATION_FOCUS_ZOOM)
  })

  it('escapes station names before interpolating them into tooltip HTML', () => {
    const { fake } = mountMap({
      overviewMarkers: [marker({ name: '<img src=x onerror=alert(1)>' })],
    })
    const tip = fake.state.badges[0].opts.tooltipHtml
    expect(tip).not.toContain('<img')
    expect(tip).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('renders reporting stations as temperature badges and offline ones as distinct markers', () => {
    const { fake } = mountMap({
      overviewMarkers: [
        marker({}),
        marker({ key: 'nearshore:7', name: 'Sand Harbor', status: 'offline', waterTemp: null, time: null }),
        marker({ key: 'nearshore:9', status: 'loading' }),
      ],
    })
    const overview = fake.state.badges.filter((b) => b.group === 'overview')
    // Loading markers are not drawn yet; offline ones are NEVER dropped.
    expect(overview).toHaveLength(2)
    expect(overview[0].opts.html).toContain('61.3')
    expect(overview[1].opts.html).toContain('stn-badge--offline')
    expect(overview[1].opts.html).toContain('!')
    expect(overview[1].opts.tooltipHtml).toContain('Not reporting')
  })

  it('gives every badge an accessible name with reading, lake time, and instructions', () => {
    const { fake } = mountMap({
      overviewMarkers: [
        marker({}),
        marker({ key: 'nearshore:7', name: 'Sand Harbor', status: 'offline', waterTemp: null, time: null }),
      ],
    })
    const labels = fake.state.badges.map((b) => b.opts.ariaLabel)
    expect(labels[0]).toContain('Homewood')
    expect(labels[0]).toContain('water 61.3 degrees Fahrenheit')
    expect(labels[0]).toContain('lake time')
    expect(labels[0]).toContain('press Enter')
    expect(labels[1]).toContain('Sand Harbor')
    expect(labels[1]).toContain('not reporting')
  })

  it('exposes the map as a labeled region', () => {
    const { wrapper } = mountMap()
    const region = wrapper.find('.lake-map-wrap')
    expect(region.attributes('role')).toBe('region')
    expect(region.attributes('aria-label')).toContain('Lake Tahoe station map')
  })

  it('labels approximate coordinates in the tooltip', () => {
    const { fake } = mountMap({ overviewMarkers: [marker({})] })
    expect(fake.state.badges[0].opts.tooltipHtml).toContain('Location approximate')
  })

  it('emits select-station when a badge is clicked', () => {
    const { fake, wrapper } = mountMap({ overviewMarkers: [marker({})] })
    fake.state.badges[0].opts.onClick?.()
    expect(wrapper.emitted('select-station')).toEqual([['nearshore:4']])
  })

  it('emits select-destination when a destination dot is clicked', () => {
    const { fake, wrapper } = mountMap({ destinations: [DEST] })
    fake.state.circles[0].opts.onClick?.()
    expect(wrapper.emitted('select-destination')).toEqual([['homewood']])
  })

  it('flies to a destination when it becomes selected, and home when cleared', async () => {
    const { fake, wrapper } = mountMap({ destinations: [DEST] })
    await wrapper.setProps({ selectedDestinationId: 'homewood' })
    expect(last(fake.state.flights)).toEqual({ center: [DEST.lat, DEST.lng], zoom: DEST.zoom })
    await wrapper.setProps({ selectedDestinationId: null })
    expect(last(fake.state.flights)).toEqual({ center: LAKE_CENTER, zoom: LAKE_DEFAULT_ZOOM })
  })

  it('flies to a focused station and marks its badge, and home when focus clears', async () => {
    const { fake, wrapper } = mountMap({ overviewMarkers: [marker({})] })
    await wrapper.setProps({ focusedStationKey: 'nearshore:4' })
    expect(last(fake.state.flights)).toEqual({ center: [39.086, -120.159], zoom: STATION_FOCUS_ZOOM })
    expect(fake.state.badges[0].opts.html).toContain('stn-badge--focused')
    await wrapper.setProps({ focusedStationKey: null })
    expect(last(fake.state.flights)).toEqual({ center: LAKE_CENTER, zoom: LAKE_DEFAULT_ZOOM })
  })

  it('destroys the engine on unmount', () => {
    const { fake, wrapper } = mountMap()
    wrapper.unmount()
    expect(fake.state.destroyed).toBe(true)
  })
})

import { effectScope, ref, watch, type EffectScope } from 'vue'
import type { Registry, RegistryStation } from '../data/locations'
import {
  fetchHomewood,
  fetchNasaBuoy,
  fetchNearshoreRange,
  latestRecord,
} from '../data/stationData'
import { useConditionsState, type StationFocus } from './useConditionsState'

/**
 * Every water-temperature station on the lake for the overview map
 * (TERC-17): the registry's near-shore stations and NASA buoys plus
 * tc-homewood, each with its latest water temperature or an explicit
 * "not reporting" status.
 *
 * Non-reporting stations are deliberately kept on the map — several are
 * under maintenance and expected to return, and hiding them would
 * misrepresent the sensor network. They render as offline markers, never
 * disappear.
 *
 * Registry-driven (TERC-46): markers seed from whatever registry the page
 * has — the static fallback immediately, reseeded when site content loads —
 * so an editor adding a station node puts it on the map. The met station is
 * excluded: TERC-17 scopes the overview to water-temperature badges
 * (near-shore, buoys, Homewood); met data joins the destination views.
 *
 * Uses the same 2-day window (and therefore the same cache keys) as the
 * destination views, so opening Plan Your Day after this — or vice versa —
 * costs no extra requests for the shared stations.
 */
export interface OverviewMarker {
  /** `kind:sourceId`, matching the cc-station URL serialization. */
  key: string
  name: string
  lat: number
  lng: number
  kind: 'nearshore' | 'buoy' | 'homewood'
  /** Report-API id within its family; -1 for the id-less tc-homewood. */
  sourceId: number
  /** °F, latest reading */
  waterTemp: number | null
  time: Date | null
  status: 'loading' | 'reporting' | 'offline'
  /**
   * No station in the current registry has an independently confirmed
   * position — every coordinate traces back to the eyeballed shoreline
   * placements in config/stations.ts (the seeder copied those same values
   * into site content). Stays false for all until the content type grows a
   * location-verified boolean editors can set (flagged on TERC-46).
   */
  locationVerified: boolean
}

/**
 * tc-homewood cannot be represented in site content yet (the allowed value
 * on field_station_type is pending on tercdev) and the static registry
 * predates it, so the overview supplies it directly. Once a registry of
 * either origin contains a homewood station this entry stops being used.
 */
const HOMEWOOD_FALLBACK = {
  name: 'Homewood (tc)',
  lat: 39.09,
  lng: -120.161,
}

export function markerKey(kind: StationFocus['kind'], sourceId: number): string {
  return `${kind}:${sourceId}`
}

const markers = ref<OverviewMarker[]>([])

const OVERVIEW_KINDS = new Set<RegistryStation['kind']>(['nearshore', 'buoy', 'homewood'])

function seed(registry: Registry): void {
  const seeded: OverviewMarker[] = registry.stations
    .filter((s) => OVERVIEW_KINDS.has(s.kind))
    .map((s) => ({
      key: markerKey(s.kind as StationFocus['kind'], s.sourceId ?? -1),
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      kind: s.kind as StationFocus['kind'],
      sourceId: s.sourceId ?? -1,
      waterTemp: null,
      time: null,
      status: 'loading',
      locationVerified: false,
    }))
  if (!seeded.some((m) => m.kind === 'homewood')) {
    seeded.push({
      key: markerKey('homewood', -1),
      ...HOMEWOOD_FALLBACK,
      kind: 'homewood',
      sourceId: -1,
      waterTemp: null,
      time: null,
      status: 'loading',
      locationVerified: false,
    })
  }
  markers.value = seeded
}

function update(key: string, patch: Partial<OverviewMarker>): void {
  const m = markers.value.find((x) => x.key === key)
  if (m) Object.assign(m, patch)
}

function load(): void {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 2) // same window as the destination views -> shared cache keys

  for (const m of markers.value) {
    const done = (rec: { waterTemp: number | null; time: Date } | null, liveName?: string | null) =>
      update(m.key, {
        ...(liveName ? { name: liveName } : {}),
        waterTemp: rec?.waterTemp ?? null,
        time: rec?.time ?? null,
        status: rec && rec.waterTemp !== null ? 'reporting' : 'offline',
      })
    // Clear any previously loaded reading too: a marker that failed to
    // refresh must not carry a stale temperature into 'offline'.
    const offline = () => update(m.key, { status: 'offline', waterTemp: null, time: null })

    if (m.kind === 'nearshore') {
      fetchNearshoreRange(m.sourceId, start, end)
        .then((series) => done(latestRecord(series.records), series.stationName))
        .catch(offline)
    } else if (m.kind === 'buoy') {
      fetchNasaBuoy(m.sourceId, start, end)
        .then((records) => done(latestRecord(records)))
        .catch(offline)
    } else {
      fetchHomewood(start, end)
        .then((series) => done(latestRecord(series.records), series.stationName))
        .catch(offline)
    }
  }
}

let started = false
let scope: EffectScope | null = null

export function useLakeOverview() {
  const { registry } = useConditionsState()
  if (!started) {
    started = true
    seed(registry.value)
    load()
    // Reseed when the registry is replaced (static fallback -> site content,
    // TERC-46). Refetching is near-free: the shared cache already holds the
    // overlapping stations' windows and joins in-flight requests. The watcher
    // lives in a detached scope so it survives even if the mounting
    // component is ever unmounted — the overview is page-lifetime state.
    scope = effectScope(true)
    scope.run(() => {
      watch(registry, (r) => {
        seed(r)
        load()
      })
    })
  }
  return { markers, reload: load }
}

/** Test hook: clear markers, stop the registry watcher, allow reseeding. */
export function resetLakeOverviewForTests(): void {
  scope?.stop()
  scope = null
  markers.value = []
  started = false
}

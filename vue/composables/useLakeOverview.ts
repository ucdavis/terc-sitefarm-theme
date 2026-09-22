import { effectScope, ref, watch, type EffectScope } from 'vue'
import type { DestinationDef } from '../config/destinations'
import type { Registry, RegistryStation } from '../data/locations'
import {
  fetchHomewood,
  fetchNasaBuoy,
  fetchNearshoreRange,
  latestRecord,
  readStoredBuoy,
  readStoredHomewood,
  readStoredNearshore,
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
 * Last-resort marker for the tc-homewood thermistor chain.
 *
 * Site content CAN represent it now — `field_station_type` accepts
 * `tc_homewood` on tercdev, and the seeder maintains that node — so this is
 * unused on any normal page view. What still cannot represent it is
 * `staticRegistry()`, which only adapts NEARSHORE_STATIONS, NASA_BUOYS and
 * MET_STATION; so this is what keeps the chain on the map when the site's
 * own JSON:API is down. Delete it once the static registry carries a
 * homewood entry of its own, not before.
 *
 * TERC-79: the coordinate used to be 39.09,-120.161, which is the HOMEWOOD
 * NEARSHORE STATION (id 4) to five decimals — a different instrument 1.1 km
 * away. The chain is a string of sensors in deeper water, 584 m offshore;
 * the nearshore sensor is on a dock 12 m out. Same name, same bay, not the
 * same thing.
 */
export const HOMEWOOD_FALLBACK = {
  name: 'Homewood (tc)',
  lat: 39.08353,
  lng: -120.15092,
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
    // Registry names are authoritative (editors own them, TERC-46) — the
    // API's Station_Name is deliberately NOT copied over the seeded name.
    // A prototype-era rule had the API win, which silently discarded
    // editor renames for every reporting station.
    const done = (rec: { waterTemp: number | null; time: Date } | null) =>
      update(m.key, {
        waterTemp: rec?.waterTemp ?? null,
        time: rec?.time ?? null,
        status: rec && rec.waterTemp !== null ? 'reporting' : 'offline',
      })
    // Clear any previously loaded reading too: a marker that failed to
    // refresh must not carry a stale temperature into 'offline'.
    const offline = () => update(m.key, { status: 'offline', waterTemp: null, time: null })

    // Badges are the lowest priority on the page (TERC-70): the selected
    // destination and lake weather go first through the request queue.
    // While a badge waits, the last reading we ever fetched for it paints
    // immediately — the badge carries its own timestamp, so nothing is
    // passed off as newer than it is.
    const paintStored = (stored: { value: { records?: unknown } | unknown[] } | undefined) => {
      if (!stored) return
      const records = (Array.isArray(stored.value) ? stored.value : (stored.value as { records: unknown[] }).records) as {
        waterTemp: number | null
        time: Date
      }[]
      const m2 = markers.value.find((x) => x.key === m.key)
      if (m2?.status === 'loading') done(latestRecord(records))
    }
    const low = { priority: 'low' as const }
    if (m.kind === 'nearshore') {
      void readStoredNearshore(m.sourceId).then(paintStored)
      fetchNearshoreRange(m.sourceId, start, end, low)
        .then((series) => done(latestRecord(series.records)))
        .catch(offline)
    } else if (m.kind === 'buoy') {
      void readStoredBuoy(m.sourceId).then(paintStored)
      fetchNasaBuoy(m.sourceId, start, end, low)
        .then((records) => done(latestRecord(records)))
        .catch(offline)
    } else {
      void readStoredHomewood().then(paintStored)
      fetchHomewood(start, end, low)
        .then((series) => done(latestRecord(series.records)))
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

/**
 * Names of the destinations with at least one reporting station right now,
 * derived from the live overview markers — never a hard-coded list. Shared
 * by the shell's whole-lake welcome and Plan Your Day's quiet-station hint.
 */
export function reportingDestinationNames(
  markers: OverviewMarker[],
  destinations: DestinationDef[],
): string[] {
  const reportingNearshore = new Set(
    markers.filter((m) => m.kind === 'nearshore' && m.status === 'reporting').map((m) => m.sourceId),
  )
  const reportingBuoyIds = new Set(
    markers.filter((m) => m.kind === 'buoy' && m.status === 'reporting').map((m) => m.sourceId),
  )
  const homewoodUp = markers.some((m) => m.kind === 'homewood' && m.status === 'reporting')
  return destinations
    .filter(
      (d) =>
        d.stationIds.some((id) => reportingNearshore.has(id)) ||
        (d.buoyIds ?? []).some((id) => reportingBuoyIds.has(id)) ||
        (d.includesHomewood === true && homewoodUp),
    )
    .map((d) => d.name)
}

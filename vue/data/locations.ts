/**
 * Site-owned station/destination registry (TERC-46).
 *
 * Fetches the Lake Destinations (`lake_locations`) and Lake Station
 * (`station`) content types over the site's own JSON:API and adapts them to
 * the same DestinationDef / StationDef shapes the components already use —
 * editors manage the registry; adding a station node puts it on the map.
 *
 * Falls back to the code registry (config/stations.ts, destinations.ts)
 * when JSON:API is unreachable or returns nothing, so the blocks degrade
 * to the empirically verified static registry rather than an empty map.
 *
 * Schema notes (verified against tercdev, 2026-08-28):
 *  - destination fields: title, field_location_id (URL slug),
 *    field_location_geo_data, field_stations (multi entity ref -> station)
 *  - station fields: title, field_station_id (int, optional — absent for
 *    endpoint families with no id param), field_station_type
 *    (nearshore_station | met_station | nasa_buoy; tc_homewood pending),
 *    field_location_geo_data
 *  - station ids are scoped PER TYPE (met id 1 and buoy id 1 coexist),
 *    exactly like the report API's endpoint families.
 */
import { miscCache, TTL } from '../core/cache'
import {
  DESTINATIONS,
  type DestinationDef,
} from '../config/destinations'
import { NEARSHORE_STATIONS, NASA_BUOYS, MET_STATION, type StationDef } from '../config/stations'

/** Same-origin by default — the blocks run on the Drupal site itself. */
export const JSONAPI_BASE = ''

const REGISTRY_PATH = '/jsonapi/node/lake_locations?include=field_stations'

export type RegistryStationKind = 'nearshore' | 'buoy' | 'met' | 'homewood'

export interface RegistryStation {
  /** Drupal node uuid. */
  uuid: string
  kind: RegistryStationKind
  /** Report-API id within its endpoint family; null for id-less endpoints. */
  sourceId: number | null
  name: string
  lat: number
  lng: number
}

export interface Registry {
  destinations: DestinationDef[]
  stations: RegistryStation[]
  /** False when serving the static code fallback instead of site content. */
  fromSite: boolean
}

const TYPE_TO_KIND: Record<string, RegistryStationKind> = {
  nearshore_station: 'nearshore',
  met_station: 'met',
  nasa_buoy: 'buoy',
  tc_homewood: 'homewood',
}

interface JsonApiResource {
  type: string
  id: string
  attributes: Record<string, unknown>
  relationships?: Record<string, { data: { id: string }[] | { id: string } | null }>
}

function geo(attrs: Record<string, unknown>): { lat: number; lng: number } | null {
  const g = attrs.field_location_geo_data as { lat?: unknown; lng?: unknown } | null
  if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number') return null
  return { lat: g.lat, lng: g.lng }
}

function adaptStation(res: JsonApiResource): RegistryStation | null {
  const kind = TYPE_TO_KIND[String(res.attributes.field_station_type ?? '')]
  const g = geo(res.attributes)
  if (!kind || !g) return null
  const rawId = res.attributes.field_station_id
  return {
    uuid: res.id,
    kind,
    sourceId: typeof rawId === 'number' ? rawId : null,
    name: String(res.attributes.title ?? ''),
    ...g,
  }
}

export function adaptRegistry(body: {
  data: JsonApiResource[]
  included?: JsonApiResource[]
}): Registry {
  const stationsByUuid = new Map<string, RegistryStation>()
  for (const inc of body.included ?? []) {
    if (inc.type !== 'node--station') continue
    const s = adaptStation(inc)
    if (s) stationsByUuid.set(inc.id, s)
  }

  const destinations: DestinationDef[] = []
  for (const res of body.data) {
    const g = geo(res.attributes)
    const slug = String(res.attributes.field_location_id ?? '')
    if (!g || !slug) continue
    const rel = res.relationships?.field_stations?.data
    const refs = Array.isArray(rel) ? rel : rel ? [rel] : []
    const stations = refs
      .map((r) => stationsByUuid.get(r.id))
      .filter((s): s is RegistryStation => s !== undefined)
    destinations.push({
      id: slug,
      name: String(res.attributes.title ?? slug),
      ...g,
      // No zoom field on the content type yet — destination-level default.
      zoom: 13,
      stationIds: stations.filter((s) => s.kind === 'nearshore' && s.sourceId !== null).map((s) => s.sourceId as number),
      buoyIds: stations.filter((s) => s.kind === 'buoy' && s.sourceId !== null).map((s) => s.sourceId as number),
      includesHomewood: stations.some((s) => s.kind === 'homewood'),
    })
  }
  return { destinations, stations: [...stationsByUuid.values()], fromSite: true }
}

/** The static code registry, adapted to the same shape. */
export function staticRegistry(): Registry {
  const stations: RegistryStation[] = [
    ...NEARSHORE_STATIONS.map((s: StationDef) => ({
      uuid: `static-ns-${s.id}`,
      kind: 'nearshore' as const,
      sourceId: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
    })),
    ...NASA_BUOYS.map((b) => ({
      uuid: `static-buoy-${b.id}`,
      kind: 'buoy' as const,
      sourceId: b.id,
      name: b.name,
      lat: b.lat,
      lng: b.lng,
    })),
    {
      uuid: 'static-met-1',
      kind: 'met' as const,
      sourceId: MET_STATION.id,
      name: MET_STATION.name,
      lat: MET_STATION.lat,
      lng: MET_STATION.lng,
    },
  ]
  return { destinations: DESTINATIONS, stations, fromSite: false }
}

export async function fetchRegistry(): Promise<Registry> {
  return miscCache.getOrFetch('registry:lake-locations', TTL.SHORT, async () => {
    try {
      const res = await fetch(`${JSONAPI_BASE}${REGISTRY_PATH}`)
      if (!res.ok) throw new Error(`registry HTTP ${res.status}`)
      const registry = adaptRegistry(await res.json())
      // An empty destination list means no content yet — fall back so the
      // UI stays usable, but do not cache the fallback as site data.
      if (registry.destinations.length === 0) throw new Error('registry empty')
      return registry
    } catch (err) {
      console.error('[terc] registry fetch failed, using static fallback', err)
      return staticRegistry()
    }
  })
}

export function peekRegistry(): Registry | undefined {
  return miscCache.peek('registry:lake-locations')
}

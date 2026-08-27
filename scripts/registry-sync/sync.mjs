#!/usr/bin/env node
/**
 * Registry sync (TERC-46): seed/update Lake Station and Lake Destinations
 * nodes over JSON:API from the curated registry.data.json, enriched with
 * live activity observed on the TERC report API.
 *
 * Usage:
 *   DRUPAL_BASE_URL=https://terc.ddev.site \
 *   DRUPAL_USER=registry-sync DRUPAL_PASS=... \
 *   node sync.mjs [--dry-run] [--skip-discovery] [--stations-only]
 *
 * Design:
 *  - Upserts are keyed by (field_station_type, field_station_id) for
 *    stations and field_location_id slug for destinations — safe to re-run.
 *  - Names come from the API's Station_Name when a station reports
 *    (authoritative); coordinates only ever come from the curated file.
 *  - Fields the site doesn't have yet (e.g. field_station_status) are
 *    detected and skipped with a warning, so the script works before and
 *    after the content-model additions land.
 *  - Plain Node >= 20, no dependencies. The same functions can be wrapped
 *    in an AWS Lambda handler later for scheduled status sync.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const REPORT_BASE = 'https://tepfsail50.execute-api.us-west-2.amazonaws.com/v1/report'
const FAMILY_ENDPOINT = {
  nearshore_station: 'ns-station-range',
  met_station: 'met-uscg2020',
  nasa_buoy: 'nasa-tb',
  tc_homewood: 'tc-homewood',
}

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const SKIP_DISCOVERY = args.has('--skip-discovery')
const STATIONS_ONLY = args.has('--stations-only')

const BASE = process.env.DRUPAL_BASE_URL
const USER = process.env.DRUPAL_USER
const PASS = process.env.DRUPAL_PASS
if (!BASE || !USER || !PASS) {
  console.error('Set DRUPAL_BASE_URL, DRUPAL_USER, DRUPAL_PASS')
  process.exit(1)
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
const JSONAPI = { 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json', Authorization: AUTH }

const data = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'registry.data.json'), 'utf8'),
)

// ---------------------------------------------------------------- discovery
function dateParam(d) {
  return d.toISOString().slice(0, 10).replaceAll('-', '')
}

/** Probe the report API: 'active' (recent data), 'maintenance' (historical only), 'unobserved'. */
async function discoverActivity(station) {
  const endpoint = FAMILY_ENDPOINT[station.family]
  const now = new Date()
  const windows = [
    ['active', new Date(now - 3 * 864e5), now],
    ['maintenance', new Date(now - 200 * 864e5), new Date(now - 193 * 864e5)],
    ['maintenance', new Date(now - 400 * 864e5), new Date(now - 393 * 864e5)],
    ['maintenance', new Date(now - 600 * 864e5), new Date(now - 593 * 864e5)],
  ]
  for (const [status, s, e] of windows) {
    const id = station.id === null ? '' : `id=${station.id}&`
    const url = `${REPORT_BASE}/${endpoint}?${id}rptdate=${dateParam(s)}&rptend=${dateParam(e)}`
    try {
      const res = await fetch(url)
      const body = res.ok ? await res.json() : []
      await sleep(120)
      if (Array.isArray(body) && body.length > 0) {
        return { status, apiName: body[0].Station_Name ?? null }
      }
    } catch {
      /* network hiccup: try next window */
    }
  }
  return { status: 'unobserved', apiName: null }
}

// ----------------------------------------------------------------- drupal io
async function drupal(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: JSONAPI,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text) : null
}

let stationFieldsCache = null
/** Which curated fields exist on the station type (probe once). */
async function availableStationFields() {
  if (stationFieldsCache) return stationFieldsCache
  const res = await drupal('GET', '/jsonapi/node/station?page[limit]=1')
  const attrs = res.data[0] ? Object.keys(res.data[0].attributes) : []
  stationFieldsCache = new Set(attrs)
  return stationFieldsCache
}

function report(action, label, detail = '') {
  console.log(`${DRY ? '[dry-run] ' : ''}${action.padEnd(8)} ${label}${detail ? ' — ' + detail : ''}`)
}

// ------------------------------------------------------------------ stations
async function upsertStation(station, activity) {
  const filter =
    station.id === null
      ? `filter[field_station_type]=${station.family}`
      : `filter[field_station_type]=${station.family}&filter[field_station_id]=${station.id}`
  const existing = (await drupal('GET', `/jsonapi/node/station?${filter}`)).data[0] ?? null

  const fields = await availableStationFields()
  // Curated display name wins (editors own titles); the API name is
  // surfaced as a mismatch warning in main() so typos still get caught.
  const name = station.name
  // NOTE: no explicit status on create — core restricts setting it to
  // 'administer nodes' accounts. Both bundles must default to published
  // (see README prerequisites); the PATCH path repairs stray unpublished
  // nodes where the account is allowed to.
  const attributes = {
    title: name,
    field_station_id: station.id,
    field_station_type: station.family,
    field_location_geo_data: { lat: station.lat, lng: station.lng },
  }
  if (fields.has('field_station_status') && activity && activity.status !== 'unobserved') {
    attributes.field_station_status = activity.status
  } else if (activity && activity.status !== 'unobserved' && !fields.has('field_station_status')) {
    report('warn', name, 'field_station_status not on content type yet; status not written')
  }

  if (!existing) {
    report('create', `${station.family}:${station.id ?? '-'}`, name)
    if (DRY) return null
    const created = await drupal('POST', '/jsonapi/node/station', {
      data: { type: 'node--station', attributes },
    })
    return created.data.id
  }

  // PATCH only what differs.
  const cur = existing.attributes
  const changed = {}
  if (cur.title !== attributes.title) changed.title = attributes.title
  if (cur.status !== true) changed.status = true
  const g = cur.field_location_geo_data
  if (!g || Math.abs(g.lat - station.lat) > 1e-6 || Math.abs(g.lng - station.lng) > 1e-6) {
    changed.field_location_geo_data = attributes.field_location_geo_data
  }
  if (attributes.field_station_status && cur.field_station_status !== attributes.field_station_status) {
    changed.field_station_status = attributes.field_station_status
  }
  if (Object.keys(changed).length === 0) {
    report('ok', `${station.family}:${station.id ?? '-'}`, name)
    return existing.id
  }
  report('update', `${station.family}:${station.id ?? '-'}`, `${name}: ${Object.keys(changed).join(', ')}`)
  if (DRY) return existing.id
  await drupal('PATCH', `/jsonapi/node/station/${existing.id}`, {
    data: { type: 'node--station', id: existing.id, attributes: changed },
  })
  return existing.id
}

// -------------------------------------------------------------- destinations
async function upsertDestination(dest, stationUuids) {
  const refs = dest.stations
    .map((key) => stationUuids.get(key))
    .filter(Boolean)
    .map((id) => ({ type: 'node--station', id }))
  const missing = dest.stations.filter((k) => !stationUuids.get(k))
  if (missing.length) report('warn', dest.slug, `unresolved station refs: ${missing.join(', ')}`)

  const existing =
    (await drupal('GET', `/jsonapi/node/lake_locations?filter[field_location_id]=${dest.slug}`)).data[0] ?? null

  const attributes = {
    title: dest.name,
    field_location_id: dest.slug,
    field_location_geo_data: { lat: dest.lat, lng: dest.lng },
  }
  const relationships = { field_stations: { data: refs } }

  if (!existing) {
    report('create', dest.slug, dest.name)
    if (DRY) return
    await drupal('POST', '/jsonapi/node/lake_locations', {
      data: { type: 'node--lake_locations', attributes, relationships },
    })
    return
  }

  const cur = existing.attributes
  const curRefs = (existing.relationships?.field_stations?.data ?? []).map((r) => r.id).sort()
  const newRefs = refs.map((r) => r.id).sort()
  const changed = {}
  if (cur.title !== dest.name) changed.title = dest.name
  if (cur.status !== true) changed.status = true
  const g = cur.field_location_geo_data
  if (!g || Math.abs(g.lat - dest.lat) > 1e-6 || Math.abs(g.lng - dest.lng) > 1e-6) {
    changed.field_location_geo_data = attributes.field_location_geo_data
  }
  const refsChanged = JSON.stringify(curRefs) !== JSON.stringify(newRefs)
  if (Object.keys(changed).length === 0 && !refsChanged) {
    report('ok', dest.slug, dest.name)
    return
  }
  report('update', dest.slug, [...Object.keys(changed), refsChanged ? 'field_stations' : ''].filter(Boolean).join(', '))
  if (DRY) return
  await drupal('PATCH', `/jsonapi/node/lake_locations/${existing.id}`, {
    data: {
      type: 'node--lake_locations',
      id: existing.id,
      attributes: changed,
      ...(refsChanged ? { relationships } : {}),
    },
  })
}

// ---------------------------------------------------------------------- main
const stationUuids = new Map()
let failures = 0
for (const station of data.stations) {
  const activity = SKIP_DISCOVERY ? null : await discoverActivity(station)
  if (activity) {
    const key = `${station.family}:${station.id ?? '-'}`
    console.log(`observe  ${key.padEnd(22)} ${activity.status}${activity.apiName ? ` (${activity.apiName})` : ''}`)
    if (activity.apiName && activity.apiName !== station.name) {
      report('note', station.name, `API reports name "${activity.apiName}" — keeping curated name`)
    }
  }
  try {
    const uuid = await upsertStation(station, activity)
    stationUuids.set(`${station.family}:${station.id ?? ''}`, uuid)
  } catch (err) {
    failures++
    report('skip', `${station.family}:${station.id ?? '-'}`, String(err.message).slice(0, 160))
  }
}

if (!STATIONS_ONLY) {
  for (const dest of data.destinations) {
    try {
      await upsertDestination(dest, stationUuids)
    } catch (err) {
      failures++
      report('skip', dest.slug, String(err.message).slice(0, 160))
    }
  }
}
console.log(failures ? `done with ${failures} skipped item(s) — see warnings above` : 'done')
process.exitCode = failures ? 2 : 0

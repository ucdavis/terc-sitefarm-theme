#!/usr/bin/env node
/**
 * Registry sync (TERC-46): seed/update Lake Station and Lake Destinations
 * nodes over JSON:API from the curated registry.data.json, enriched with
 * live activity observed on the TERC report API.
 *
 * Usage:
 *   DRUPAL_BASE_URL=https://terc.ddev.site \
 *   DRUPAL_USER=registry-sync DRUPAL_PASS=... \
 *   node sync.mjs [--dry-run] [--skip-discovery] [--stations-only] [--bands-only] [--skip-bands]
 *
 * Design:
 *  - Upserts are keyed by (field_station_type, field_station_id) for
 *    stations and field_location_id slug for destinations — safe to re-run.
 *  - Names and coordinates only ever come from the curated file (and after
 *    handoff, from editors); the API's Station_Name is surfaced as a
 *    mismatch note, never written.
 *  - Station status is CURATED when the file gives one (TERC-96): a
 *    "status" key, pulled from the site by pull.mjs, is what editors set,
 *    and it wins. Status: null means the site leaves it empty — nothing is
 *    written. Only a station with no "status" key at all falls back to the
 *    activity observed on the report API, which cannot tell a working
 *    station from one that transmits barometric pressure out of the water.
 *  - Coordinates count as equal within half a unit of the file's fifth
 *    decimal, so values pulled from the site and rounded (pull.mjs) do not
 *    re-write the site's own clicks on every run.
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
const BANDS_ONLY = args.has('--bands-only')
// Stations + destinations, but leave condition_bands alone. Destinations only
// sync in the "everything" mode, which used to mean the bands sync ran too —
// and that must not happen once editors own the band sentences (it overwrites
// their words). This is the safe way to push registry changes to a live site.
const SKIP_BANDS = args.has('--skip-bands')

const BASE = process.env.DRUPAL_BASE_URL
const USER = process.env.DRUPAL_USER
const PASS = process.env.DRUPAL_PASS
if (!BASE || !USER || !PASS) {
  console.error('Set DRUPAL_BASE_URL, DRUPAL_USER, DRUPAL_PASS')
  process.exit(1)
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
// Distinctive, stable client identity (Node's default UA is just "node").
// Referenced by the Cloudflare exception for *.sf.ucdavis.edu — keep in
// sync with that rule if it ever changes.
export const USER_AGENT = 'TERC-RegistrySync/1.0 (UC Davis IET; TERC-46)'
const JSONAPI = { 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json', Authorization: AUTH, 'User-Agent': USER_AGENT }
// Optional extra header (e.g. a WAF bypass token: SYNC_HEADER="X-Header-Name: <secret>";
// the real name lives only in .env and the Cloudflare rule).
// Needed where a CDN/WAF (Cloudflare on *.sf.ucdavis.edu) challenges non-browser clients.
if (process.env.SYNC_HEADER) {
  const idx = process.env.SYNC_HEADER.indexOf(':')
  if (idx > 0) JSONAPI[process.env.SYNC_HEADER.slice(0, idx).trim()] = process.env.SYNC_HEADER.slice(idx + 1).trim()
}

const here = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(here, 'registry.data.json'), 'utf8'))
const bandsData = JSON.parse(readFileSync(join(here, 'bands.data.json'), 'utf8'))

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
      const res = await fetch(url, { headers: { 'User-Agent': 'TERC-RegistrySync/1.0 (UC Davis IET; TERC-46)' } })
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

const fieldCache = new Map()
/**
 * Does `bundle` have `field`? Asked of the SCHEMA, not of an existing node.
 *
 * The first version read the attribute keys off the first node it found. On
 * a site with no nodes yet — prod, on its first sync — that found nothing,
 * so every optional field read as "not on content type yet" and the run
 * would have created every station without its status and every
 * destination without its zoom.
 *
 * Instead, filter on the field with IS NULL. JSON:API answers 200 for a real
 * field whether or not any node exists, and 400 "Invalid nested filtering
 * ... does not exist" for one that is not on the bundle. IS NULL needs no
 * value, so it works for any field type. Anything else (403 from a WAF,
 * 5xx) is not an answer, so it throws rather than guess "absent".
 */
async function hasField(bundle, field) {
  const key = `${bundle}.${field}`
  if (fieldCache.has(key)) return fieldCache.get(key)
  const path =
    `/jsonapi/node/${bundle}?filter[p][condition][path]=${field}` +
    '&filter[p][condition][operator]=IS%20NULL&page[limit]=1'
  let exists
  try {
    await drupal('GET', path)
    exists = true
  } catch (err) {
    const msg = String(err?.message ?? err)
    if (/HTTP 400/.test(msg) && /does not exist/.test(msg)) exists = false
    else throw new Error(`could not tell whether ${key} exists: ${msg.slice(0, 160)}`)
  }
  fieldCache.set(key, exists)
  return exists
}

/**
 * field_location_zoom (TERC-89). Written as a JSON number and compared with
 * Number(): a decimal field serializes as a STRING over JSON:API ("11.25",
 * or "11.250000" depending on scale) while a float field comes back as a
 * number, so a plain !== would report a change on every run. null or
 * unparseable counts as unset.
 */
function sameZoom(current, wanted) {
  const n = current === null || current === undefined || current === '' ? NaN : Number(current)
  return Number.isFinite(n) && Math.abs(n - wanted) < 1e-6
}

let zoomFieldWarned = false

function report(action, label, detail = '') {
  console.log(`${DRY ? '[dry-run] ' : ''}${action.padEnd(8)} ${label}${detail ? ' — ' + detail : ''}`)
}

/** Equal at the file's precision: within half a unit of the fifth decimal
 *  (+/-0.55 m here). The site may hold an editor's twelve-decimal click that
 *  pull.mjs rounded; that is the same place, not a change to write back. */
const sameCoord = (a, b) => Math.abs(a - b) <= 5e-6 + 1e-12

// ------------------------------------------------------------------ stations
async function upsertStation(station, activity) {
  const filter =
    station.id === null
      ? `filter[field_station_type]=${station.family}`
      : `filter[field_station_type]=${station.family}&filter[field_station_id]=${station.id}`
  const existing = (await drupal('GET', `/jsonapi/node/station?${filter}`)).data[0] ?? null

  const hasStatus = await hasField('station', 'field_station_status')
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
  // Curated status wins (TERC-96); observed activity only fills a station the
  // file says nothing about.
  const curated = Object.hasOwn(station, 'status')
  const wanted = curated ? station.status : activity && activity.status !== 'unobserved' ? activity.status : null
  if (hasStatus && wanted) {
    attributes.field_station_status = wanted
  } else if (wanted && !hasStatus) {
    report('warn', name, 'field_station_status not on content type yet; status not written')
  }

  if (!existing) {
    const statusNote = attributes.field_station_status ? ` [status: ${attributes.field_station_status}]` : ''
    report('create', `${station.family}:${station.id ?? '-'}`, name + statusNote)
    // A dry run creates nothing, so there is no uuid yet — but the station
    // WILL exist by the time this run reaches destinations. Hand back a
    // placeholder so destinations can see the ref resolves; without it, a
    // first sync to an empty site flagged every destination ref as
    // "unresolved". Never sent: every write path returns early under DRY.
    if (DRY) return `planned:${station.family}:${station.id ?? '-'}`
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
  if (!g || !sameCoord(g.lat, station.lat) || !sameCoord(g.lng, station.lng)) {
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
  // Zoom goes in only when the content type has the field AND the curated
  // record carries one, so the sync still runs against a site that predates
  // the field (it warns once instead of failing every destination).
  const zoomField = await hasField('lake_locations', 'field_location_zoom')
  const hasZoom = typeof dest.zoom === 'number' && Number.isFinite(dest.zoom)
  const writeZoom = hasZoom && zoomField
  if (writeZoom) attributes.field_location_zoom = dest.zoom
  if (hasZoom && !zoomField && !zoomFieldWarned) {
    zoomFieldWarned = true
    report('warn', 'lake_locations', 'field_location_zoom not on content type yet; zoom not written')
  }
  const relationships = { field_stations: { data: refs } }

  if (!existing) {
    report('create', dest.slug, dest.name + (writeZoom ? ` [zoom: ${dest.zoom}]` : ''))
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
  if (!g || !sameCoord(g.lat, dest.lat) || !sameCoord(g.lng, dest.lng)) {
    changed.field_location_geo_data = attributes.field_location_geo_data
  }
  if (writeZoom && !sameZoom(cur.field_location_zoom, dest.zoom)) {
    changed.field_location_zoom = dest.zoom
  }
  const refsChanged = JSON.stringify(curRefs) !== JSON.stringify(newRefs)
  if (Object.keys(changed).length === 0 && !refsChanged) {
    report('ok', dest.slug, dest.name)
    return
  }
  // Name each changed field; zoom carries its before/after inline, since it
  // is the value people check.
  const what = [...Object.keys(changed), refsChanged ? 'field_stations' : '']
    .filter(Boolean)
    .map((f) => (f === 'field_location_zoom'
      ? `field_location_zoom (${JSON.stringify(cur.field_location_zoom)} -> ${dest.zoom})`
      : f))
  report('update', dest.slug, what.join(', '))
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

// ----------------------------------------------------------- condition bands
/**
 * Condition interpretation bands (TERC-52): taxonomy terms in the
 * condition_bands vocabulary, upserted from bands.data.json keyed by
 * (field_metric_key, name). Terms are published by default, so there is no
 * status dance here. Needs 'create/edit terms in condition_bands' on the
 * sync role.
 *
 * NOTE: after editors take ownership of the sentences in Drupal, re-running
 * this OVERWRITES their edits with the curated file — the run reports every
 * 'update' first in --dry-run, so check before syncing bands to a site with
 * editorial changes (or use --stations-only).
 */
async function upsertBand(band) {
  const vocab = bandsData.vocabulary
  const path = `/jsonapi/taxonomy_term/${vocab}`
  const filter = `filter[field_metric_key]=${encodeURIComponent(band.metric)}&filter[name]=${encodeURIComponent(band.label)}`
  const existing = (await drupal('GET', `${path}?${filter}`)).data[0] ?? null

  const attributes = {
    name: band.label,
    field_metric_key: band.metric,
    field_band_max_value: band.max,
    field_band_tone: band.tone,
    field_band_sentence: band.sentence,
  }
  const key = `${band.metric}/${band.label}`

  if (!existing) {
    report('create', key, band.max === null ? 'open-ended top band' : `max ${band.max}`)
    if (DRY) return
    await drupal('POST', path, { data: { type: `taxonomy_term--${vocab}`, attributes } })
    return
  }

  const cur = existing.attributes
  const changed = {}
  const curMax = cur.field_band_max_value ?? null
  const sameMax =
    (curMax === null && band.max === null) ||
    (curMax !== null && band.max !== null && Math.abs(curMax - band.max) < 1e-9)
  if (!sameMax) changed.field_band_max_value = band.max
  if (cur.field_band_tone !== band.tone) changed.field_band_tone = band.tone
  if ((cur.field_band_sentence ?? '') !== band.sentence) changed.field_band_sentence = band.sentence
  if (Object.keys(changed).length === 0) {
    report('ok', key)
    return
  }
  report('update', key, Object.keys(changed).join(', '))
  if (DRY) return
  await drupal('PATCH', `${path}/${existing.id}`, {
    data: { type: `taxonomy_term--${vocab}`, id: existing.id, attributes: changed },
  })
}

// ---------------------------------------------------------------------- main
const stationUuids = new Map()
let failures = 0
for (const station of BANDS_ONLY ? [] : data.stations) {
  const activity = SKIP_DISCOVERY ? null : await discoverActivity(station)
  if (activity) {
    const key = `${station.family}:${station.id ?? '-'}`
    console.log(`observe  ${key.padEnd(22)} ${activity.status}${activity.apiName ? ` (${activity.apiName})` : ''}`)
    if (activity.apiName && activity.apiName !== station.name) {
      report('note', station.name, `API reports name "${activity.apiName}" — keeping curated name`)
    }
    // A curated status is kept (TERC-96), but say when the API disagrees: it
    // may be the file that is out of date.
    if (station.status && activity.status !== 'unobserved' && activity.status !== station.status) {
      report('note', station.name, `API activity looks "${activity.status}" — keeping curated status "${station.status}"`)
    }
  }
  try {
    const uuid = await upsertStation(station, activity)
    stationUuids.set(`${station.family}:${station.id ?? ''}`, uuid)
  } catch (err) {
    failures++
    report('skip', `${station.family}:${station.id ?? '-'}`, String(err?.message ?? err).slice(0, 160))
  }
}

if (!STATIONS_ONLY && !BANDS_ONLY) {
  for (const dest of data.destinations) {
    try {
      await upsertDestination(dest, stationUuids)
    } catch (err) {
      failures++
      report('skip', dest.slug, String(err?.message ?? err).slice(0, 160))
    }
  }
}

if (!STATIONS_ONLY && !SKIP_BANDS) {
  for (const band of bandsData.bands) {
    try {
      await upsertBand(band)
    } catch (err) {
      failures++
      report('skip', `${band.metric}/${band.label}`, String(err?.message ?? err).slice(0, 160))
    }
  }
}
console.log(failures ? `done with ${failures} skipped item(s) — see warnings above` : 'done')
process.exitCode = failures ? 2 : 0

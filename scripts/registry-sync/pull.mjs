#!/usr/bin/env node
/**
 * Registry pull (TERC-96): the reverse of sync.mjs. Reads the station and
 * destination nodes a site actually has, over public JSON:API GETs, and
 * brings them back into registry.data.json — so the curated file (and a
 * re-seed from it) keeps what editors did on the site instead of undoing it.
 *
 * Usage:
 *   node pull.mjs                                  # report differences only
 *   node pull.mjs --write                          # ...and update registry.data.json
 *   PULL_BASE_URL=https://tercdev.sf.ucdavis.edu node pull.mjs
 *
 * Read-only against the site: GET requests, no credentials. Defaults to prod
 * (https://tahoe.ucdavis.edu). SYNC_HEADER is sent if set (a WAF bypass for
 * *.sf.ucdavis.edu; see sync.mjs) — never hard-code its name here.
 *
 * What it carries back, keyed the same way sync.mjs upserts:
 *  - stations by (field_station_type, field_station_id): name, coordinates,
 *    field_station_status (null when the site leaves it empty);
 *  - destinations by field_location_id: name, coordinates, zoom, and the
 *    station list, in the site's order.
 * Everything else in the file — notes, sources, the `_comment` keys — is
 * kept. Coordinates are rounded to the file's five decimals (±0.4 m; see
 * `_precision`): a point placed by clicking the editor's map arrives with
 * twelve, which is precision the click never had.
 *
 * vue/config/destinations.ts mirrors the destinations by hand (it carries
 * the reasoning as comments); destinationsFallback.test.ts fails until it
 * matches the file again, and says what differs.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.PULL_BASE_URL ?? 'https://tahoe.ucdavis.edu').replace(/\/$/, '')
const WRITE = process.argv.includes('--write')
const HEADERS = { Accept: 'application/vnd.api+json', 'User-Agent': 'TERC-RegistryPull/1.0 (UC Davis IET; TERC-96)' }
if (process.env.SYNC_HEADER) {
  const idx = process.env.SYNC_HEADER.indexOf(':')
  if (idx > 0) HEADERS[process.env.SYNC_HEADER.slice(0, idx).trim()] = process.env.SYNC_HEADER.slice(idx + 1).trim()
}

const here = dirname(fileURLToPath(import.meta.url))
const FILE = join(here, 'registry.data.json')
const data = JSON.parse(readFileSync(FILE, 'utf8'))

/** Every page of a JSON:API collection. */
async function getAll(path) {
  const out = []
  let url = `${BASE}${path}`
  while (url) {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
    const body = await res.json()
    out.push(...body.data)
    url = body.links?.next?.href ?? null
  }
  return out
}

export const round5 = (n) => Math.round(n * 1e5) / 1e5
const stationKey = (family, id) => `${family}:${id ?? ''}`
const fmt = (v) => JSON.stringify(v)

const changes = []
function set(obj, field, value, label) {
  const before = obj[field]
  if (JSON.stringify(before) === JSON.stringify(value)) return
  changes.push(`${label}: ${field} ${before === undefined ? '(none)' : fmt(before)} -> ${fmt(value)}`)
  obj[field] = value
}

const siteStations = await getAll('/jsonapi/node/station?page[limit]=50')
const siteDests = await getAll('/jsonapi/node/lake_locations?page[limit]=50')

// ------------------------------------------------------------------ stations
const keyByUuid = new Map()
for (const n of siteStations) {
  const a = n.attributes
  const key = stationKey(a.field_station_type, a.field_station_id)
  keyByUuid.set(n.id, key)
  if (!a.status) {
    console.log(`skip     ${key.padEnd(22)} unpublished on the site`)
    continue
  }
  let rec = data.stations.find((s) => stationKey(s.family, s.id) === key)
  if (!rec) {
    rec = { family: a.field_station_type, id: a.field_station_id ?? null, verified: false, source: `added on ${BASE}` }
    data.stations.push(rec)
    changes.push(`${key}: NEW station "${a.title}"`)
  }
  set(rec, 'name', a.title, key)
  const g = a.field_location_geo_data
  if (g) {
    const lat = round5(g.lat)
    const lng = round5(g.lng)
    if (rec.lat !== lat || rec.lng !== lng) {
      set(rec, 'lat', lat, key)
      set(rec, 'lng', lng, key)
      rec.source = `placed by an editor on ${BASE} (pulled ${new Date().toISOString().slice(0, 10)})`
    }
  }
  set(rec, 'status', a.field_station_status ?? null, key)
}
for (const s of data.stations) {
  const key = stationKey(s.family, s.id)
  if (![...keyByUuid.values()].includes(key)) console.log(`note     ${key.padEnd(22)} in the file but not on the site (kept)`)
}

// -------------------------------------------------------------- destinations
for (const n of siteDests) {
  const a = n.attributes
  const slug = a.field_location_id
  if (!slug) {
    console.log(`skip     "${a.title}" has no field_location_id, so sync.mjs could never match it`)
    continue
  }
  if (!a.status) {
    console.log(`skip     ${slug.padEnd(22)} unpublished on the site`)
    continue
  }
  let rec = data.destinations.find((d) => d.slug === slug)
  if (!rec) {
    rec = { slug }
    data.destinations.push(rec)
    changes.push(`${slug}: NEW destination "${a.title}"`)
  }
  set(rec, 'name', a.title, slug)
  const g = a.field_location_geo_data
  if (g) {
    set(rec, 'lat', round5(g.lat), slug)
    set(rec, 'lng', round5(g.lng), slug)
  }
  // Decimal fields serialize as strings ("13.00").
  if (a.field_location_zoom !== null && a.field_location_zoom !== undefined) {
    set(rec, 'zoom', Number(a.field_location_zoom), slug)
  }
  const refs = (n.relationships.field_stations?.data ?? []).map((r) => keyByUuid.get(r.id) ?? `unresolved:${r.id}`)
  // Membership is a set; keep the file's order when only the order differs.
  const same = rec.stations && rec.stations.length === refs.length && refs.every((r) => rec.stations.includes(r))
  if (!same) set(rec, 'stations', refs, slug)
}
for (const d of data.destinations) {
  if (!siteDests.some((n) => n.attributes.field_location_id === d.slug)) {
    console.log(`note     ${d.slug.padEnd(22)} in the file but not on the site (kept)`)
  }
}

// ---------------------------------------------------------------------- out
console.log(`\n${BASE}: ${siteStations.length} stations, ${siteDests.length} destinations`)
console.log(changes.length ? changes.map((c) => `  ${c}`).join('\n') : '  registry.data.json already matches')
if (changes.length && WRITE) {
  // JSON.stringify drops trailing zeros; restore the five-decimal column.
  const text = JSON.stringify(data, null, 2).replace(
    /"(lat|lng)": (-?\d+(?:\.\d+)?)/g,
    (_, k, v) => `"${k}": ${Number(v).toFixed(5)}`,
  )
  writeFileSync(FILE, text)
  console.log(`\nwrote ${FILE}\nnow mirror the destinations in vue/config/destinations.ts (the test says what differs)`)
} else if (changes.length) {
  console.log('\n(report only — pass --write to update registry.data.json)')
}

#!/usr/bin/env node
/**
 * Generate a self-contained drush php:script that applies the registry
 * (TERC-46) — the Cloudflare-free path. Runs the same discovery as
 * sync.mjs, merges with registry.data.json, and emits
 * dist/apply-plan.generated.php with the plan embedded. Apply with:
 *
 *   local:   ddev exec drush scr <path>/apply-plan.generated.php -- --dry-run
 *   tercdev: drush @ucdsitefarm.01dev --uri=https://tercdev.sf.ucdavis.edu \
 *              scr apply-plan.generated.php -- --dry-run
 *            (copy the file somewhere the remote drush can read first)
 *
 * No credentials, no JSON:API exposure, no WAF involvement — the applier
 * runs inside Drupal with the entity API.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPORT_BASE = 'https://tepfsail50.execute-api.us-west-2.amazonaws.com/v1/report'
const FAMILY_ENDPOINT = {
  nearshore_station: 'ns-station-range',
  met_station: 'met-uscg2020',
  nasa_buoy: 'nasa-tb',
  tc_homewood: 'tc-homewood',
}
const SKIP_DISCOVERY = process.argv.includes('--skip-discovery')

const dateParam = (d) => d.toISOString().slice(0, 10).replaceAll('-', '')

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
    try {
      const res = await fetch(`${REPORT_BASE}/${endpoint}?${id}rptdate=${dateParam(s)}&rptend=${dateParam(e)}`)
      const body = res.ok ? await res.json() : []
      await sleep(120)
      if (Array.isArray(body) && body.length > 0) return { status, apiName: body[0].Station_Name ?? null }
    } catch { /* try next window */ }
  }
  return { status: 'unobserved', apiName: null }
}

const data = JSON.parse(readFileSync(join(HERE, 'registry.data.json'), 'utf8'))
const plan = { generated: new Date().toISOString(), stations: [], destinations: data.destinations }
for (const station of data.stations) {
  const activity = SKIP_DISCOVERY ? null : await discoverActivity(station)
  if (activity) console.log(`observe ${station.family}:${station.id ?? '-'} ${activity.status}${activity.apiName ? ` (${activity.apiName})` : ''}`)
  plan.stations.push({ ...station, observedStatus: activity && activity.status !== 'unobserved' ? activity.status : null })
}

const template = readFileSync(join(HERE, 'apply-plan.template.php'), 'utf8')
const php = template.replace('__PLAN_JSON__', JSON.stringify(plan, null, 1).replaceAll("'", "\\'"))
mkdirSync(join(HERE, 'dist'), { recursive: true })
const out = join(HERE, 'dist', 'apply-plan.generated.php')
writeFileSync(out, php)
console.log(`wrote ${out} (${plan.stations.length} stations, ${plan.destinations.length} destinations)`)

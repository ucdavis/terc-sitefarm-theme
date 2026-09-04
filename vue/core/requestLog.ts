/**
 * Endpoint request log (TERC-62): what the block asked the outside world,
 * and what came back. Powers the editor-togglable Endpoint diagnostics
 * panel — the "is it us or the API" answer, available while things work
 * as well as when they don't.
 *
 * Every network call in the data layer goes through `tracedFetch`. When
 * the log is disabled (the default: no block on the page has the panel
 * on) it is a straight pass-through to `fetch` — no timing, no records,
 * no reactivity, so visitors pay nothing for it.
 */
import { shallowRef } from 'vue'

export type RequestPhase = 'pending' | 'ok' | 'http-error' | 'failed'

export interface RequestEntry {
  id: number
  /** Human label for the endpoint family, derived from the URL. */
  endpoint: string
  url: string
  startedAt: Date
  /** Round-trip in ms once settled. */
  ms: number | null
  status: number | null
  phase: RequestPhase
  /** Response size from Content-Length when the server sends it. */
  bytes: number | null
  /** Record count, when the caller reports it after parsing. */
  records: number | null
  error: string | null
}

const MAX_ENTRIES = 200

let enabled = false
let nextId = 1

/** Newest first. A new array on every change (shallowRef). */
export const requestLog = shallowRef<RequestEntry[]>([])

export function enableRequestLog(): void {
  enabled = true
}

export function isRequestLogEnabled(): boolean {
  return enabled
}

/** Test hook. */
export function resetRequestLogForTests(): void {
  enabled = false
  nextId = 1
  requestLog.value = []
}

function update(id: number, patch: Partial<RequestEntry>): void {
  const i = requestLog.value.findIndex((e) => e.id === id)
  if (i === -1) return
  const next = requestLog.value.slice()
  next[i] = { ...next[i], ...patch }
  requestLog.value = next
}

/**
 * Name the endpoint family behind a URL so the panel can group rows
 * (one line per family, not one per frame). Unknown URLs keep their host.
 */
export function describeEndpoint(url: string): string {
  let u: URL
  try {
    u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost/')
  } catch {
    return url
  }
  const path = u.pathname
  if (path.includes('/report/')) {
    const family = path.split('/report/')[1]
    const id = u.searchParams.get('id')
    return `report · ${family}${id ? ` #${id}` : ''}`
  }
  if (path.includes('/jsonapi/')) {
    const resource = path.split('/jsonapi/')[1].replace(/\/$/, '')
    return `site · ${resource}`
  }
  if (u.hostname.includes('api.weather.gov')) return 'noaa · gridpoint forecast'
  if (u.hostname.includes('lake-tahoe-conditions')) {
    if (path.endsWith('/contents.json')) return 's3 · manifest'
    if (path.includes('/waveheight/')) return 's3 · wave bucket'
    const variable = path.split('/').filter(Boolean)[0]
    return `s3 · grid ${variable ?? ''}`.trim()
  }
  return u.hostname
}

/**
 * `fetch` with a diary. Records start, status, duration, size and failure;
 * rethrows exactly what `fetch` would. Callers that parse a list should
 * report its length with `noteRecords` so the panel can show it.
 */
export async function tracedFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!enabled) return fetch(url, init)
  const id = nextId++
  const entry: RequestEntry = {
    id,
    endpoint: describeEndpoint(url),
    url,
    startedAt: new Date(),
    ms: null,
    status: null,
    phase: 'pending',
    bytes: null,
    records: null,
    error: null,
  }
  requestLog.value = [entry, ...requestLog.value].slice(0, MAX_ENTRIES)
  const t0 = performance.now()
  try {
    const res = await fetch(url, init)
    update(id, {
      ms: Math.round(performance.now() - t0),
      status: res.status,
      phase: res.ok ? 'ok' : 'http-error',
      bytes: contentLength(res),
      error: res.ok ? null : `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
    })
    return res
  } catch (err) {
    update(id, {
      ms: Math.round(performance.now() - t0),
      phase: 'failed',
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    })
    throw err
  }
}

/** Content-Length as a number, or null when absent or not a plain integer. */
function contentLength(res: Response): number | null {
  const len = res.headers.get('content-length')
  return len !== null && /^\d+$/.test(len.trim()) ? Number(len) : null
}

/**
 * Attach a parsed record count to the request it came from: the newest
 * SETTLED entry for `url` that has no count yet. Matching by URL alone
 * could hand the count to a newer, still-pending request for the same
 * URL (the parse of one finishes while the next is in flight).
 */
export function noteRecords(url: string, records: number): void {
  if (!enabled) return
  const e = requestLog.value.find((x) => x.url === url && x.phase !== 'pending' && x.records === null)
  if (e) update(e.id, { records })
}

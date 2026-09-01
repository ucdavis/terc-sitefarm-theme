/**
 * Phase 2 data module — modeled temperature + flow grids from S3 (TERC-38).
 *
 * The model output isn't an API — it's a folder of NumPy files in the
 * lake-tahoe-conditions bucket with an index. contents.json lists ~205
 * frames per variable: a rolling window ~2 weeks back and ~3 days forward
 * at 2-hour spacing that advances daily (occasional off-cadence hours
 * appear — the parser accepts any hour). Filenames look like
 * "2026-07-15 14.npy" — the literal space must be URL-encoded.
 *
 * Caching: the manifest takes TTL.SHORT (it advances daily and the model
 * can be re-run); frames for PAST hours are immutable and cached FOREVER,
 * future/current frames take TTL.SHORT. Decoded grids are cached
 * NORMALIZED — a cache hit never re-parses bytes (see gridDecode.ts).
 *
 * TIMEZONE ASSUMPTION: frame names are lake wall-clock (America/Los_Angeles),
 * carried over from the prototype. Unlike the prototype — which used the
 * viewer's local clock and was only right for Pacific visitors — the
 * assumption is pinned via lakeWallTimeToDate (TERC-43 rule), so every
 * viewer sees the same instants. If TERC confirms the model writes UTC
 * names instead, only parseFrameName changes.
 *
 * CORS: the bucket serves ACAO:* with GET+HEAD allowed and ETag exposed
 * (verified live 2026-09-01, TERC-41) — fetches are direct, no proxy.
 */
import { S3_BASE } from '../config/endpoints'
import { gridCache, miscCache, TTL } from '../core/cache'
import { lakeWallTimeToDate } from '../core/time'
import { decodeGrid, type GridVariable, type ScalarGrid } from './gridDecode'

export type { GridVariable, ScalarGrid }

export interface ModelFrame {
  filename: string
  /** "2026-07-15" (lake-time calendar date). */
  date: string
  /** 0–23 (lake-time hour). */
  hour: number
  /** The instant this frame represents (see TIMEZONE ASSUMPTION above). */
  time: Date
}

export interface ModelManifest {
  temperature: ModelFrame[]
  flow: ModelFrame[]
}

export function parseFrameName(filename: string): ModelFrame | null {
  const m = filename.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.npy$/)
  if (!m) return null
  const [, y, mo, d, h] = m
  return {
    filename,
    date: `${y}-${mo}-${d}`,
    hour: Number.parseInt(h, 10),
    time: lakeWallTimeToDate(Number(y), Number(mo), Number(d), Number(h)),
  }
}

export async function fetchModelManifest(): Promise<ModelManifest> {
  return miscCache.getOrFetch('model-manifest', TTL.SHORT, async () => {
    const res = await fetch(`${S3_BASE}/contents.json`)
    if (!res.ok) throw new Error(`contents.json HTTP ${res.status}`)
    const body = (await res.json()) as { temperature?: string[]; flow?: string[] }
    const toFrames = (names: string[] | undefined) =>
      (names ?? [])
        .map(parseFrameName)
        .filter((f): f is ModelFrame => f !== null)
        .sort((a, b) => a.time.getTime() - b.time.getTime())
    return { temperature: toFrames(body.temperature), flow: toFrames(body.flow) }
  })
}

async function fetchGridBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${S3_BASE}/${path}`)
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
  return res.arrayBuffer()
}

/** Past model hours never change; future/current hours may be re-run. */
function ttlForFrame(frame: ModelFrame): number {
  return frame.time.getTime() < Date.now() - 60 * 60_000 ? TTL.FOREVER : TTL.SHORT
}

export function gridKey(variable: GridVariable, frame: ModelFrame) {
  return `${variable}:${frame.filename}`
}

export async function fetchGrid(
  variable: GridVariable,
  frame: ModelFrame,
  opts: { prefetch?: boolean } = {},
): Promise<ScalarGrid> {
  return gridCache.getOrFetch(
    gridKey(variable, frame),
    ttlForFrame(frame),
    async () => {
      const buf = await fetchGridBytes(`${variable}/${encodeURIComponent(frame.filename)}`)
      return decodeGrid(variable, buf)
    },
    opts,
  )
}

export function fetchTemperatureGrid(frame: ModelFrame, opts: { prefetch?: boolean } = {}) {
  return fetchGrid('temperature', frame, opts)
}

export function fetchCurrentSpeedGrid(frame: ModelFrame, opts: { prefetch?: boolean } = {}) {
  return fetchGrid('flow', frame, opts)
}

/**
 * Background prefetch of adjacent frames after a view settles, nearest
 * first, alternating forward/back. Uses the same cache, so stepping to a
 * prefetched hour is a synchronous hit. Prefetch failures are silent; the
 * foreground fetch surfaces errors.
 */
export function prefetchAdjacentFrames(
  variable: GridVariable,
  frames: ModelFrame[],
  centerIndex: number,
  radius = 4,
): void {
  const order: number[] = []
  for (let d = 1; d <= radius; d++) {
    order.push(centerIndex + d, centerIndex - d)
  }
  for (const i of order) {
    if (i < 0 || i >= frames.length) continue
    const frame = frames[i]
    if (gridCache.has(gridKey(variable, frame))) continue
    fetchGrid(variable, frame, { prefetch: true }).catch(() => {
      /* see docblock */
    })
  }
}

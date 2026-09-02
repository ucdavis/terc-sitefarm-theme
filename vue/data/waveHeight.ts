/**
 * Precomputed STWAVE wave-height solutions (TERC-24).
 *
 * Rather than running a wave model live, TERC precomputed the answer for
 * every wind speed and direction: /waveheight/H_ws{N}_wd{DDD}.json, a
 * nested 695 × 406 array (much finer than the 174×102 model grids; the
 * renderer handles both). ws is wind speed in m/s (integer, 0–15), wd is
 * direction in 5° steps. Consecutive hours often resolve to the SAME
 * bucket, so a 24-hour animation frequently needs only one or two
 * downloads.
 *
 * VERIFIED LIVE (2026-09-02):
 *  - S3 returns 200 for existing keys and 403 (not 404) for missing ones,
 *    with CORS headers on both, so a browser can tell them apart.
 *  - Spot checks across the ws 0–15 × wd 0–355 matrix all answered 200,
 *    matching the ticket's 288/288 sampled probe.
 *
 * Deliberately NO startup availability probe. The prototype fired 288 HEAD
 * requests per browser (cached in localStorage) to rediscover this static
 * matrix; that is a lot of traffic from every visitor to learn something
 * already known, and the 403-triggered neighbour search below covers any
 * gap anyway — ending, if everything nearby is missing too, in an explicit
 * "no solution close enough" error rather than a blank map.
 *
 * LAND vs FLAT WATER — the ticket's flagged defect, now measured:
 * STWAVE writes land as exact 0, not null, so exact-zero renders
 * transparent. Measured across live buckets, every ws >= 1 file has
 * EXACTLY the same 198,910 non-zero cells (70.5% of the grid), perfectly
 * nested — so at any real wind, zero means land and nothing else. Only
 * ws = 0 is degenerate: that file is entirely zeros, because every water
 * cell genuinely has no waves. Since the water mask is identical in every
 * other bucket, ws = 0 borrows its shape from ws = 1 and renders the lake
 * flat at 0 ft, instead of the whole lake disappearing.
 */
import { S3_BASE } from '../config/endpoints'
import { WAVE_GRID_FLIP_HORIZONTAL, WAVE_GRID_FLIP_VERTICAL } from '../config/lakeGrid'
import { gridCache, TTL } from '../core/cache'
import { mToFt } from '../core/units'
import type { ScalarGrid } from './gridDecode'

export interface WaveBucket {
  /** Wind speed in m/s, integer 0–15. */
  ws: number
  /** Wind direction in degrees, multiple of 5. */
  wd: number
}

export const WS_RANGE = { min: 0, max: 15 } as const
export const WD_STEP = 5

export function bucketFile(b: WaveBucket): string {
  return `H_ws${b.ws}_wd${b.wd}.json`
}

export const bucketKey = (b: WaveBucket) => `${b.ws}:${b.wd}`

/** Snap a wind reading to the nearest precomputed bucket. */
export function snapToBucket(speedMs: number, dirDeg: number): WaveBucket {
  const ws = Math.min(WS_RANGE.max, Math.max(WS_RANGE.min, Math.round(speedMs)))
  const wd = ((((Math.round(dirDeg / WD_STEP) * WD_STEP) % 360) + 360) % 360)
  return { ws, wd }
}

export interface WaveGridResult {
  grid: ScalarGrid
  /** The bucket actually rendered — may differ from the one requested. */
  bucket: WaveBucket
  /** True when a neighbouring bucket stood in after a 403. */
  substituted: boolean
}

function toGrid(nested: (number | null)[][], zeroIsWater: boolean): ScalarGrid {
  const rows = nested.length
  const cols = nested[0]?.length ?? 0
  const values = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    const row = nested[r]
    for (let c = 0; c < cols; c++) {
      const v = row[c]
      // 0 = land (see module docs), except when the caller knows this grid
      // is only being used for its shape.
      values[r * cols + c] =
        v === null || v === undefined ? NaN : v === 0 ? (zeroIsWater ? 0 : NaN) : mToFt(v)
    }
  }
  // STWAVE grids are stored NORTH-first, the opposite of the .npy model
  // grids, so they must NOT be flipped — see lakeGrid.ts.
  return {
    rows,
    cols,
    values,
    unit: 'ft',
    flipVertical: WAVE_GRID_FLIP_VERTICAL,
    flipHorizontal: WAVE_GRID_FLIP_HORIZONTAL,
  }
}

async function fetchBucketJson(b: WaveBucket): Promise<(number | null)[][]> {
  const res = await fetch(`${S3_BASE}/waveheight/${bucketFile(b)}`)
  if (!res.ok) throw new Error(`wave bucket ${bucketFile(b)} HTTP ${res.status}`)
  return (await res.json()) as (number | null)[][]
}

/** One bucket, decoded and cached. Past solutions never change. */
function loadBucket(b: WaveBucket): Promise<ScalarGrid> {
  return gridCache.getOrFetch(`wave:${bucketKey(b)}`, TTL.FOREVER, async () =>
    toGrid(await fetchBucketJson(b), false),
  )
}

/**
 * Flat calm: the ws=0 file is all zeros, so it can't say where the lake
 * is. Borrow the water mask from ws=1 (identical in every ws>=1 bucket,
 * verified) and flatten it to 0 ft — the model's actual answer.
 */
function loadCalmBucket(b: WaveBucket): Promise<ScalarGrid> {
  return gridCache.getOrFetch(`wave:calm:${b.wd}`, TTL.FOREVER, async () => {
    const shape = await loadBucket({ ws: 1, wd: b.wd })
    const values = new Float64Array(shape.values.length)
    for (let i = 0; i < values.length; i++) {
      values[i] = Number.isNaN(shape.values[i]) ? NaN : 0
    }
    return { ...shape, values }
  })
}

const load = (b: WaveBucket) => (b.ws === WS_RANGE.min ? loadCalmBucket(b) : loadBucket(b))

/** Buckets to try, nearest first, when the requested one 403s. */
function neighbours(b: WaveBucket): WaveBucket[] {
  const out: WaveBucket[] = []
  for (let d = 1; d <= 4; d++) {
    out.push(
      { ws: b.ws, wd: (b.wd + d * WD_STEP) % 360 },
      { ws: b.ws, wd: (b.wd - d * WD_STEP + 360) % 360 },
      { ws: Math.min(WS_RANGE.max, b.ws + Math.ceil(d / 2)), wd: b.wd },
      { ws: Math.max(WS_RANGE.min, b.ws - Math.ceil(d / 2)), wd: b.wd },
    )
  }
  return out
}

/**
 * Fetch a wave grid, falling back to an outward neighbour search when the
 * exact bucket is missing. Throws only when nothing nearby exists either —
 * which the view renders as an explicit message, never a blank map.
 */
export async function fetchWaveGrid(bucket: WaveBucket): Promise<WaveGridResult> {
  try {
    return { grid: await load(bucket), bucket, substituted: false }
  } catch {
    for (const cand of neighbours(bucket)) {
      try {
        return { grid: await load(cand), bucket: cand, substituted: true }
      } catch {
        /* keep searching outward */
      }
    }
    throw new Error(
      `No wave solution close to ws=${bucket.ws} m/s, wd=${bucket.wd}° — tried the bucket and 16 neighbours`,
    )
  }
}

export function peekWaveGrid(bucket: WaveBucket): ScalarGrid | undefined {
  const key = bucket.ws === WS_RANGE.min ? `wave:calm:${bucket.wd}` : `wave:${bucketKey(bucket)}`
  return gridCache.peek<ScalarGrid>(key)
}

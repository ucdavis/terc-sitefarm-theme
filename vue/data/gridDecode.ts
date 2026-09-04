/**
 * Grid decoding — raw S3 bytes to normalized, render-ready grids (TERC-38).
 *
 * PURE, ON PURPOSE (TERC-47): no Vue, no DOM, no module state beyond a
 * one-shot diagnostic flag — so the grid worker imports this module as-is
 * and runs the identical code off the main thread. Main-thread callers go
 * through decodeHost.ts, which decides WHERE a decode runs; nothing here
 * knows or cares.
 *
 * Grids are returned NORMALIZED: temperature already in °F, flow already
 * reduced to speed in ft/min, waves already in feet. Cache hits (see
 * modeledGrid.ts) never re-parse bytes or re-convert units.
 */
import {
  GRID_FLIP_HORIZONTAL,
  GRID_FLIP_VERTICAL,
  WAVE_GRID_FLIP_HORIZONTAL,
  WAVE_GRID_FLIP_VERTICAL,
} from '../config/lakeGrid'
import { parseNpy } from '../core/npy'
import { cToF, mToFt, msToFtPerMin } from '../core/units'

export interface ScalarGrid {
  rows: number
  cols: number
  /** Row-major, NaN = outside the lake. Values in DISPLAY units. */
  values: Float64Array
  unit: string
  /**
   * Row order of THIS grid, carried with the data rather than assumed by the
   * renderer — the two producers disagree (see lakeGrid.ts):
   *   .npy model grids  row 0 = SOUTH -> flipVertical true
   *   STWAVE wave grids row 0 = NORTH -> flipVertical false
   * Canvas paints row 0 at the top, so `true` means "flip before painting".
   */
  flipVertical: boolean
  flipHorizontal: boolean
}

export type GridVariable = 'temperature' | 'flow'

/** Decode a temperature .npy (°C, 2D) into a °F ScalarGrid. */
export function decodeTemperatureGrid(buf: ArrayBuffer): ScalarGrid {
  const arr = parseNpy(buf)
  if (arr.shape.length !== 2) {
    throw new Error(`temperature grid: expected 2D, got shape (${arr.shape.join(',')})`)
  }
  const [rows, cols] = arr.shape
  const values = new Float64Array(arr.data.length)
  for (let i = 0; i < arr.data.length; i++) {
    values[i] = Number.isNaN(arr.data[i]) ? NaN : cToF(arr.data[i])
  }
  return {
    rows,
    cols,
    values,
    unit: '°F',
    flipVertical: GRID_FLIP_VERTICAL,
    flipHorizontal: GRID_FLIP_HORIZONTAL,
  }
}

let flowLayoutLogged = false

/** Decode a flow .npy (m/s u/v components, 3D) into a ft/min speed grid. */
export function decodeCurrentSpeedGrid(buf: ArrayBuffer): ScalarGrid {
  const arr = parseNpy(buf)
  if (arr.shape.length !== 3) {
    throw new Error(`flow grid: expected 3D, got shape (${arr.shape.join(',')})`)
  }
  let rows: number
  let cols: number
  let speedMs: Float64Array
  if (arr.shape[0] === 2) {
    // (2, rows, cols): two stacked component planes — the layout observed live.
    rows = arr.shape[1]
    cols = arr.shape[2]
    const n = rows * cols
    speedMs = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const u = arr.data[i]
      const v = arr.data[n + i]
      speedMs[i] = Number.isNaN(u) || Number.isNaN(v) ? NaN : Math.hypot(u, v)
    }
    logFlowLayoutOnce(arr.shape, 'components-first (u/v planes)')
  } else if (arr.shape[2] === 2) {
    // (rows, cols, 2): interleaved components — handled but not observed live.
    rows = arr.shape[0]
    cols = arr.shape[1]
    const n = rows * cols
    speedMs = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const u = arr.data[i * 2]
      const v = arr.data[i * 2 + 1]
      speedMs[i] = Number.isNaN(u) || Number.isNaN(v) ? NaN : Math.hypot(u, v)
    }
    logFlowLayoutOnce(arr.shape, 'components-last (interleaved)')
  } else {
    throw new Error(`flow grid: cannot locate component axis in (${arr.shape.join(',')})`)
  }
  // Speed magnitude |v| = sqrt(u²+v²) is independent of which plane is u vs v.
  const values = new Float64Array(speedMs.length)
  for (let i = 0; i < speedMs.length; i++) {
    values[i] = Number.isNaN(speedMs[i]) ? NaN : msToFtPerMin(speedMs[i])
  }
  return {
    rows,
    cols,
    values,
    unit: 'ft/min',
    flipVertical: GRID_FLIP_VERTICAL,
    flipHorizontal: GRID_FLIP_HORIZONTAL,
  }
}

function logFlowLayoutOnce(shape: number[], layout: string) {
  if (flowLayoutLogged) return
  flowLayoutLogged = true
  console.info(`[gridDecode] flow layout: shape (${shape.join(',')}) = ${layout}.`)
}

/** Synchronous dispatch by variable — what runs on whichever thread. */
export function decodeGridSync(variable: GridVariable, buf: ArrayBuffer): ScalarGrid {
  return variable === 'temperature' ? decodeTemperatureGrid(buf) : decodeCurrentSpeedGrid(buf)
}

/**
 * Decode a STWAVE wave-height bucket (TERC-24) from its raw JSON bytes: a
 * nested 695×406 array of metres. Takes bytes rather than a parsed array
 * so the JSON.parse — the expensive part, ~1.3 MB of text — happens on
 * the same thread as the conversion, i.e. in the worker when there is one.
 *
 * Exact 0 encodes LAND in these files (verified: every ws>=1 bucket has
 * the identical 198,910 non-zero water cells), so 0 -> NaN unless the
 * caller only wants the grid for its shape.
 */
export function decodeWaveGrid(bytes: ArrayBuffer, zeroIsWater: boolean): ScalarGrid {
  const nested = JSON.parse(new TextDecoder().decode(bytes)) as (number | null)[][]
  const rows = nested.length
  const cols = nested[0]?.length ?? 0
  const values = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    const row = nested[r]
    for (let c = 0; c < cols; c++) {
      const v = row[c]
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

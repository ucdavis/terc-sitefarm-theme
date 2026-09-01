/**
 * Grid decoding — raw S3 bytes to normalized, render-ready grids (TERC-38).
 *
 * THE WORKER SEAM (TERC-47): everything in this module is pure — no Vue, no
 * DOM, no module state beyond a one-shot diagnostic flag — so a Web Worker
 * can import it unchanged. `decodeGrid()` is the single dispatch point:
 * today it decodes synchronously on the calling thread; TERC-47 replaces its
 * body with a postMessage round-trip to a worker pool, and no caller changes.
 *
 * Grids are returned NORMALIZED: temperature already in °F, flow already
 * reduced to speed in ft/min. Cache hits (see modeledGrid.ts) never
 * re-parse bytes or re-convert units.
 */
import {
  GRID_FLIP_HORIZONTAL,
  GRID_FLIP_VERTICAL,
} from '../config/lakeGrid'
import { parseNpy } from '../core/npy'
import { cToF, msToFtPerMin } from '../core/units'

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

/**
 * The one decode entry point callers use. Async by contract even though the
 * current implementation is synchronous — TERC-47 swaps this body for a
 * worker-pool postMessage without touching any caller.
 */
export async function decodeGrid(
  variable: GridVariable,
  buf: ArrayBuffer,
): Promise<ScalarGrid> {
  return variable === 'temperature' ? decodeTemperatureGrid(buf) : decodeCurrentSpeedGrid(buf)
}

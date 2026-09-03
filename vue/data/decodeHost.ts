/**
 * Main-thread entry points for grid decoding (TERC-47). The decode itself
 * lives in gridDecode.ts and is pure; this module decides WHERE it runs —
 * in the grid worker when one is available, on this thread otherwise —
 * and is the only thing modeledGrid.ts / waveHeight.ts need to import.
 *
 * Kept separate from gridDecode.ts on purpose: the worker imports that
 * module, and a module that constructs workers must not be part of a
 * worker's own import graph.
 */
import { offload } from '../core/gridWorker'
import { decodeGridSync, decodeWaveGrid, type GridVariable, type ScalarGrid } from './gridDecode'

/** Decode a temperature or flow .npy into a normalized grid. */
export function decodeGrid(variable: GridVariable, buf: ArrayBuffer): Promise<ScalarGrid> {
  return offload({ kind: 'npy', variable, buf }, () => decodeGridSync(variable, buf))
}

/** Parse a STWAVE bucket's JSON bytes into a normalized grid. */
export function decodeWave(bytes: ArrayBuffer, zeroIsWater: boolean): Promise<ScalarGrid> {
  return offload({ kind: 'wave', bytes, zeroIsWater }, () => decodeWaveGrid(bytes, zeroIsWater))
}

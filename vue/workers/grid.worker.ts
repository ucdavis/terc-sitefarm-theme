/**
 * The grid worker (TERC-47): decodes model grids, parses wave-bucket JSON,
 * and renders field images off the main thread. Imports ONLY the pure
 * modules — no Vue, no cache, no DOM — which is exactly the constraint
 * those modules were written under from TERC-38 onward.
 *
 * Protocol: one request in, one response out, correlated by `id`. Errors
 * inside the work are reported as { ok: false } so the main thread can
 * tell "this file is bad" from "the worker is gone".
 */
import type { GridWorkerRequest, GridWorkerResponse } from '../core/gridWorker'
import { decodeGridSync, decodeWaveGrid, type ScalarGrid } from '../data/gridDecode'
import { renderFieldBlob } from '../map/fieldImage'

// The worker global, typed narrowly: the DOM lib is in scope for the rest
// of the workspace, and pulling in lib.webworker would conflict with it.
const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<GridWorkerRequest & { id: number }>) => void) | null
  postMessage(msg: GridWorkerResponse, transfer?: Transferable[]): void
}

async function handle(req: GridWorkerRequest): Promise<{ result: unknown; transfer: Transferable[] }> {
  switch (req.kind) {
    case 'npy': {
      const grid = decodeGridSync(req.variable, req.buf)
      return { result: grid, transfer: [grid.values.buffer] }
    }
    case 'wave': {
      const grid = decodeWaveGrid(req.bytes, req.zeroIsWater)
      return { result: grid, transfer: [grid.values.buffer] }
    }
    case 'render': {
      const blob = await renderFieldBlob(req.grid as ScalarGrid, req.scale)
      return { result: blob, transfer: [] }
    }
  }
}

ctx.onmessage = async (ev) => {
  const { id, ...req } = ev.data
  try {
    const { result, transfer } = await handle(req as GridWorkerRequest)
    ctx.postMessage({ id, ok: true, result }, transfer)
  } catch (e) {
    ctx.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}

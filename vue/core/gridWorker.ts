/**
 * The grid worker transport (TERC-47) — how the main thread hands heavy
 * grid work (npy decode, wave-JSON parse, field-image rendering) to a Web
 * Worker, and the seam tests drive with a fake.
 *
 * Failure semantics are the whole design:
 *  - INFRASTRUCTURE failure (no Worker API, the script fails to load, the
 *    worker crashes) disables the worker for the session and the caller
 *    falls back to the same synchronous code on the main thread. Nothing
 *    is lost but the smoothness.
 *  - A DECODE failure inside the worker (bad file, unexpected shape) is a
 *    real error about the data and propagates exactly as it would inline.
 *
 * Inputs are cloned, never transferred. A transferred ArrayBuffer is
 * detached on the sender, so if the worker then died the fallback would
 * have nothing left to decode — and for a render request the grid being
 * transferred is the one sitting in the cache. The copy is a few
 * milliseconds; the decode it avoids on the main thread is the point.
 */
import type { ColorScale } from './colorScale'
import type { GridVariable, ScalarGrid } from '../data/gridDecode'

export type GridWorkerRequest =
  | { kind: 'npy'; variable: GridVariable; buf: ArrayBuffer }
  | { kind: 'wave'; bytes: ArrayBuffer; zeroIsWater: boolean }
  | { kind: 'render'; grid: ScalarGrid; scale: ColorScale }

export type GridWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

export interface GridWorkerTransport {
  request<T>(req: GridWorkerRequest): Promise<T>
}

/** Thrown for infrastructure failures — the signal to fall back inline. */
export class WorkerUnavailable extends Error {
  readonly unavailable = true
}

let transport: GridWorkerTransport | null | undefined
/** When true, never construct a real worker (a test has set the transport). */
let pinnedForTests = false

function createTransport(): GridWorkerTransport | null {
  if (typeof Worker === 'undefined') return null
  let worker: Worker
  try {
    // Vite bundles this into its own chunk and rewrites the URL; `./` base
    // keeps it resolving beside the entry under /themes/terc/dist/.
    worker = new Worker(new URL('../workers/grid.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }

  let nextId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()

  const failAll = (why: string) => {
    const err = new WorkerUnavailable(why)
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    disableGridWorker(err)
  }
  worker.onmessage = (ev: MessageEvent<GridWorkerResponse>) => {
    const msg = ev.data
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error))
  }
  worker.onerror = (ev) => failAll(`grid worker error: ${ev.message || 'unknown'}`)
  worker.onmessageerror = () => failAll('grid worker message could not be deserialized')

  return {
    request<T>(req: GridWorkerRequest): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        try {
          worker.postMessage({ id, ...req })
        } catch (e) {
          pending.delete(id)
          reject(new WorkerUnavailable(`grid worker postMessage failed: ${String(e)}`))
        }
      })
    },
  }
}

/** The shared worker transport, created on first use; null when unavailable. */
export function getGridWorker(): GridWorkerTransport | null {
  if (transport === undefined) transport = pinnedForTests ? null : createTransport()
  return transport
}

/** Stop using the worker for the rest of the session (after a failure). */
export function disableGridWorker(reason: unknown): void {
  if (transport) {
    // Once, quietly: a lost worker is a smoothness detail, not a data
    // problem — everything still decodes on the main thread.
    console.info('[terc] grid worker disabled; decoding on the main thread', reason)
  }
  transport = null
}

export function isWorkerUnavailable(e: unknown): boolean {
  return e instanceof WorkerUnavailable || (typeof e === 'object' && e !== null && 'unavailable' in e)
}

/**
 * Run work through the worker when there is one, inline otherwise — and
 * inline again if the worker turns out to be unavailable mid-request.
 * Decode errors from the worker propagate; see module docs.
 */
export async function offload<T>(req: GridWorkerRequest, inline: () => T | Promise<T>): Promise<T> {
  const w = getGridWorker()
  if (!w) return inline()
  try {
    return await w.request<T>(req)
  } catch (e) {
    if (!isWorkerUnavailable(e)) throw e
    disableGridWorker(e)
    return inline()
  }
}

/**
 * Test seam: inject a fake transport, null to force the inline path, or
 * undefined to restore lazy creation. A pinned transport is still subject
 * to disableGridWorker(), so tests can watch a failure turn it off.
 */
export function setGridWorkerForTests(t: GridWorkerTransport | null | undefined): void {
  pinnedForTests = t !== undefined
  transport = t
}

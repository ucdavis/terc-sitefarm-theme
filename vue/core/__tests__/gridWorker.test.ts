import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WorkerUnavailable,
  getGridWorker,
  offload,
  setGridWorkerForTests,
  type GridWorkerRequest,
  type GridWorkerTransport,
} from '../gridWorker'

/** A fake transport, the same way map tests drive a fake engine. */
function fakeTransport(impl: (req: GridWorkerRequest) => unknown | Promise<unknown>) {
  const seen: GridWorkerRequest[] = []
  const transport: GridWorkerTransport = {
    async request<T>(req: GridWorkerRequest) {
      seen.push(req)
      return (await impl(req)) as T
    },
  }
  return { transport, seen }
}

const npy = (): GridWorkerRequest => ({ kind: 'npy', variable: 'temperature', buf: new ArrayBuffer(8) })

afterEach(() => {
  setGridWorkerForTests(undefined)
  vi.restoreAllMocks()
})

describe('offload', () => {
  it('runs the work through the worker when one is available', async () => {
    const { transport, seen } = fakeTransport(() => 'from-worker')
    setGridWorkerForTests(transport)
    const inline = vi.fn(() => 'inline')
    expect(await offload(npy(), inline)).toBe('from-worker')
    expect(seen).toHaveLength(1)
    expect(seen[0].kind).toBe('npy')
    expect(inline).not.toHaveBeenCalled()
  })

  it('runs inline when there is no worker', async () => {
    setGridWorkerForTests(null)
    const inline = vi.fn(() => 'inline')
    expect(await offload(npy(), inline)).toBe('inline')
    expect(inline).toHaveBeenCalledOnce()
  })

  it('falls back inline — and disables the worker — when the worker is unavailable', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const { transport, seen } = fakeTransport(() => {
      throw new WorkerUnavailable('script failed to load')
    })
    setGridWorkerForTests(transport)
    const inline = vi.fn(() => 'inline')
    expect(await offload(npy(), inline)).toBe('inline')
    expect(inline).toHaveBeenCalledOnce()
    // Off for the session: the next call never reaches the transport.
    expect(getGridWorker()).toBeNull()
    expect(await offload(npy(), () => 'again')).toBe('again')
    expect(seen).toHaveLength(1)
  })

  it('propagates a genuine decode error and keeps the worker', async () => {
    // "This file is bad" is about the data; it must not look like "the
    // worker is gone", and the worker must not be thrown away for it.
    const { transport } = fakeTransport(() => {
      throw new Error('Not a .npy file (bad magic bytes)')
    })
    setGridWorkerForTests(transport)
    const inline = vi.fn(() => 'inline')
    await expect(offload(npy(), inline)).rejects.toThrow(/bad magic/)
    expect(inline).not.toHaveBeenCalled()
    expect(getGridWorker()).toBe(transport)
  })

  it('has no worker in a non-browser environment', () => {
    // No Worker global under Node: lazy creation resolves to null rather
    // than throwing, and every caller takes the inline path.
    setGridWorkerForTests(undefined)
    expect(typeof Worker).toBe('undefined')
    expect(getGridWorker()).toBeNull()
  })
})

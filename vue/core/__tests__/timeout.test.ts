import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from '../timeout'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('withTimeout', () => {
  it('passes a prompt answer through', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })

  it('passes a prompt failure through untouched', async () => {
    const boom = new Error('nope')
    await expect(withTimeout(Promise.reject(boom), 1000)).rejects.toBe(boom)
  })

  it('gives up with a TimeoutError when the answer is late', async () => {
    const never = new Promise<number>(() => {})
    const p = withTimeout(never, 20_000)
    const settled = expect(p).rejects.toBeInstanceOf(TimeoutError)
    vi.advanceTimersByTime(20_000)
    await settled
    await expect(p).rejects.toThrow('No answer after 20 seconds')
  })
})

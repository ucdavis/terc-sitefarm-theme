/** A promise that gives up (TERC-62): a hung request must still resolve to an honest UI state. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`No answer after ${Math.round(ms / 1000)} seconds`)
    this.name = 'TimeoutError'
  }
}

/** Rejects with TimeoutError if `p` has not settled within `ms`. The
 *  underlying work is not cancelled — a late answer still warms the cache. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

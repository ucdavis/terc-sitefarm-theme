/**
 * Bounded, prioritised request queue for the report API (TERC-70).
 *
 * The page used to fire every station request at once — 18 on load — and
 * the API serialises them behind a saturated database, so whatever was
 * still waiting at API Gateway's 29-second limit came back 504. Capping
 * concurrency keeps every request inside that budget, and priorities put
 * what the visitor is looking at (the selected destination, lake weather)
 * ahead of the map's overview badges.
 *
 * Tasks are keyed (by URL) so a later, more urgent request for the same
 * thing raises the waiting one instead of queueing twice. Pure and
 * framework-free; the stats are plain numbers for the diagnostics panel.
 */

export type Priority = 'high' | 'normal' | 'low'
const RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

interface Task {
  key: string
  priority: Priority
  seq: number
  run: () => Promise<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

export class RequestQueue {
  private waiting: Task[] = []
  private active = 0
  private seq = 0
  /** Promises of tasks still waiting or running, by key, for joins. */
  private promises = new Map<string, Promise<unknown>>()

  constructor(public readonly limit: number) {}

  get activeCount(): number {
    return this.active
  }
  get waitingCount(): number {
    return this.waiting.length
  }

  /** Queue `task` under `key`; a second call for a key still in the queue
   *  joins it (and raises its priority if the new one is more urgent). */
  run<T>(key: string, priority: Priority, task: () => Promise<T>): Promise<T> {
    const joined = this.promises.get(key)
    if (joined) {
      this.raise(key, priority)
      return joined as Promise<T>
    }
    const p = new Promise<T>((resolve, reject) => {
      this.waiting.push({
        key,
        priority,
        seq: this.seq++,
        run: task,
        resolve: resolve as (v: unknown) => void,
        reject,
      })
    })
    this.promises.set(key, p)
    p.finally(() => this.promises.delete(key)).catch(() => {})
    this.pump()
    return p
  }

  /** Move a waiting task up if `priority` is more urgent than it has. */
  raise(key: string, priority: Priority): void {
    const t = this.waiting.find((x) => x.key === key)
    if (t && RANK[priority] < RANK[t.priority]) t.priority = priority
  }

  private pump(): void {
    while (this.active < this.limit && this.waiting.length > 0) {
      // Most urgent first; among equals, the one that asked first.
      this.waiting.sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.seq - b.seq)
      const t = this.waiting.shift()!
      this.active++
      // Free the slot (and start the next task) BEFORE settling the
      // caller's promise, so by the time a caller sees its result the
      // queue has already moved on.
      const settle = () => {
        this.active--
        this.pump()
      }
      t.run().then(
        (v) => {
          settle()
          t.resolve(v)
        },
        (e) => {
          settle()
          t.reject(e)
        },
      )
    }
  }
}

/** How many report-API requests may be in flight at once. Four keeps a
 *  full page load inside the API's 29-second window with room to spare
 *  (measured: 13 at once → five 504s; each call costs 2–10 s). */
export const REPORT_CONCURRENCY = 4

export const reportQueue = new RequestQueue(REPORT_CONCURRENCY)

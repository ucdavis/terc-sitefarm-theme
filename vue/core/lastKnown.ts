import type { StoredRow } from './cache'
import { empty, failure, stale, success, type RequestState } from './requestState'

/**
 * Show a remembered reading while a live one is fetched (TERC-70).
 *
 * The report API can take many seconds, so views paint the last reading we
 * ever stored and refresh underneath. Doing that naively makes the outcome
 * depend on which promise settles first: a fast failure discards the
 * remembered reading, and a fast remembered reading swallows the failure.
 * So the rule here is explicit — the remembered row paints as soon as it
 * arrives, but when the live request FAILS the decision waits for that row,
 * and the resulting state carries both the data and the error.
 *
 * Commits at most twice: remembered, then live.
 */
export interface LastKnownLoad<T> {
  /** The remembered row from the persistent tier, if there is one. */
  stored: Promise<StoredRow<T> | undefined>
  /** The live request (already queued with its priority). */
  live: Promise<T>
  /** Whether a value actually carries readings — empty is not data. */
  hasData: (value: T) => boolean
  /** Commit a state. */
  set: (state: RequestState<T>) => void
  /** False once a newer load has superseded this one. */
  current?: () => boolean
}

export async function loadWithLastKnown<T>(load: LastKnownLoad<T>): Promise<void> {
  const current = load.current ?? (() => true)
  let settled = false

  // Paint the remembered reading — unless the live answer already landed.
  void load.stored
    .then((row) => {
      if (settled || !row || !load.hasData(row.value) || !current()) return
      load.set(stale(row.value))
    })
    .catch(() => {})

  try {
    const value = await load.live
    settled = true
    if (current()) load.set(load.hasData(value) ? success(value) : empty())
  } catch (err) {
    settled = true
    // Wait for the remembered row before deciding, so a failure never
    // races the disk read: with a row we keep it AND report the error,
    // without one this is an ordinary failure.
    const row = await load.stored.catch(() => undefined)
    if (!current()) return
    load.set(row && load.hasData(row.value) ? stale(row.value, err) : failure(err))
  }
}

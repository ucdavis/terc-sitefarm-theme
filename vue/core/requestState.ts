/**
 * Shared request lifecycle shape used by ALL data modules.
 * 'empty' is a first-class state: most TERC stations legitimately return
 * empty arrays, and that must render as "no data available", never as an
 * error or a permanent spinner.
 */
export type RequestStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error'

export interface RequestState<T> {
  status: RequestStatus
  data: T | null
  error: string | null
  /** True when the data was served synchronously from cache (no loading UI). */
  fromCache: boolean
}

export function idle<T>(): RequestState<T> {
  return { status: 'idle', data: null, error: null, fromCache: false }
}
export function loading<T>(): RequestState<T> {
  return { status: 'loading', data: null, error: null, fromCache: false }
}
export function success<T>(data: T, fromCache = false): RequestState<T> {
  return { status: 'success', data, error: null, fromCache }
}
export function empty<T>(): RequestState<T> {
  return { status: 'empty', data: null, error: null, fromCache: false }
}
export function failure<T>(error: unknown): RequestState<T> {
  return { status: 'error', data: null, error: message(error), fromCache: false }
}

/**
 * A remembered reading (TERC-70): real data to render, flagged as not
 * fresh. `error` is set when the live refresh failed, so a view can say
 * why the numbers are old instead of quietly showing stale ones — an
 * outage must never look like a normal reading.
 */
export function stale<T>(data: T, error?: unknown): RequestState<T> {
  return {
    status: 'success',
    data,
    error: error === undefined ? null : message(error),
    fromCache: true,
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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
  const msg = error instanceof Error ? error.message : String(error)
  return { status: 'error', data: null, error: msg, fromCache: false }
}

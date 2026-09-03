/**
 * IndexedDB implementation of the cold cache tier (TERC-48). The ONLY
 * module in the theme that touches IndexedDB — swapping storage means
 * rewriting this file against persistentStore.ts, nothing else.
 *
 * Two object stores, on purpose:
 *   grids — the payload: { key, value, formatVersion }. Values are typed
 *           arrays inside a ScalarGrid, which structured clone stores
 *           natively (no JSON round-trip, no precision loss).
 *   meta  — bookkeeping only: { key, bytes, lastUsed }, indexed by
 *           lastUsed. Eviction needs sizes and recency for EVERY row, and
 *           reading those from `grids` would pull megabytes of grid data
 *           into memory just to decide what to delete.
 *
 * Every entry point is wrapped: a single failure disables the tier for the
 * session rather than retrying against storage that clearly isn't working.
 */
import { FORMAT_VERSION, MAX_BYTES, nullStore, type PersistentStore } from './persistentStore'

const DB_NAME = 'terc-grid-cache'
const DB_VERSION = 1
const GRIDS = 'grids'
const META = 'meta'

interface MetaRow {
  key: string
  bytes: number
  lastUsed: number
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function createIndexedDbStore(): PersistentStore {
  if (typeof indexedDB === 'undefined') return nullStore

  let dbPromise: Promise<IDBDatabase> | null = null
  /** Nothing works: the database can't be opened or read. */
  let disabled = false
  /**
   * Writes only. A full disk (QuotaExceededError) says nothing about the
   * rows already stored, so those keep serving for the rest of the
   * session instead of throwing away a warm cache over one failed write.
   */
  let writesDisabled = false

  function fail(op: 'read' | 'write' | 'clear', err: unknown): undefined {
    const alreadyOff = op === 'write' ? writesDisabled || disabled : disabled
    if (op === 'write') writesDisabled = true
    else disabled = true
    if (!alreadyOff) {
      // One line, once: a degraded cold tier is a performance detail, not
      // a user-facing problem — everything still works over the network.
      const scope = op === 'write' ? 'stopped writing to' : 'disabled'
      console.info(`[terc] offline grid cache ${scope} after ${op} failed`, err)
    }
    return undefined
  }

  function open(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(GRIDS)) db.createObjectStore(GRIDS, { keyPath: 'key' })
          if (!db.objectStoreNames.contains(META)) {
            db.createObjectStore(META, { keyPath: 'key' }).createIndex('lastUsed', 'lastUsed')
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        // Another tab holding an old version open: don't hang forever.
        req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'))
      })
    }
    return dbPromise
  }

  async function drop(db: IDBDatabase, keys: string[]): Promise<void> {
    if (keys.length === 0) return
    const tx = db.transaction([GRIDS, META], 'readwrite')
    for (const k of keys) {
      tx.objectStore(GRIDS).delete(k)
      tx.objectStore(META).delete(k)
    }
    await txDone(tx)
  }

  /** Trim to MAX_BYTES, oldest-used first. Reads `meta` only. */
  async function evict(db: IDBDatabase): Promise<void> {
    const rows = await promisify<MetaRow[]>(
      db.transaction(META, 'readonly').objectStore(META).getAll() as IDBRequest<MetaRow[]>,
    )
    let total = rows.reduce((n, r) => n + r.bytes, 0)
    if (total <= MAX_BYTES) return
    const doomed: string[] = []
    for (const row of rows.sort((a, b) => a.lastUsed - b.lastUsed)) {
      if (total <= MAX_BYTES) break
      doomed.push(row.key)
      total -= row.bytes
    }
    await drop(db, doomed)
  }

  return {
    async get(key) {
      if (disabled) return undefined
      try {
        const db = await open()
        const row = await promisify<{ key: string; value: unknown; formatVersion: number } | undefined>(
          db.transaction(GRIDS, 'readonly').objectStore(GRIDS).get(key),
        )
        if (!row) return undefined
        if (row.formatVersion !== FORMAT_VERSION) {
          // Written by an older build whose decode meant something else.
          void drop(db, [key]).catch(() => {})
          return undefined
        }
        // Recency for eviction; not worth blocking the read on.
        void (async () => {
          const tx = db.transaction(META, 'readwrite')
          const store = tx.objectStore(META)
          const meta = await promisify<MetaRow | undefined>(store.get(key))
          if (meta) store.put({ ...meta, lastUsed: Date.now() })
          await txDone(tx)
        })().catch(() => {})
        return row.value
      } catch (err) {
        return fail('read', err)
      }
    },

    async put(key, value, bytes) {
      if (disabled || writesDisabled) return false
      try {
        const db = await open()
        const tx = db.transaction([GRIDS, META], 'readwrite')
        tx.objectStore(GRIDS).put({ key, value, formatVersion: FORMAT_VERSION })
        tx.objectStore(META).put({ key, bytes, lastUsed: Date.now() } satisfies MetaRow)
        await txDone(tx)
        await evict(db)
        return true
      } catch (err) {
        // QuotaExceededError lands here. Writes stop; reads of what's
        // already stored keep working for the rest of the session (a full
        // disk doesn't invalidate rows that are already on it). A broken
        // database fails the next read too, which disables the tier
        // outright.
        fail('write', err)
        return false
      }
    },

    async delete(key) {
      if (disabled) return
      try {
        await drop(await open(), [key])
      } catch (err) {
        // Invalidation failing is worth knowing about: the next read
        // could otherwise resurrect a value the caller dropped.
        fail('write', err)
      }
    },

    async clear() {
      if (disabled) return
      try {
        const db = await open()
        const tx = db.transaction([GRIDS, META], 'readwrite')
        tx.objectStore(GRIDS).clear()
        tx.objectStore(META).clear()
        await txDone(tx)
      } catch (err) {
        fail('clear', err)
      }
    },
  }
}

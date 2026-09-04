/**
 * Vitest setup (every test file).
 *
 * Grid work runs in a Web Worker in the browser (TERC-47). Under test there
 * is no worker to run — and a DOM shim that someday grows a `Worker` global
 * would make lazy creation construct one that never answers. Pin the
 * inline path; suites that exercise the worker seam inject a fake
 * transport explicitly (see core/__tests__/gridWorker.test.ts).
 */
import { beforeEach } from 'vitest'
import { setGridWorkerForTests } from './core/gridWorker'

beforeEach(() => {
  setGridWorkerForTests(null)
})

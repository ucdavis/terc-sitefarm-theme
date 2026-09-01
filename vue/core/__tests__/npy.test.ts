import { describe, expect, it } from 'vitest'
import { parseNpy } from '../npy'
import { buildNpy } from './buildNpy'

describe('parseNpy', () => {
  it('parses a C-order 2D float64 array (the live grid format)', () => {
    const buf = buildNpy([2, 3], [1, 2, 3, 4, 5, 6])
    const arr = parseNpy(buf)
    expect(arr.descr).toBe('<f8')
    expect(arr.shape).toEqual([2, 3])
    expect(arr.fortranOrder).toBe(false)
    expect([...arr.data]).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('matches the live file layout: 128-byte offset for shape (174, 102)', () => {
    const values = new Array(174 * 102).fill(0).map((_, i) => i % 7)
    const buf = buildNpy([174, 102], values)
    expect(buf.byteLength).toBe(142112) // same as the real temperature files
    const arr = parseNpy(buf)
    expect(arr.shape).toEqual([174, 102])
    expect(arr.data.length).toBe(17748)
  })

  it('preserves NaN cells (the lake mask)', () => {
    const buf = buildNpy([1, 3], [NaN, 20.5, NaN])
    const arr = parseNpy(buf)
    expect(Number.isNaN(arr.data[0])).toBe(true)
    expect(arr.data[1]).toBe(20.5)
  })

  it('transposes fortran_order 2D arrays to row-major', () => {
    // Column-major [ [1,2],[3,4] ] is stored as 1,3,2,4.
    const buf = buildNpy([2, 2], [1, 3, 2, 4], true)
    const arr = parseNpy(buf)
    expect([...arr.data]).toEqual([1, 2, 3, 4])
  })

  it('rejects non-npy buffers', () => {
    expect(() => parseNpy(new ArrayBuffer(64))).toThrow(/magic/)
  })

  it('parses 3D shapes like the live flow grids (2, 174, 102)', () => {
    const values = new Array(2 * 3 * 4).fill(1.5)
    const arr = parseNpy(buildNpy([2, 3, 4], values))
    expect(arr.shape).toEqual([2, 3, 4])
    expect(arr.data.length).toBe(24)
  })
})

import { describe, expect, it } from 'vitest'
import type { ScalarGrid } from '../../data/gridDecode'
import { describeFieldExtent, fieldExtent, regionLabel } from '../fieldSummary'

function grid(partial: Partial<ScalarGrid>): ScalarGrid {
  return {
    rows: 3,
    cols: 3,
    values: new Float64Array(9),
    unit: 'x',
    flipVertical: false,
    flipHorizontal: false,
    ...partial,
  }
}

describe('regionLabel', () => {
  // 3x3 grid, unflipped: storage row 0 = geo north (row 0), storage col 0 = geo west (col 0).
  it('names the corner regions', () => {
    const g = grid({})
    expect(regionLabel(g, 0)).toBe('the northwest shore') // row 0, col 0
    expect(regionLabel(g, 2)).toBe('the northeast shore') // row 0, col 2
    expect(regionLabel(g, 6)).toBe('the southwest shore') // row 2, col 0
    expect(regionLabel(g, 8)).toBe('the southeast shore') // row 2, col 2
  })

  it('names the edge-center regions', () => {
    const g = grid({})
    expect(regionLabel(g, 1)).toBe('the north end of the lake') // row 0, col 1 (center)
    expect(regionLabel(g, 3)).toBe('the west shore') // row 1 (center), col 0
    expect(regionLabel(g, 4)).toBe('the middle of the lake') // dead center
  })

  it('respects flipVertical — storage row 0 is south when flipped (the live .npy convention)', () => {
    const g = grid({ flipVertical: true })
    // Storage row 0 -> geoRow = rows-1-0 = 2 -> south.
    expect(regionLabel(g, 0)).toBe('the southwest shore')
    // Storage row 2 -> geoRow = 0 -> north.
    expect(regionLabel(g, 6)).toBe('the northwest shore')
  })

  it('respects flipHorizontal', () => {
    const g = grid({ flipHorizontal: true })
    // Storage col 0 -> geoCol = cols-1-0 = 2 -> east.
    expect(regionLabel(g, 0)).toBe('the northeast shore')
  })
})

describe('fieldExtent', () => {
  it('returns null for an all-NaN grid', () => {
    expect(fieldExtent(grid({ values: new Float64Array(9).fill(NaN) }))).toBeNull()
  })

  it('finds the min/max value and their storage index', () => {
    const values = new Float64Array([NaN, 5, NaN, 1, NaN, 9, NaN, NaN, NaN])
    const extent = fieldExtent(grid({ values }))
    expect(extent).toEqual({ min: 1, max: 9, minIndex: 3, maxIndex: 5 })
  })
})

describe('describeFieldExtent', () => {
  it('returns null for an all-NaN grid (callers render an explicit empty state)', () => {
    const g = grid({ values: new Float64Array(9).fill(NaN) })
    expect(describeFieldExtent(g, 'Forecast temperature', (v) => `${v} °F`)).toBeNull()
  })

  it('names the location of each extreme, not just the numbers', () => {
    // min at index 0 (NW), max at index 8 (SE), unflipped.
    const values = new Float64Array(9).fill(NaN)
    values[0] = 40
    values[8] = 80
    const g = grid({ values })
    expect(describeFieldExtent(g, 'Forecast surface temperature', (v) => `${v} °F`)).toBe(
      'Forecast surface temperature ranges from about 40 °F near the northwest shore to about 80 °F near the southeast shore at this hour.',
    )
  })

  it('describes a uniform field without a nonsensical "ranges from X to X"', () => {
    const g = grid({ values: new Float64Array(9).fill(55) })
    expect(describeFieldExtent(g, 'Forecast current speed', (v) => `${v} ft/min`)).toBe(
      'Forecast current speed is about 55 ft/min across the lake at this hour.',
    )
  })
})

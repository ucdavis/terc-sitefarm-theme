import { describe, expect, it } from 'vitest'
import {
  GRID_FLIP_HORIZONTAL,
  GRID_FLIP_VERTICAL,
  WAVE_GRID_FLIP_HORIZONTAL,
  WAVE_GRID_FLIP_VERTICAL,
} from '../lakeGrid'

/**
 * Regression guard for a real bug: the STWAVE wave grids were rendered with
 * the .npy model grids' vertical flip, which drew the wave field upside down
 * on the lake.
 *
 * The two producers store rows in OPPOSITE order (.npy south-first, STWAVE
 * north-first), established by correlating each grid's per-row water-width
 * profile: same order r = +0.800, reversed r = +0.997. If someone ever
 * collapses these back into one shared constant, this fails.
 */
describe('grid orientation', () => {
  it('model (.npy) grids are stored south-first and must be flipped', () => {
    expect(GRID_FLIP_VERTICAL).toBe(true)
  })

  it('STWAVE wave grids are stored north-first and must NOT be flipped', () => {
    expect(WAVE_GRID_FLIP_VERTICAL).toBe(false)
  })

  it('the two producers disagree on row order — do not merge these constants', () => {
    expect(WAVE_GRID_FLIP_VERTICAL).not.toBe(GRID_FLIP_VERTICAL)
  })

  it('neither producer needs a horizontal flip (col 0 = west for both)', () => {
    expect(GRID_FLIP_HORIZONTAL).toBe(false)
    expect(WAVE_GRID_FLIP_HORIZONTAL).toBe(false)
  })
})

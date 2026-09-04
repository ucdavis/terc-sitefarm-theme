import { describe, expect, it } from 'vitest'
import { fitTooltipSide, fitTooltipVertical } from '../tooltipFit'

/** The Real-Time map column: 420 px wide, 780 px tall. */
const W = 420
const H = 780

describe('fitTooltipSide', () => {
  it('keeps Leaflet\'s rule when the facing side has room', () => {
    expect(fitTooltipSide(100, W, 200)).toEqual({ side: 'right', maxWidth: null })
    expect(fitTooltipSide(320, W, 200)).toEqual({ side: 'left', maxWidth: null })
  })

  it('keeps the facing side even when the text will not fit — it is always the roomier one', () => {
    // Just right of centre: left has 230-22 = 208 px, right only 168.
    expect(fitTooltipSide(230, W, 300)).toEqual({ side: 'left', maxWidth: 208 })
  })

  it('caps the width to the available room so the text wraps instead of clipping', () => {
    // The clipped case from the bug: a mid-lake buoy on the right half
    // with a ~500 px tooltip.
    const fit = fitTooltipSide(290, W, 500)
    expect(fit.side).toBe('left')
    expect(fit.maxWidth).toBe(290 - 22)
  })

  it('never squeezes below the minimum width', () => {
    // A badge hugging the right edge on a 303 px mobile frame.
    const fit = fitTooltipSide(290, 303, 500)
    expect(fit.side).toBe('left')
    expect(fit.maxWidth).toBe(268)
    const tight = fitTooltipSide(150, 303, 500)
    expect(tight.maxWidth).toBeGreaterThanOrEqual(120)
  })
})

describe('fitTooltipVertical', () => {
  it('leaves a tooltip alone when it already fits', () => {
    expect(fitTooltipVertical(400, H, 90)).toBe(0)
  })

  it('pushes a tooltip on a badge near the top edge down into the frame', () => {
    // Badge at y=20, tooltip 90 px tall -> top would be -25; nudge to 8.
    expect(fitTooltipVertical(20, H, 90)).toBe(33)
  })

  it('pulls a tooltip near the bottom edge up into the frame', () => {
    expect(fitTooltipVertical(760, H, 90)).toBe(H - 8 - 805)
  })
})

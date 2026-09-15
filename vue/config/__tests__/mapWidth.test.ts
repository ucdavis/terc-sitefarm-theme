import { describe, it, expect } from 'vitest'
import { normalizeMapWidth, mapWidthStyle, DEFAULT_MAP_WIDTH } from '../mapWidth'

describe('normalizeMapWidth', () => {
  it('accepts the three editor choices', () => {
    expect(normalizeMapWidth('third')).toBe('third')
    expect(normalizeMapWidth('half')).toBe('half')
    expect(normalizeMapWidth('two-thirds')).toBe('two-thirds')
  })

  it('falls back to the default for anything else', () => {
    // Block settings arrive as untyped drupalSettings values.
    for (const bad of [undefined, null, '', 'quarter', 0, 1, {}, []]) {
      expect(normalizeMapWidth(bad)).toBe(DEFAULT_MAP_WIDTH)
    }
  })
})

describe('mapWidthStyle', () => {
  it('splits the row one-to-two by default', () => {
    expect(mapWidthStyle(undefined)).toEqual({ '--map-fr': '1fr', '--side-fr': '2fr' })
  })

  it('gives the map an equal or dominant share when asked', () => {
    expect(mapWidthStyle('half')).toEqual({ '--map-fr': '1fr', '--side-fr': '1fr' })
    expect(mapWidthStyle('two-thirds')).toEqual({ '--map-fr': '2fr', '--side-fr': '1fr' })
  })
})

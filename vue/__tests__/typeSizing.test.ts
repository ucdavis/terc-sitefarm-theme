import { describe, expect, it } from 'vitest'

/**
 * AGENTS.md non-negotiable #8: type is sized in rem on the theme's scale
 * (or SiteFarm's runtime tokens), never in px. This scans every
 * component's style blocks so the rule holds for all of them, not just
 * the one a reviewer happened to look at (TERC-65, TERC-68).
 */
const sources = import.meta.glob('../components/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

describe('type sizing', () => {
  it('finds the components (the scan is not vacuous)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10)
  })

  it.each(Object.entries(sources))('%s sets no px font sizes', (_file, src) => {
    const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
    expect(styles.match(/font-size\s*:[^;}]*?(?:\d*\.?\d+)px\b/gi)).toBeNull()
  })
})

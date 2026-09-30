import { describe, expect, it } from 'vitest'
import currentConditionsInfo from '../../../components/current_conditions/current_conditions.info.yml?raw'
import shellSource from '../CurrentConditionsShell.vue?raw'

/**
 * TERC-98. The shipped copy exists twice by necessity: once in the block
 * form (`default_value`, what an editor sees and can restore) and once in
 * the component (what renders when the block predates the setting, and what
 * a blanked field falls back to). Nothing in the build ties them together,
 * so this does.
 *
 * Read as text rather than parsed: the project has no YAML dependency, and
 * the point is the literal an editor and a developer each read.
 */
function yamlDefault(key: string): string {
  const block = currentConditionsInfo.slice(currentConditionsInfo.indexOf(`  ${key}:`))
  const line = block.split('\n').find((l) => l.trim().startsWith('default_value:'))
  const raw = line!.replace(/^\s*default_value:\s*/, '').trim()
  return raw.replace(/^'(.*)'$/s, '$1').replace(/^"(.*)"$/s, '$1').replace(/''/g, "'")
}

function componentConst(name: string): string {
  // const NAME =\n?  'text' — the literal may wrap to the next line.
  const at = shellSource.indexOf(`const ${name} =`)
  const after = shellSource.slice(at + `const ${name} =`.length)
  const match = after.match(/\s*(['"])([\s\S]*?)\1/)
  return match![2].replace(/\\'/g, "'").replace(/\\"/g, '"')
}

describe('Real-Time block form defaults match the component (TERC-98)', () => {
  it('welcome heading', () => {
    expect(yamlDefault('welcomeTitle')).toBe(componentConst('WELCOME_TITLE'))
  })

  it('welcome text', () => {
    expect(yamlDefault('welcomeText')).toBe(componentConst('WELCOME_TEXT'))
  })

  it('the defaults are the copy that shipped, so an editor can restore it', () => {
    expect(yamlDefault('welcomeTitle')).toBe('Welcome to Lake Tahoe.')
    expect(yamlDefault('welcomeText')).toContain('Pick a destination above')
  })
})

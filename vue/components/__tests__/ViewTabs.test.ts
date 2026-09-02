// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ViewTabs from '../ViewTabs.vue'

const TABS = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
  { key: 'c', label: 'Gamma' },
]

function make(modelValue = 'a') {
  return mount(ViewTabs, {
    props: { tabs: TABS, modelValue, idBase: 't', listLabel: 'Test views' },
  })
}

describe('ViewTabs (ARIA tabs widget)', () => {
  it('renders a labelled tablist with one tab stop (roving tabindex)', () => {
    const w = make('b')
    expect(w.get('[role="tablist"]').attributes('aria-label')).toBe('Test views')
    const tabs = w.findAll('[role="tab"]')
    expect(tabs).toHaveLength(3)
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('tabindex')).toBe('0')
    expect(tabs[0].attributes('tabindex')).toBe('-1')
    expect(tabs[2].attributes('tabindex')).toBe('-1')
  })

  it('ties each tab to its panel id', () => {
    const w = make()
    const tab = w.findAll('[role="tab"]')[0]
    expect(tab.attributes('id')).toBe('t-tab-a')
    expect(tab.attributes('aria-controls')).toBe('t-panel-a')
  })

  it('activates on click', async () => {
    const w = make('a')
    await w.findAll('[role="tab"]')[2].trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['c'])
  })

  it('arrow keys rove and activate, wrapping at the ends', async () => {
    const w = make('a')
    const list = w.get('[role="tablist"]')
    await list.trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['b'])
    await list.trigger('keydown', { key: 'ArrowLeft' })
    // Still relative to modelValue 'a' (parent didn't update in this test):
    // wraps to the last tab.
    expect(w.emitted('update:modelValue')?.[1]).toEqual(['c'])
  })

  it('Home and End jump to the first and last tab', async () => {
    const w = make('b')
    const list = w.get('[role="tablist"]')
    await list.trigger('keydown', { key: 'End' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['c'])
    await list.trigger('keydown', { key: 'Home' })
    expect(w.emitted('update:modelValue')?.[1]).toEqual(['a'])
  })
})

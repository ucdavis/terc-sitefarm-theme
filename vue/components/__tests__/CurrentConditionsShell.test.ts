// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CurrentConditionsShell from '../CurrentConditionsShell.vue'
import { syncFromLocation } from '../../composables/useConditionsState'

beforeEach(() => {
  window.history.replaceState(null, '', '/lake-conditions')
  syncFromLocation()
})

describe('CurrentConditionsShell', () => {
  it('renders the three view tabs, destination selector, badge, and disclaimer', () => {
    const w = mount(CurrentConditionsShell)
    expect(w.findAll('.cc-tab').map((t) => t.text())).toEqual([
      'Plan Your Day',
      'Water Quality',
      'Plan Your Day +',
    ])
    expect(w.text()).toContain('Where are you going?')
    expect(w.find('.source-badge').text()).toContain('tepfsail50 REST API')
    expect(w.find('.cc-disclaimer').text()).toContain('provisional')
    expect(w.find('.cc-forecast h3').text()).toBe('Forecasted Conditions')
  })

  it('keeps the selected destination when switching views', async () => {
    const w = mount(CurrentConditionsShell)
    await w.findAll('.cc-dest').find((b) => b.text() === 'Homewood')!.trigger('click')
    await w.findAll('.cc-tab')[1].trigger('click')
    expect(w.find('.cc-view h3').text()).toBe('Water Quality')
    expect(w.find('.cc-view-selection').text()).toContain('For Homewood')
  })

  it('"Show whole lake" appears with a selection and resets it', async () => {
    const w = mount(CurrentConditionsShell)
    expect(w.text()).not.toContain('Show whole lake')
    await w.findAll('.cc-dest').find((b) => b.text() === 'Glenbrook')!.trigger('click')
    const reset = w.findAll('.cc-dest').find((b) => b.text() === 'Show whole lake')!
    await reset.trigger('click')
    expect(w.find('.cc-view-selection').text()).toContain('whole lake')
    expect(w.text()).not.toContain('Show whole lake')
  })
})

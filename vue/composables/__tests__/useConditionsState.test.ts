// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { syncFromLocation, useConditionsState } from '../useConditionsState'

const state = useConditionsState()

beforeEach(() => {
  window.history.replaceState(null, '', '/lake-conditions')
  syncFromLocation()
})

describe('useConditionsState', () => {
  it('starts on plan-your-day with no selection', () => {
    expect(state.view.value).toBe('plan-your-day')
    expect(state.destinationId.value).toBeNull()
    expect(state.focusedStation.value).toBeNull()
    expect(state.hasSelection.value).toBe(false)
  })

  it('selection persists across view switches and lands in the URL', () => {
    state.selectDestination('homewood')
    state.setView('water-quality')
    expect(state.destinationId.value).toBe('homewood')
    const q = new URLSearchParams(window.location.search)
    expect(q.get('cc-view')).toBe('water-quality')
    expect(q.get('cc-dest')).toBe('homewood')
  })

  it('destination and station focus are mutually exclusive', () => {
    state.selectDestination('homewood')
    state.focusStation({ kind: 'nearshore', sourceId: 2, name: 'Dollar Point' })
    expect(state.destinationId.value).toBeNull()
    expect(state.focusedStation.value?.sourceId).toBe(2)
    state.selectDestination('rubicon-bay')
    expect(state.focusedStation.value).toBeNull()
  })

  it('"show whole lake" clears both and cleans the URL', () => {
    state.selectDestination('homewood')
    state.clearSelection()
    expect(state.hasSelection.value).toBe(false)
    const q = new URLSearchParams(window.location.search)
    expect(q.get('cc-dest')).toBeNull()
    expect(q.get('cc-station')).toBeNull()
  })

  it('restores full state from a deep link, station winning over destination', () => {
    window.history.replaceState(
      null,
      '',
      '/lake-conditions?cc-view=water-quality&cc-dest=homewood&cc-station=buoy:3:NASA%20Buoy%20TB3',
    )
    syncFromLocation()
    expect(state.view.value).toBe('water-quality')
    expect(state.destinationId.value).toBeNull()
    expect(state.focusedStation.value).toEqual({ kind: 'buoy', sourceId: 3, name: 'NASA Buoy TB3' })
  })

  it('ignores unknown view and destination ids from the URL', () => {
    window.history.replaceState(null, '', '/x?cc-view=nope&cc-dest=atlantis')
    syncFromLocation()
    expect(state.view.value).toBe('plan-your-day')
    expect(state.destinationId.value).toBeNull()
  })

  it('popstate re-syncs state from the URL', () => {
    window.history.replaceState(null, '', '/x?cc-view=water-quality&cc-dest=rubicon-bay')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(state.view.value).toBe('water-quality')
    expect(state.destinationId.value).toBe('rubicon-bay')
  })
})

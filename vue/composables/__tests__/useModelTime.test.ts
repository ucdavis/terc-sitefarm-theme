import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miscCache } from '../../core/cache'
import { PLAY_TICK_MS, resetModelTimeForTests, useModelTime } from '../useModelTime'

/** contents.json fixture: 2-hour cadence across two lake-time days. */
const NAMES = [
  '2026-08-18 20.npy',
  '2026-08-18 22.npy',
  '2026-08-19 00.npy',
  '2026-08-19 02.npy',
  '2026-08-19 04.npy',
  '2026-08-19 06.npy',
  '2026-08-19 08.npy',
  '2026-08-19 10.npy',
  '2026-08-19 12.npy',
  '2026-08-19 14.npy',
  '2026-08-19 16.npy',
  '2026-08-19 18.npy',
  '2026-08-19 20.npy',
  '2026-08-19 22.npy',
  '2026-08-20 00.npy',
]

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  // A lake-time instant inside the fixture range: Aug 19 03:30 PDT.
  vi.setSystemTime(new Date('2026-08-19T10:30:00Z'))
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ temperature: NAMES, flow: NAMES }) })
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('model-manifest')
  resetModelTimeForTests()
})
afterEach(() => {
  resetModelTimeForTests()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useModelTime', () => {
  it('loads the manifest once and defaults to the frame closest to now', async () => {
    const t = useModelTime()
    await t.ensureManifest()
    await t.ensureManifest()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 03:30 PDT sits between the 02:00 and 04:00 frames; 04:00 is closer.
    expect(t.selectedFrame.value?.filename).toBe('2026-08-19 04.npy')
  })

  it('steps hours within bounds', async () => {
    const t = useModelTime()
    await t.ensureManifest()
    t.selectedIndex.value = 0
    t.stepHour(-1)
    expect(t.selectedIndex.value).toBe(0)
    t.stepHour(1)
    expect(t.selectedFrame.value?.filename).toBe('2026-08-18 22.npy')
    t.selectedIndex.value = NAMES.length - 1
    t.stepHour(1)
    expect(t.selectedIndex.value).toBe(NAMES.length - 1)
  })

  it('selecting a date keeps the current hour when that date has it', async () => {
    const t = useModelTime()
    await t.ensureManifest()
    t.selectDate('2026-08-18')
    // Was at 04:00 (Aug 19); Aug 18 has no 04 frame -> first frame of the day.
    expect(t.selectedFrame.value?.filename).toBe('2026-08-18 20.npy')
    t.selectedIndex.value = NAMES.indexOf('2026-08-19 22.npy')
    t.selectDate('2026-08-18')
    // 22:00 exists on Aug 18 -> hour preserved across the date switch.
    expect(t.selectedFrame.value?.filename).toBe('2026-08-18 22.npy')
  })

  it('playback advances one frame per tick through the 24 h window, then stops', async () => {
    const t = useModelTime()
    await t.ensureManifest()
    const start = t.selectedIndex.value // 04:00 frame
    t.playNext24h()
    expect(t.playing.value).toBe(true)
    // 24 h from 04:00 Aug 19 covers through 04:00 Aug 20; fixture ends at
    // 00:00 Aug 20 -> target is the last frame.
    expect(t.playTargetIndex.value).toBe(NAMES.length - 1)
    vi.advanceTimersByTime(PLAY_TICK_MS)
    expect(t.selectedIndex.value).toBe(start + 1)
    vi.advanceTimersByTime(PLAY_TICK_MS * 100)
    expect(t.selectedIndex.value).toBe(NAMES.length - 1)
    expect(t.playing.value).toBe(false)
  })

  it('manual interaction cancels playback', async () => {
    const t = useModelTime()
    await t.ensureManifest()
    t.playNext24h()
    expect(t.playing.value).toBe(true)
    t.stepHour(1)
    expect(t.playing.value).toBe(false)
    t.playNext24h()
    t.selectDate('2026-08-18')
    expect(t.playing.value).toBe(false)
  })

  it('an empty manifest is an honest unavailable state, and stays retryable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ temperature: [], flow: [] }) })
    const t = useModelTime()
    await t.ensureManifest()
    expect(t.manifestError.value).toMatch(/no forecast frames/)
    expect(t.frames.value).toHaveLength(0)
    // The cached (empty) manifest expires/refreshes; a later retry succeeds.
    miscCache.delete('model-manifest')
    await t.ensureManifest()
    expect(t.manifestError.value).toBeNull()
    expect(t.frames.value).toHaveLength(NAMES.length)
  })

  it('falls back to the flow list if temperature ships empty', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ temperature: [], flow: NAMES.slice(0, 3) }),
    })
    const t = useModelTime()
    await t.ensureManifest()
    expect(t.manifestError.value).toBeNull()
    expect(t.frames.value).toHaveLength(3)
  })

  it('manifest failure is reported and retried on the next ensureManifest', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    const t = useModelTime()
    await t.ensureManifest()
    expect(t.manifestError.value).toMatch(/503/)
    miscCache.delete('model-manifest') // failed promise is not cached anyway; belt+braces
    await t.ensureManifest()
    expect(t.manifestError.value).toBeNull()
    expect(t.frames.value).toHaveLength(NAMES.length)
  })
})

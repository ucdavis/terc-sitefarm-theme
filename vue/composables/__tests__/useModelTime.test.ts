import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miscCache } from '../../core/cache'
import { parseFrameName, type ModelFrame } from '../../data/modeledGrid'
import {
  FORECAST_LOOKBACK_DAYS,
  PLAY_TICK_MS,
  forecastWindow,
  resetModelTimeForTests,
  useModelTime,
} from '../useModelTime'

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

// ---------------------------------------------------------------- TERC-80
/** Frame names at a 2-hour cadence, first 00:00 through last 00:00. */
function namesBetween(first: string, last: string): string[] {
  const out: string[] = []
  const d = new Date(`${first}T00:00:00Z`)
  const end = new Date(`${last}T00:00:00Z`)
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10)
    for (let h = 0; h < 24; h += 2) {
      if (day === last && h > 0) break
      out.push(`${day} ${String(h).padStart(2, '0')}.npy`)
    }
  }
  return out
}
const toFrames = (names: string[]) => names.map((n) => parseFrameName(n)).filter((f): f is ModelFrame => f !== null)
const at = (name: string) => parseFrameName(name)!.time.getTime()
const datesOf = (fs: ModelFrame[]) => [...new Set(fs.map((f) => f.date))]

// The real September 2026 manifest shape: ~two weeks of frames, the last run
// reaching only ~12 h past its own publish time.
const SEPT = toFrames(namesBetween('2026-09-02', '2026-09-17'))

describe('forecastWindow (TERC-80)', () => {
  it('keeps three days of history and every future frame', () => {
    const now = at('2026-09-16 12.npy')
    const kept = forecastWindow(SEPT, now)
    expect(FORECAST_LOOKBACK_DAYS).toBe(3)
    expect(datesOf(kept)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'])
    // Nothing ahead of now is ever dropped.
    expect(kept.filter((f) => f.time.getTime() > now)).toEqual(SEPT.filter((f) => f.time.getTime() > now))
  })

  it('anchors on the latest frame when the model is stale, instead of emptying the picker', () => {
    // The actual situation on 2026-09-22: the last frame is the 17th. A window
    // anchored on "now" alone would contain nothing.
    const kept = forecastWindow(SEPT, new Date('2026-09-22T15:00:00Z').getTime())
    expect(kept.length).toBeGreaterThan(0)
    expect(datesOf(kept)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'])
    expect(kept[kept.length - 1]).toBe(SEPT[SEPT.length - 1])
  })

  it('keeps whole days, so the first date in the picker is never partial', () => {
    const kept = forecastWindow(SEPT, at('2026-09-16 12.npy'))
    const first = kept.filter((f) => f.date === kept[0].date)
    expect(first).toHaveLength(12) // every 2-hour frame of that day
  })

  it('returns an empty list for an empty manifest', () => {
    expect(forecastWindow([], Date.now())).toEqual([])
  })

  it('trims the picker in use: the stale September manifest offers four dates, on the latest frame', async () => {
    vi.setSystemTime(new Date('2026-09-22T15:00:00Z'))
    const names = namesBetween('2026-09-02', '2026-09-17')
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ temperature: names, flow: names }) })
    miscCache.delete('model-manifest')
    resetModelTimeForTests()
    const t = useModelTime()
    await t.ensureManifest()
    expect(t.dates.value).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'])
    expect(t.selectedFrame.value?.filename).toBe('2026-09-17 00.npy')
  })
})

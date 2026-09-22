// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miscCache } from '../../core/cache'
import type { HourlyWind, WindTimeline } from '../../data/noaa'
import { resetWaveTimeForTests, useWaveTime, waveFramesFromTimeline } from '../useWaveTime'

const fetchMock = vi.fn()
const H = 3_600_000

/** A NOAA gridpoint body covering `hours` consecutive UTC hours from `start`. */
function windBody(start: string, hours: number, kmh = 18) {
  const t0 = Date.parse(start)
  const at = (i: number) => new Date(t0 + i * H).toISOString().replace('.000Z', '+00:00')
  const values = (v: number) => Array.from({ length: hours }, (_, i) => ({ validTime: `${at(i)}/PT1H`, value: v }))
  return {
    ok: true,
    json: async () => ({
      properties: {
        windSpeed: { uom: 'wmoUnit:km_h-1', values: values(kmh) },
        windDirection: { uom: 'wmoUnit:degree_(angle)', values: values(240) },
      },
    }),
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  miscCache.delete('noaa-wind')
  resetWaveTimeForTests()
})
afterEach(() => {
  resetWaveTimeForTests()
  miscCache.delete('noaa-wind')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('waveFramesFromTimeline', () => {
  it('makes one frame per forecast hour, in time order, dated in lake time', () => {
    const w: HourlyWind = { speedMs: 5, speedMph: 11.2, dirDeg: 240 }
    const hour = (iso: string) => Date.parse(iso) / H
    const timeline: WindTimeline = {
      // Deliberately unsorted: the Map's order is insertion order.
      byHour: new Map([
        [hour('2026-09-23T07:00:00Z'), { ...w, dirDeg: 90 }],
        [hour('2026-09-23T06:00:00Z'), w],
      ]),
      firstHour: hour('2026-09-23T06:00:00Z'),
      lastHour: hour('2026-09-23T07:00:00Z'),
      speedUom: 'wmoUnit:km_h-1',
    }
    const frames = waveFramesFromTimeline(timeline)
    // 06:00Z is 23:00 PDT the evening BEFORE — lake time, not UTC.
    expect(frames.map((f) => [f.date, f.hour])).toEqual([
      ['2026-09-22', 23],
      ['2026-09-23', 0],
    ])
    expect(frames[1].wind.dirDeg).toBe(90)
  })
})

describe('useWaveTime', () => {
  it('opens on the hour closest to now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-22T17:10:00Z')) // 10:10 lake time
    fetchMock.mockResolvedValue(windBody('2026-09-22T12:00:00Z', 48))
    const t = useWaveTime()
    await t.ensureWaveHours()
    expect(t.selectedFrame.value?.date).toBe('2026-09-22')
    expect(t.selectedFrame.value?.hour).toBe(10)
    expect(t.loaded.value).toBe(true)
  })

  it('keeps the visitor on the same hour when NOAA’s forecast refreshes', async () => {
    fetchMock.mockResolvedValue(windBody('2026-09-22T12:00:00Z', 48))
    const t = useWaveTime()
    await t.ensureWaveHours()
    t.selectedIndex.value = 30
    const chosen = t.selectedFrame.value!.time.getTime()

    // The next issue starts six hours later, so every index shifts by 6.
    miscCache.delete('noaa-wind')
    fetchMock.mockResolvedValue(windBody('2026-09-22T18:00:00Z', 48, 36))
    await t.ensureWaveHours()
    expect(t.selectedFrame.value!.time.getTime()).toBe(chosen)
    expect(t.selectedIndex.value).toBe(24)
    expect(t.selectedFrame.value!.wind.speedMs).toBeCloseTo(10) // the NEW wind
  })

  it('keeps the hours it has when a refresh fails, and says so', async () => {
    fetchMock.mockResolvedValue(windBody('2026-09-22T12:00:00Z', 24))
    const t = useWaveTime()
    await t.ensureWaveHours()
    miscCache.delete('noaa-wind')
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    await t.ensureWaveHours()
    expect(t.frames.value).toHaveLength(24)
    expect(t.error.value).toMatch(/503/)

    // Not sticky: the next good answer clears it.
    miscCache.delete('noaa-wind')
    fetchMock.mockResolvedValue(windBody('2026-09-22T12:00:00Z', 24))
    await t.ensureWaveHours()
    expect(t.error.value).toBeNull()
  })

  it('does not refresh mid-playback, so the playback target cannot shift', async () => {
    fetchMock.mockResolvedValue(windBody('2026-09-22T12:00:00Z', 48))
    const t = useWaveTime()
    await t.ensureWaveHours()
    t.selectedIndex.value = 0
    t.playNext24h()
    expect(t.playing.value).toBe(true)
    miscCache.delete('noaa-wind')
    await t.ensureWaveHours()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    t.stopPlay()
  })
})

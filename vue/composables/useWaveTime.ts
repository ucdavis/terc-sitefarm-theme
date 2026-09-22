import { ref } from 'vue'
import { lakeWallParts } from '../core/time'
import { fetchWindTimeline, type HourlyWind, type WindTimeline } from '../data/noaa'
import { createTimeAxis, type TimeFrame } from './timeAxis'

/**
 * Wave height's own time axis (TERC-93): one frame per hour NOAA's wind
 * forecast covers, each carrying its wind.
 *
 * Waves need two things for an hour — NOAA's forecast wind, and TERC's
 * precomputed wave field for that wind (a static 2022 library on S3) — and
 * never TERC's temperature/flow model. Until TERC-93 the wave view stepped
 * through the MODEL's frames and looked each hour up in NOAA's timeline, so
 * when the model stopped publishing (Sep 2026: frames ended Sep 17, NOAA ran
 * Sep 22-30) every hour missed and the wave map went blank despite eight days
 * of wind. Building the axis FROM NOAA's hours means every hour offered has
 * wind: there is no lookup left to miss.
 *
 * Module scope, like useModelTime: one selection per page, kept across view
 * switches. The two axes are independent — each opens on the hour closest to
 * now.
 */
export interface WaveFrame extends TimeFrame {
  /** NOAA's forecast wind for this hour. */
  wind: HourlyWind
}

const pad = (n: number) => String(n).padStart(2, '0')

/** One frame per covered hour, in time order, dated in lake time. */
export function waveFramesFromTimeline(timeline: WindTimeline): WaveFrame[] {
  return [...timeline.byHour.keys()]
    .sort((a, b) => a - b)
    .map((h) => {
      const time = new Date(h * 3_600_000)
      const p = lakeWallParts(time)
      return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, hour: p.h, time, wind: timeline.byHour.get(h)! }
    })
}

const wave = createTimeAxis<WaveFrame>()
/** NOAA's forecast could not be loaded — distinct from an ordinary empty hour. */
const error = ref<string | null>(null)
const loaded = ref(false)

/**
 * Load, or refresh, the axis from NOAA. Safe to call often: the timeline is
 * cached for TTL.SHORT, so repeat calls inside that window cost nothing and a
 * call after it picks up NOAA's newer forecast. A refresh keeps the visitor
 * on the same hour (createTimeAxis.setFrames), and is skipped mid-playback so
 * the playback target's index cannot shift under it.
 */
async function ensureWaveHours(): Promise<void> {
  if (wave.axis.playing.value) return
  try {
    const timeline = await fetchWindTimeline()
    wave.setFrames(waveFramesFromTimeline(timeline))
    error.value = null
    loaded.value = true
  } catch (e) {
    // Not sticky: the next call retries. Keep any frames already loaded — an
    // older forecast is still a forecast, and the view says when it errs.
    error.value = e instanceof Error ? e.message : String(e)
  }
}

export function useWaveTime() {
  return { ...wave.axis, error, loaded, ensureWaveHours }
}

/** Reset the module-scope singleton between tests. */
export function resetWaveTimeForTests(): void {
  wave.reset()
  error.value = null
  loaded.value = false
}

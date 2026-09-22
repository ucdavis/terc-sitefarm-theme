import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * A time-picker axis: the frames a date/hour selector offers, which one is
 * selected, and "Next 24 h" playback (TERC-93).
 *
 * Extracted from useModelTime so the Forecasted Conditions views can run on
 * different clocks. Temperature and currents step through TERC's model frames;
 * wave height steps through the hours NOAA's wind forecast covers. Waves never
 * needed TERC's model — they only shared its picker, which left them blank
 * whenever the model stopped publishing while NOAA's forecast was current.
 *
 * The mechanics here are exactly what useModelTime had; only the frame source
 * differs per axis.
 */
export interface TimeFrame {
  /** "2026-09-22" — lake-time calendar date. */
  date: string
  /** 0-23 — lake-time hour. */
  hour: number
  /** The instant this frame represents. */
  time: Date
}

export interface TimeAxis<F extends TimeFrame = TimeFrame> {
  frames: Ref<F[]>
  selectedIndex: Ref<number>
  selectedFrame: ComputedRef<F | null>
  dates: ComputedRef<string[]>
  playing: Ref<boolean>
  playTargetIndex: Ref<number | null>
  selectDate: (date: string) => void
  stepHour: (delta: number) => void
  playNext24h: () => void
  stopPlay: () => void
}

/**
 * "Next 24 h" playback tick. Playing just advances selectedIndex on a timer —
 * views react exactly as they do to manual stepping, and each view prefetches
 * the whole window when playback starts, so every tick is a cache hit.
 */
export const PLAY_TICK_MS = 700

function closestIndex(list: readonly TimeFrame[], at: number): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  list.forEach((f, i) => {
    const d = Math.abs(f.time.getTime() - at)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}

export function createTimeAxis<F extends TimeFrame>() {
  const frames = ref([]) as Ref<F[]>
  const selectedIndex = ref(-1)
  const playing = ref(false)
  const playTargetIndex = ref<number | null>(null)
  let playTimer: ReturnType<typeof setInterval> | null = null

  const selectedFrame = computed<F | null>(() => frames.value[selectedIndex.value] ?? null)
  const dates = computed(() => [...new Set(frames.value.map((f) => f.date))])

  function stopPlay() {
    playing.value = false
    playTargetIndex.value = null
    if (playTimer) {
      clearInterval(playTimer)
      playTimer = null
    }
  }

  function playNext24h() {
    const i0 = selectedIndex.value
    const f0 = frames.value[i0]
    if (!f0) return
    const limit = f0.time.getTime() + 24 * 3_600_000
    let end = i0
    for (let j = i0 + 1; j < frames.value.length; j++) {
      if (frames.value[j].time.getTime() > limit) break
      end = j
    }
    if (end <= i0) return
    stopPlay()
    playing.value = true
    playTargetIndex.value = end
    playTimer = setInterval(() => {
      const target = playTargetIndex.value
      if (target === null || selectedIndex.value >= target) {
        stopPlay()
        return
      }
      selectedIndex.value++
      if (selectedIndex.value >= target) stopPlay()
    }, PLAY_TICK_MS)
  }

  function selectDate(date: string) {
    stopPlay() // manual interaction cancels playback
    const current = selectedFrame.value
    // Keep the hour if that date has it, else take the date's first frame.
    const sameHour = frames.value.findIndex((f) => f.date === date && f.hour === current?.hour)
    const idx = sameHour !== -1 ? sameHour : frames.value.findIndex((f) => f.date === date)
    if (idx !== -1) selectedIndex.value = idx
  }

  function stepHour(delta: number) {
    stopPlay() // manual interaction cancels playback
    const next = selectedIndex.value + delta
    if (next >= 0 && next < frames.value.length) selectedIndex.value = next
  }

  /**
   * Replace the frames. The FIRST load selects the frame closest to `now`.
   * A later load (a refreshed forecast) keeps the visitor on the same instant
   * if the new list still has it, so a refresh never yanks the picker away.
   */
  function setFrames(list: F[], now: number = Date.now()) {
    const keep = selectedFrame.value?.time.getTime()
    frames.value = list
    if (list.length === 0) {
      selectedIndex.value = -1
      return
    }
    const same = keep === undefined ? -1 : list.findIndex((f) => f.time.getTime() === keep)
    selectedIndex.value = same !== -1 ? same : closestIndex(list, keep ?? now)
  }

  function reset() {
    stopPlay()
    frames.value = []
    selectedIndex.value = -1
  }

  const axis: TimeAxis<F> = {
    frames,
    selectedIndex,
    selectedFrame,
    dates,
    playing,
    playTargetIndex,
    selectDate,
    stepHour,
    playNext24h,
    stopPlay,
  }
  return { axis, setFrames, reset }
}

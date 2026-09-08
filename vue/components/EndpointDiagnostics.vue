<script lang="ts">
// One panel per page no matter how many blocks switch it on — same
// ownership dance as CacheDiagnostics.
import { ref as moduleRef } from 'vue'
const roster: symbol[] = []
const ownerId = moduleRef<symbol | null>(null)
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { requestLog, type RequestEntry } from '../core/requestLog'
import { fmtLakeTime } from '../core/time'
import { useMovablePanel } from '../composables/useMovablePanel'

/**
 * Endpoint diagnostics panel (TERC-62): one row per endpoint family the
 * blocks talk to — last request, how long it took, what came back, and
 * the last error — for editors and developers to tell "our bug" from
 * "their outage" while things work and, more to the point, when they
 * don't. Enabled per block via the "Show endpoint diagnostics" setting;
 * visitors never see it and pay nothing for it (requestLog is inert
 * until a block enables it).
 */
const collapsed = ref(false)
const panelEl = ref<HTMLElement | null>(null)
// Movable by its handle (drag, arrow keys, Home to reset) and resizable by
// its corner, so it can be parked wherever it covers the least (TERC-65).
const { position, reset, handle } = useMovablePanel(panelEl, 'terc-endpoint-panel-pos')
const panelStyle = computed(() =>
  position.value ? { left: `${position.value.left}px`, top: `${position.value.top}px`, bottom: 'auto' } : undefined,
)

/**
 * Keyboard path for resizing (AGENTS.md: a keyboard path for every pointer
 * interaction). The CSS resize grip is pointer-only, so a focusable
 * control sets the same inline width/height the grip would: arrow keys
 * grow/shrink by 24px (72px with Shift), Home restores the default size.
 * Remembered in the browser like the position.
 */
const SIZE_KEY = 'terc-endpoint-panel-size'
const SIZE_STEP = 24
const SIZE_BIG_STEP = 72
const SIZE_MIN = { w: 260, h: 80 }
const size = ref<{ w: number; h: number } | null>(readSize())
const scrollEl = ref<HTMLElement | null>(null)
const scrollStyle = computed(() => (size.value ? { width: `${size.value.w}px`, height: `${size.value.h}px` } : undefined))

function readSize(): { w: number; h: number } | null {
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    const v = raw ? (JSON.parse(raw) as { w?: unknown; h?: unknown }) : null
    return v && typeof v.w === 'number' && typeof v.h === 'number' ? { w: v.w, h: v.h } : null
  } catch {
    return null
  }
}
function writeSize(v: { w: number; h: number } | null): void {
  try {
    v ? localStorage.setItem(SIZE_KEY, JSON.stringify(v)) : localStorage.removeItem(SIZE_KEY)
  } catch {
    /* no persistence in private mode — fine */
  }
}
function resizeBy(dw: number, dh: number): void {
  const el = scrollEl.value
  // A zero measurement (not laid out yet) counts as unknown -> defaults.
  const cur = size.value ?? { w: el?.offsetWidth || 480, h: el?.offsetHeight || 240 }
  const maxW = Math.max(SIZE_MIN.w, window.innerWidth - 56)
  const maxH = Math.max(SIZE_MIN.h, Math.round(window.innerHeight * 0.8))
  size.value = {
    w: Math.min(maxW, Math.max(SIZE_MIN.w, cur.w + dw)),
    h: Math.min(maxH, Math.max(SIZE_MIN.h, cur.h + dh)),
  }
  writeSize(size.value)
}
function resetSize(): void {
  size.value = null
  writeSize(null)
}
/** Maximize (fill the viewport, within the clamps) or restore the default. */
function toggleMaximize(): void {
  if (size.value) resetSize()
  else resizeBy(10_000, 10_000)
}

// Pointer drag on the ⤡ control resizes too; a click without movement
// toggles maximize/restore. Same clamps as the keyboard path.
let resizeDrag: { x: number; y: number; moved: boolean } | null = null
function onResizePointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  resizeDrag = { x: e.clientX, y: e.clientY, moved: false }
  ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
  e.preventDefault()
}
function onResizePointerMove(e: PointerEvent): void {
  if (!resizeDrag) return
  const dx = e.clientX - resizeDrag.x
  const dy = e.clientY - resizeDrag.y
  if (!resizeDrag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
  resizeDrag.moved = true
  resizeDrag.x = e.clientX
  resizeDrag.y = e.clientY
  resizeBy(dx, dy)
}
function onResizePointerUp(): void {
  if (resizeDrag && !resizeDrag.moved) toggleMaximize()
  resizeDrag = null
}

function onResizeKey(e: KeyboardEvent): void {
  const step = e.shiftKey ? SIZE_BIG_STEP : SIZE_STEP
  const moves: Record<string, [number, number]> = {
    ArrowRight: [step, 0],
    ArrowLeft: [-step, 0],
    ArrowDown: [0, step],
    ArrowUp: [0, -step],
  }
  if (e.key === 'Home') {
    resetSize()
    e.preventDefault()
  } else if (e.key === 'Enter' || e.key === ' ') {
    toggleMaximize()
    e.preventDefault()
  } else if (moves[e.key]) {
    resizeBy(...moves[e.key])
    e.preventDefault()
  }
}
const me = Symbol('endpoint-panel')
roster.push(me)
if (ownerId.value === null) ownerId.value = me
const owner = computed(() => ownerId.value === me)
onBeforeUnmount(() => {
  roster.splice(roster.indexOf(me), 1)
  if (ownerId.value === me) ownerId.value = roster[0] ?? null
})

interface Row {
  endpoint: string
  last: RequestEntry
  count: number
  failures: number
  lastError: string | null
}

/** Newest entry per endpoint family, with that family's totals. */
const rows = computed<Row[]>(() => {
  const byEndpoint = new Map<string, Row>()
  for (const e of requestLog.value) {
    const row = byEndpoint.get(e.endpoint)
    const failed = e.phase === 'http-error' || e.phase === 'failed'
    if (!row) {
      byEndpoint.set(e.endpoint, { endpoint: e.endpoint, last: e, count: 1, failures: failed ? 1 : 0, lastError: e.error })
    } else {
      row.count++
      if (failed) row.failures++
      if (!row.lastError && e.error) row.lastError = e.error
    }
  }
  return [...byEndpoint.values()].sort((a, b) => a.endpoint.localeCompare(b.endpoint))
})

const totals = computed(() => {
  const all = requestLog.value
  const failed = all.filter((e) => e.phase === 'http-error' || e.phase === 'failed').length
  const pending = all.filter((e) => e.phase === 'pending').length
  return { requests: all.length, failed, pending }
})

const outcome = (e: RequestEntry): string =>
  e.phase === 'pending' ? 'pending' : e.phase === 'ok' ? `OK ${e.status}` : e.phase === 'http-error' ? `FAIL ${e.status}` : 'ERROR'

const payload = (e: RequestEntry): string => {
  const parts: string[] = []
  if (e.records !== null) parts.push(`${e.records} rec`)
  if (e.bytes !== null) parts.push(e.bytes >= 1024 ? `${(e.bytes / 1024).toFixed(0)} kB` : `${e.bytes} B`)
  return parts.join(' · ') || '—'
}

/** Spoken summary for assistive tech — totals only, never a row per request. */
const summary = computed(() =>
  totals.value.requests === 0
    ? 'No requests yet.'
    : `${totals.value.requests} requests, ${totals.value.failed} failed${totals.value.pending ? `, ${totals.value.pending} pending` : ''}.`,
)
</script>

<template>
  <section
    v-if="owner"
    ref="panelEl"
    class="ep-panel"
    :class="{ collapsed, moved: position !== null }"
    :style="panelStyle"
    aria-label="Endpoint diagnostics"
  >
    <div class="ep-head">
      <button
        type="button"
        class="ep-handle"
        aria-label="Move panel. Drag it, or use the arrow keys; Home puts it back in the corner."
        title="Drag to move · arrow keys · Home resets"
        @pointerdown="handle.onPointerDown"
        @pointermove="handle.onPointerMove"
        @pointerup="handle.onPointerUp"
        @pointercancel="handle.onPointerUp"
        @keydown="handle.onKeyDown"
      >⠿</button>
      <button type="button" class="ep-toggle" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
        endpoints {{ collapsed ? '▸' : '▾' }}
        <span class="mini">{{ totals.requests }} req · {{ totals.failed }} failed</span>
      </button>
      <button v-if="position" type="button" class="ep-reset" @click="reset">Reset position</button>
      <button
        v-if="!collapsed"
        type="button"
        class="ep-resize"
        :aria-label="`Resize panel. Drag it, click to ${size ? 'restore the default size' : 'maximize'}, or use the arrow keys; Home restores the default.`"
        :aria-pressed="size !== null"
        title="Drag to resize · click to maximize/restore · arrow keys · Home resets"
        @pointerdown="onResizePointerDown"
        @pointermove="onResizePointerMove"
        @pointerup="onResizePointerUp"
        @pointercancel="onResizePointerUp"
        @keydown="onResizeKey"
      >⤡</button>
    </div>
    <p class="ep-sr-only" role="status" aria-live="polite">{{ summary }}</p>
    <div v-if="!collapsed" class="ep-body">
      <p v-if="rows.length === 0" class="ep-empty">No requests yet.</p>
      <div v-else ref="scrollEl" class="ep-scroll" :style="scrollStyle">
        <table class="ep-table">
          <caption class="ep-sr-only">Latest request per endpoint, with its URL and totals since the page loaded</caption>
          <thead>
            <tr>
              <th scope="col">Endpoint</th>
              <th scope="col">URL</th>
              <th scope="col">Last</th>
              <th scope="col">Time</th>
              <th scope="col">Result</th>
              <th scope="col">Payload</th>
              <th scope="col">Calls</th>
              <th scope="col">Last error</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.endpoint" :class="`ph-${r.last.phase}`">
              <th scope="row">{{ r.endpoint }}</th>
              <td class="url"><code>{{ r.last.url }}</code></td>
              <td>{{ fmtLakeTime(r.last.startedAt) }}</td>
              <td class="num">{{ r.last.ms === null ? '…' : `${r.last.ms} ms` }}</td>
              <td class="result">{{ outcome(r.last) }}</td>
              <td class="num">{{ payload(r.last) }}</td>
              <td class="num">{{ r.count }}<span v-if="r.failures"> ({{ r.failures }} failed)</span></td>
              <td class="err">{{ r.lastError ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ep-panel {
  position: fixed;
  bottom: 14px;
  left: 14px;
  z-index: 2000;
  /* Sized by its content: the table area sets the width (default below,
     or whatever it was resized to), and the background follows. */
  width: fit-content;
  max-width: calc(100vw - 28px);
  background: rgba(18, 28, 36, 0.95);
  color: #cfe0ea;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.6875rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.ep-panel.collapsed {
  width: auto;
}
.ep-panel.moved {
  /* Once moved, position comes from inline left/top (see panelStyle). */
  right: auto;
}
.ep-head {
  display: flex;
  align-items: center;
}
.ep-handle {
  background: none;
  border: none;
  color: #7f96a3;
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  padding: 8px 6px 8px 10px;
  cursor: grab;
  touch-action: none;
}
.ep-handle:active {
  cursor: grabbing;
}
.ep-resize {
  background: none;
  border: none;
  color: #7f96a3;
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  padding: 8px 10px;
  cursor: nwse-resize;
  touch-action: none;
}
.ep-resize[aria-pressed='true'] {
  color: #cfe0ea;
}
.ep-handle:focus-visible,
.ep-resize:focus-visible,
.ep-reset:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: -3px;
}
.ep-reset {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  color: #cfe0ea;
  font: inherit;
  padding: 2px 8px;
  margin-right: 10px;
  cursor: pointer;
  white-space: nowrap;
}
.ep-toggle {
  flex: 1;
  text-align: left;
  background: none;
  border: none;
  color: #8fc7e8;
  font: inherit;
  font-weight: 700;
  padding: 8px 12px;
  cursor: pointer;
}
.ep-toggle:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: -3px;
}
.mini {
  color: #7f96a3;
  font-weight: 400;
  margin-left: 8px;
}
.ep-body {
  padding: 0 12px 10px;
}
.ep-empty {
  margin: 0;
  color: #9fb2bd;
}
.ep-scroll {
  /* Resizable from its corner (and via the ⤡ control); the table scrolls
     inside. Inline width/height override these defaults once resized. */
  overflow: auto;
  resize: both;
  width: min(720px, calc(100vw - 56px));
  height: min(40vh, 320px);
  max-height: 80vh;
  min-width: 260px;
  min-height: 80px;
  max-width: calc(100vw - 56px);
}
.ep-table {
  border-collapse: collapse;
  white-space: nowrap;
}
.ep-table th,
.ep-table td {
  text-align: left;
  padding: 3px 10px 3px 0;
  vertical-align: top;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.ep-table thead th {
  border-top: 0;
  color: #7f96a3;
  font-weight: 400;
}
.ep-table tbody th {
  font-weight: 700;
  color: #dbe9f1;
}
.num {
  font-variant-numeric: tabular-nums;
}
.result {
  font-weight: 700;
}
.ph-ok .result {
  color: #7fdc9c;
}
.ph-http-error .result,
.ph-failed .result {
  color: #f28f8f;
}
.ph-pending .result {
  color: #f0a662;
}
.err {
  max-width: 260px;
  white-space: normal;
  color: #f2b8b8;
}
.url {
  /* break-all makes the auto table layout think this cell can be one
     character wide — pin a real width so the URL wraps at a readable size. */
  min-width: 340px;
  max-width: 340px;
  white-space: normal;
  word-break: break-all;
  color: #9fb2bd;
}
.url code {
  font: inherit;
  user-select: all;
}
.ep-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>

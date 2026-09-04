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
  <section v-if="owner" class="ep-panel" :class="{ collapsed }" aria-label="Endpoint diagnostics">
    <button type="button" class="ep-toggle" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      endpoints {{ collapsed ? '▸' : '▾' }}
      <span class="mini">{{ totals.requests }} req · {{ totals.failed }} failed</span>
    </button>
    <p class="ep-sr-only" role="status" aria-live="polite">{{ summary }}</p>
    <div v-if="!collapsed" class="ep-body">
      <p v-if="rows.length === 0" class="ep-empty">No requests yet.</p>
      <div v-else class="ep-scroll">
        <table class="ep-table">
          <caption class="ep-sr-only">Latest request per endpoint, with totals since the page loaded</caption>
          <thead>
            <tr>
              <th scope="col">Endpoint</th>
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
  max-width: min(720px, calc(100vw - 28px));
  background: rgba(18, 28, 36, 0.95);
  color: #cfe0ea;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.ep-panel.collapsed {
  width: auto;
}
.ep-toggle {
  width: 100%;
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
  overflow: auto;
  max-height: 40vh;
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

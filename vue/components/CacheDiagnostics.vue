<script lang="ts">
// Only one overlay should exist no matter how many blocks enable debug —
// module scope makes this a page-wide claim.
let overlayClaimed = false
</script>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { cacheStats } from '../core/cache'

/**
 * Cache diagnostics overlay (TERC-36). Ported from the prototype's dev-only
 * CacheDevOverlay; here it is enabled per block instance via the PDB block
 * settings form ("Show cache diagnostics" checkbox) so editors/developers
 * can watch hits/misses/joins on any page, then switch it back off.
 */
const collapsed = ref(false)
const owner = ref(!overlayClaimed)
if (!overlayClaimed) overlayClaimed = true
onBeforeUnmount(() => {
  if (owner.value) overlayClaimed = false
})
</script>

<template>
  <div v-if="owner" class="cache-overlay" :class="{ collapsed }">
    <button type="button" class="cache-toggle" @click="collapsed = !collapsed">
      cache {{ collapsed ? '▸' : '▾' }}
      <span class="mini">{{ cacheStats.hits }}h / {{ cacheStats.misses }}m</span>
    </button>
    <div v-if="!collapsed" class="cache-body">
      <div class="stat-row">
        <span class="hit">hits {{ cacheStats.hits }}</span>
        <span class="miss">misses {{ cacheStats.misses }}</span>
        <span>joins {{ cacheStats.joins }}</span>
      </div>
      <div class="stat-row">
        <span class="pf">prefetches {{ cacheStats.prefetches }}</span>
        <span>entries {{ cacheStats.entries }}</span>
        <span>inflight {{ cacheStats.inflight }}</span>
        <span v-if="cacheStats.evictions">evicted {{ cacheStats.evictions }}</span>
      </div>
      <ul class="events">
        <li v-for="(e, i) in cacheStats.events" :key="e.at + e.key + i" :class="e.kind">
          <span class="kind">{{ e.kind }}</span> {{ e.key }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.cache-overlay {
  position: fixed;
  bottom: 14px;
  right: 14px;
  z-index: 2000;
  width: 340px;
  background: rgba(18, 28, 36, 0.94);
  color: #cfe0ea;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.cache-overlay.collapsed {
  width: auto;
}
.cache-toggle {
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
.mini {
  color: #7f96a3;
  font-weight: 400;
  margin-left: 8px;
}
.cache-body {
  padding: 0 12px 10px;
}
.stat-row {
  display: flex;
  gap: 12px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.hit { color: #7fdc9c; }
.miss { color: #f0a662; }
.pf { color: #8fc7e8; }
.events {
  list-style: none;
  margin: 8px 0 0;
  padding: 6px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  max-height: 150px;
  overflow-y: auto;
}
.events li {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
  color: #9fb2bd;
}
.events .kind {
  display: inline-block;
  width: 62px;
  font-weight: 700;
}
.events li.hit .kind { color: #7fdc9c; }
.events li.miss .kind { color: #f0a662; }
.events li.join .kind { color: #d8b3f0; }
.events li.prefetch .kind { color: #8fc7e8; }
.events li.evict .kind { color: #f28f8f; }
</style>

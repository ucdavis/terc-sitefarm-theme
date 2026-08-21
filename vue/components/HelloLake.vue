<script lang="ts">
// Module scope — runs ONCE per page no matter how many instances mount.
// Every HelloLake block (and any other bundle importing core/cache) shares
// this cache: fetch the same key from two block instances and the second is
// a hit or an in-flight join, never a refetch.
import { DataCache } from '../core/cache'
const demoCache = new DataCache('demo', 8)
</script>

<script setup lang="ts">
/**
 * Scaffolding smoke-test component (TERC-14). Proves four things end to end:
 * .vue SFC compilation, props from data-terc-props, reactivity, and that the
 * shared DataCache is one instance across every mounted block on the page.
 * Replaced by real Current Conditions components in TERC-16+.
 */
import { ref } from 'vue'
import { TTL, cacheStats } from '../core/cache'

const props = withDefaults(defineProps<{ title?: string }>(), {
  title: 'Lake Tahoe Conditions',
})

const clicks = ref(0)

async function fetchThroughCache() {
  await demoCache.getOrFetch(`demo:key:${clicks.value % 3}`, TTL.SHORT, async () => {
    await new Promise((r) => setTimeout(r, 150))
    return { fetchedAt: new Date().toISOString() }
  })
  clicks.value++
}
</script>

<template>
  <div class="terc-hello-lake">
    <h3>{{ title }}</h3>
    <p>Vue {{ clicks }} click(s) — cache: {{ cacheStats.hits }} hits / {{ cacheStats.misses }} misses / {{ cacheStats.joins }} joins</p>
    <button type="button" @click="fetchThroughCache">Fetch through shared cache</button>
  </div>
</template>

<style scoped>
.terc-hello-lake {
  border: 2px dashed #036;
  border-radius: 4px;
  padding: 1rem;
}
.terc-hello-lake button {
  cursor: pointer;
}
</style>

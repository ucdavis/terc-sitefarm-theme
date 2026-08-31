<script setup lang="ts">
/**
 * Skeleton placeholder — deliberately NOT a spinner. Where the cache should
 * have hit, no loading UI should appear at all; this skeleton only shows on
 * genuine first-time fetches.
 */
defineProps<{ lines?: number; height?: string }>()
</script>

<template>
  <div class="skeleton" :style="height ? { height } : {}" aria-busy="true" aria-label="Loading">
    <div v-for="i in lines ?? 3" :key="i" class="skeleton-line" :style="{ width: 92 - i * 14 + '%' }" />
  </div>
</template>

<style scoped>
.skeleton {
  padding: 14px 16px;
  background: #f7fafb;
  border: 1px solid #d5dde2;
  border-radius: 8px;
}
.skeleton-line {
  height: 14px;
  border-radius: 4px;
  margin: 10px 0;
  background: linear-gradient(90deg, #e8edf0 25%, #f4f7f9 50%, #e8edf0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>

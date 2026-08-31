<script setup lang="ts">
/**
 * Badge naming the delivery phase and the exact hosts a view touches —
 * keeps the phased-delivery boundary legible at a glance. Ported from the
 * prototype; sources arrive as props here instead of vue-router route meta.
 * Each chip group can be switched off independently (block-form toggles).
 */
withDefaults(
  defineProps<{ phase?: number; sources?: string[]; showPhase?: boolean; showSources?: boolean }>(),
  {
    phase: 1,
    sources: () => [],
    showPhase: true,
    showSources: true,
  },
)
</script>

<template>
  <div class="source-badge">
    <span v-if="showPhase" class="phase-chip" :class="`phase-${phase}`">Phase {{ phase }}</span>
    <span v-if="showSources" class="sources">
      <span v-for="s in sources" :key="s" class="source-chip">{{ s }}</span>
    </span>
  </div>
</template>

<style scoped>
.source-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
}
.phase-chip {
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 99px;
  letter-spacing: 0.03em;
}
.phase-1 {
  background: #e3f0e9;
  color: #1c6b45;
}
.phase-2 {
  background: #e4ecf7;
  color: #24558f;
}
.phase-3 {
  background: #fdf3e0;
  color: #8f6614;
}
.sources {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.source-chip {
  background: #f0f3f5;
  border: 1px solid #d5dde2;
  color: #4a5a64;
  padding: 2px 8px;
  border-radius: 99px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Full ARIA tabs widget (TERC-22; the upgrade TERC-55 tracks for the
 * Phase 1 shell). One tab stop for the whole list, arrow-key roving
 * between tabs, Home/End jumps, automatic activation on focus (panels are
 * cache-first and render instantly, the case where APG recommends it).
 *
 * The host renders each panel with role="tabpanel",
 * id="`${idBase}-panel-${key}`" and :aria-labelledby="`${idBase}-tab-${key}`"
 * — the ids here are built to match.
 */
export interface ViewTab {
  key: string
  label: string
}

const props = defineProps<{
  tabs: ViewTab[]
  modelValue: string
  /** Prefix tying tab ids to the host's panel ids. */
  idBase: string
  /** Accessible name for the tablist, e.g. "Forecasted conditions views". */
  listLabel: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', key: string): void }>()

const tabEls = ref<(HTMLButtonElement | null)[]>([])
const activeIndex = computed(() =>
  Math.max(0, props.tabs.findIndex((t) => t.key === props.modelValue)),
)

function activate(index: number) {
  const tab = props.tabs[index]
  if (!tab) return
  emit('update:modelValue', tab.key)
  tabEls.value[index]?.focus()
}

function onKeydown(e: KeyboardEvent) {
  const n = props.tabs.length
  if (n === 0) return
  const i = activeIndex.value
  let next: number | null = null
  if (e.key === 'ArrowRight') next = (i + 1) % n
  else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n - 1
  if (next !== null) {
    e.preventDefault()
    activate(next)
  }
}
</script>

<template>
  <div class="view-tabs" role="tablist" :aria-label="listLabel" @keydown="onKeydown">
    <button
      v-for="(tab, i) in tabs"
      :id="`${idBase}-tab-${tab.key}`"
      :key="tab.key"
      :ref="(el) => (tabEls[i] = el as HTMLButtonElement | null)"
      role="tab"
      class="view-tab"
      :aria-selected="i === activeIndex"
      :aria-controls="`${idBase}-panel-${tab.key}`"
      :tabindex="i === activeIndex ? 0 : -1"
      type="button"
      @click="activate(i)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.view-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.view-tab {
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 99px;
  border: 1px solid #b9c6cd;
  background: #fff;
  color: #1d5b68;
  cursor: pointer;
}
.view-tab:hover {
  background: #eef4f6;
}
.view-tab[aria-selected='true'] {
  background: #1d5b68;
  border-color: #1d5b68;
  color: #fff;
}
.view-tab:focus-visible {
  outline: 3px solid #f0b323;
  outline-offset: 2px;
}
</style>

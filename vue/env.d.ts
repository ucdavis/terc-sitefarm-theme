/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/**
 * Globals provided by Drupal when an entry runs inside a Drupal page.
 * Both are absent in the standalone dev harness (vue/dev.html).
 */
interface Window {
  Drupal?: {
    behaviors: Record<string, { attach?: (context: Element | Document, settings: unknown) => void }>
  }
  drupalSettings?: Record<string, unknown>
}

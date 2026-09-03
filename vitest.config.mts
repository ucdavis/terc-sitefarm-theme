import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Standalone Vitest config so tests do not load the theme's full Vite build
// config (ucd-theme-tasks) — only the Vue SFC plugin, for component tests.
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['vue/**/__tests__/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['vue/test.setup.ts'],
  },
})

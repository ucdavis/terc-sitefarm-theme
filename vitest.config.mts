import { defineConfig } from 'vitest/config'

// Standalone Vitest config so tests do not load the theme's full Vite build
// config (ucd-theme-tasks + Vue plugin) — tests only exercise plain .ts
// modules in vue/.
export default defineConfig({
  test: {
    include: ['vue/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})

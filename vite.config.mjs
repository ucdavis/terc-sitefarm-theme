import defaultConfig from 'ucd-theme-tasks/vite.config.mjs'
import { defineConfig, mergeConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import FastGlob from 'fast-glob'
import { resolve } from 'node:path'

// Use the VITE_PORT environment variable if set, otherwise default to 5173.
// Make sure this is set in .ddev/config.yaml DDEV web_environment.
const port = process.env.VITE_PORT ?? 5173;
const origin = process.env.DDEV_PRIMARY_URL ? `${process.env.DDEV_PRIMARY_URL}:${port}` : undefined;

// Vue block-group entries (TERC-14). Each entry in vue/entries/ is a
// progressively decoupled block bundle registered as its own Drupal library
// in terc.libraries.yml. Modules shared between entries are automatically
// split into common chunks, loaded once per page.
const vueEntries = FastGlob.sync('vue/entries/*.ts').map((file) =>
  resolve(process.cwd(), file),
)

// Add custom config here.
const customConfig = {
  plugins: [vue()],
  // Relative base so shared chunks and assets resolve against the entry
  // module's URL under /sites/default/themes/terc/dist/.
  base: './',
  server: {
    port,
    origin,
  },
  build: {
    rollupOptions: {
      input: vueEntries,
    },
  },
}

// Combine the custom config with the default sitefarm config.
export default defineConfig(() =>
  mergeConfig(defaultConfig, customConfig),
)

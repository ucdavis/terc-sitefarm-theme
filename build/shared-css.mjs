#!/usr/bin/env node
/**
 * Collect the CSS of Vite's SHARED chunks into one stable file (TERC-72).
 *
 * With several entries, CSS imported by modules used in more than one
 * entry (Leaflet's stylesheet via the map engine, the ViewTabs and
 * SourceBadge components…) lands in a shared chunk. The drupal/vite module
 * attaches only an entry's own CSS and never walks the import graph, and
 * Drupal invokes hook_library_info_build() for modules only — the dynamic
 * theme library that used to fill the gap worked on Drupal 10 by accident
 * and stops on 11. So the build writes every shared-chunk stylesheet into
 * dist/vue-shared.css, which terc.libraries.yml declares statically and
 * terc_preprocess_block() attaches next to each entry. Runs after
 * `vite build` (see package.json "build").
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'dist/.vite/manifest.json')
const outPath = resolve(root, 'dist/vue-shared.css')

if (!existsSync(manifestPath)) {
  console.error(`[shared-css] no manifest at ${manifestPath}; did vite build run?`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const files = []
for (const [key, chunk] of Object.entries(manifest)) {
  // Shared (non-entry) chunks are keyed by their generated name, "_…".
  if (!key.startsWith('_')) continue
  for (const css of chunk.css ?? []) if (!files.includes(css)) files.push(css)
}
const parts = files.map((f) => `/* ${f} */\n${readFileSync(resolve(root, 'dist', f), 'utf8').trim()}`)
writeFileSync(outPath, `/* Built by build/shared-css.mjs — CSS of Vite's shared chunks. Do not edit. */\n${parts.join('\n')}\n`)
console.log(`[shared-css] dist/vue-shared.css ← ${files.length ? files.join(', ') : 'no shared-chunk CSS (empty file)'}`)

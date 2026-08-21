# TERC Vue block bundles

Vue 3 + TypeScript workspace for the progressively decoupled blocks that make
up the Lake Tahoe Conditions features (TERC-14). Ported from and modeled on
the prototype at `ucdavis/terc-vue-prototype`.

## How it fits together

```
vue/
  entries/     One .ts entry per BLOCK GROUP. Each is registered as its own
               Drupal library in ../terc.libraries.yml (vite: true).
               current-conditions.ts   -> terc/vue-current-conditions
               (future) modeled-conditions.ts, weather-alerts.ts
  components/  Vue SFCs (the blocks and their children).
  core/        Shared plumbing ported from the prototype: cache.ts
               (DataCache: TTL + LRU + in-flight join), requestState.ts
               (idle/loading/success/empty/error), units.ts.
  config/      Endpoint/station/destination config (populated in TERC-16).
  lib/mount.ts Data-attribute mounting for Drupal blocks (see below).
  dev.html     Standalone dev harness for `npm start`, never built/shipped.
```

The theme's normal `npm run build` / `npm start` (ucd-theme-tasks → Vite)
builds these entries alongside the theme's sass/js — see the `vueEntries`
section merged into ../vite.config.mjs. **Do not** add a separate build here.

### Why entries-per-group instead of one SPA

All entries build together, so Rollup factors modules shared between them
(core/cache, data modules) into common chunks. The browser instantiates an ES
module once per page regardless of how many entries import it — every block
on a page therefore shares ONE DataCache instance, preserving the prototype's
request de-duplication and zero-refetch behavior without a single mega-app.
Modeled-only weight (npy parsing, grid rendering) stays out of the real-time
chunk graph.

## Adding a block component

1. Create the SFC in `components/`.
2. Register it in the owning entry:
   `registerBlocks({ 'my-block': MyBlock })`
3. Drupal-side markup renders a placeholder (via a PDB component or any
   block template — TERC-15):
   `<div data-terc-block="my-block" data-terc-props='{"foo":"bar"}'></div>`
   and attaches the entry's library (e.g. `terc/vue-current-conditions`).

`data-terc-props` JSON becomes the component's props. The same block can be
placed any number of times; each placeholder gets its own app instance.
Mounting is wired through `Drupal.behaviors`, so blocks inserted by AJAX
mount too.

## Dev workflows

```bash
# Watch + HMR dev server (see settings.local.php 'vite' block to make
# Drupal itself pull from the dev server):
ddev exec "cd docroot/sites/default/themes/terc && npm start"

# Standalone harness (no Drupal) at <dev server URL>/vue/dev.html

# Production build (also runs on npm install via postinstall):
ddev exec "cd docroot/sites/default/themes/terc && npm run build"

# Type-check:
ddev exec "cd docroot/sites/default/themes/terc && npm run typecheck"
```

Production asset resolution is handled by the drupal/vite module (enabled on
this site): libraries flagged `vite: true` in terc.libraries.yml are
rewritten through `dist/.vite/manifest.json`, including entry CSS. After
adding a new entry/library, run `drush cr` (library definitions are cached).

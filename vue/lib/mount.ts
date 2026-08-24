import { createApp, type Component } from 'vue'

/**
 * Block mounting for progressively decoupled Drupal blocks.
 *
 * Drupal (via a PDB component template or any block markup) renders
 * placeholder elements:
 *
 *   <div data-terc-block="hello-lake" data-terc-props='{"title":"…"}'></div>
 *
 * Each entry bundle registers the components it owns and calls
 * `mountRegistered()`. Every placeholder becomes its own Vue app instance,
 * so the same block can appear multiple times on a page — but all instances
 * share module-level state (the DataCache singletons), because ES modules
 * are instantiated once per page no matter how many blocks import them.
 *
 * Inside Drupal, mounting is wired through Drupal.behaviors so blocks added
 * by AJAX (layout builder previews, dialogs) mount too. In the standalone
 * dev harness there is no Drupal object and we fall back to DOMContentLoaded.
 */

const registry = new Map<string, Component>()

/** Marker attribute preventing double-mounting when behaviors re-attach. */
const MOUNTED_ATTR = 'data-terc-mounted'

export function registerBlocks(blocks: Record<string, Component>): void {
  for (const [name, component] of Object.entries(blocks)) {
    registry.set(name, component)
  }
}

function parseProps(el: Element): Record<string, unknown> {
  const raw = el.getAttribute('data-terc-props')
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    console.error('[terc] Invalid JSON in data-terc-props', el, err)
    return {}
  }
}

export function mountAll(context: Element | Document = document): void {
  for (const [name, component] of registry) {
    const selector = `[data-terc-block="${name}"]:not([${MOUNTED_ATTR}])`
    // Drupal AJAX passes the inserted element itself as the behavior context;
    // querySelectorAll only scans descendants, so check the context too.
    const elements =
      context instanceof Element && context.matches(selector)
        ? [context, ...context.querySelectorAll(selector)]
        : [...context.querySelectorAll(selector)]
    for (const el of elements) {
      el.setAttribute(MOUNTED_ATTR, '')
      createApp(component, parseProps(el)).mount(el)
    }
  }
}

/**
 * Call once at the bottom of each entry file. `behaviorId` must be unique
 * per entry (e.g. 'tercCurrentConditions').
 */
export function mountRegistered(behaviorId: string): void {
  if (window.Drupal?.behaviors) {
    window.Drupal.behaviors[behaviorId] = {
      attach(context) {
        mountAll(context instanceof Element || context instanceof Document ? context : document)
      },
    }
    // Behaviors already ran for the initial page load by the time a
    // footer-loaded module executes, so do the first pass ourselves.
    mountAll()
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAll())
  } else {
    mountAll()
  }
}

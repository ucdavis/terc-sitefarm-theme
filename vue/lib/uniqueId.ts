/**
 * Page-unique ids for ARIA wiring (tab ↔ panel, label ↔ control).
 *
 * Not Vue's useId(): that counter is per Vue APP, and the block mount layer
 * (lib/mount.ts) creates one app per block placeholder — so two blocks on
 * a page would both mint "v-0" and cross-wire each other's aria-controls /
 * aria-labelledby. A module-level counter is shared by every block on the
 * page, because an ES module is instantiated once per page no matter how
 * many apps import it (the same property the DataCache singletons rely on).
 */
let next = 0

export function uniqueId(prefix: string): string {
  return `${prefix}-${++next}`
}

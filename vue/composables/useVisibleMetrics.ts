import { computed, onBeforeUnmount, shallowRef, type ComputedRef, type Ref } from 'vue'
import { METRIC_META, type QualityMetric } from '../config/qualitative'

/**
 * Which measurements the visitor can actually see right now (TERC-103).
 *
 * The levels matrix sits under the map, outside the view panels, so it
 * cannot see what the active view is rendering. It described all eight
 * metrics whatever was on screen — including the three behind "Show more
 * data", and air temperature and wind on the Water Quality view, which
 * charts neither. A reference table that explains levels nobody is looking
 * at is noise, and it made the panel's own "8 measurements" promise wrong.
 *
 * So each view declares what it is showing and the panel reads that.
 *
 * Module scope, like the rest of the shell's shared state (see
 * useConditionsState): one declaration per page. The shell mounts only the
 * active view's content, so there is exactly one declarer at a time; the
 * token below makes the hand-over safe whichever order the outgoing view's
 * unmount and the incoming view's mount happen to run in.
 */

/** Every metric that has an interpretation scale, in the canonical order. */
const ALL_METRICS = Object.keys(METRIC_META) as QualityMetric[]

/**
 * The live declaration, held as a getter rather than a copied array: the
 * panel's computed then tracks the view's own ref, so "Show more data"
 * reaches the matrix in the same tick it reaches the cards. (Wrapped in an
 * object because a ref handed to ref() is returned as itself.)
 */
const source = shallowRef<{ read: () => QualityMetric[] } | null>(null)
let owner: symbol | null = null

/**
 * Declare what the calling view shows, for as long as it stays mounted.
 *
 * Call it from `setup`. The declaration follows the ref, so a view whose
 * set changes while it is on screen — Plan Your Day's "Show more data" —
 * needs no second call.
 */
export function declareVisibleMetrics(metrics: Ref<QualityMetric[]> | ComputedRef<QualityMetric[]>): void {
  const token = Symbol('visible-metrics')
  owner = token
  source.value = { read: () => metrics.value }
  onBeforeUnmount(() => {
    // A view that mounted after this one already owns the declaration;
    // withdrawing here would blank the panel for the view now on screen.
    if (owner !== token) return
    owner = null
    source.value = null
  })
}

/**
 * The metrics on screen, always in METRIC_META's order rather than the
 * declaring view's, so toggling "Show more data" makes rows appear and
 * disappear in place instead of reshuffling the ones around them.
 *
 * Everything, when no view has declared anything: a panel that silently
 * described nothing would be worse than one that describes too much.
 */
export function useVisibleMetrics(): ComputedRef<QualityMetric[]> {
  return computed(() => {
    const declared = source.value
    if (declared === null) return ALL_METRICS
    const set = declared.read()
    return ALL_METRICS.filter((m) => set.includes(m))
  })
}

/** Test hook: forget any declaration. */
export function resetVisibleMetricsForTests(): void {
  owner = null
  source.value = null
}

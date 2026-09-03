/**
 * Entry: Forecasted Conditions (Phase 2 modeled data) blocks — TERC-22.
 *
 * Separate entry so pages carrying only the Phase 1 block never load the
 * grid-decode machinery; shared modules (cache, request state, time) are
 * factored into common chunks by the build, so a page with BOTH blocks
 * still gets exactly one DataCache per page.
 */
import { registerBlocks, mountRegistered } from '../lib/mount'
import ForecastedConditionsShell from '../components/ForecastedConditionsShell.vue'
import { enableGridPersistence } from '../core/gridPersistence'

// Past model hours and precomputed wave buckets are immutable, so they're
// kept across reloads (TERC-48). Phase 1 doesn't call this: its station
// readings are volatile and belong to the network every time.
enableGridPersistence()

registerBlocks({
  'forecasted-conditions': ForecastedConditionsShell,
})

mountRegistered('tercForecastedConditions')

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

registerBlocks({
  'forecasted-conditions': ForecastedConditionsShell,
})

mountRegistered('tercForecastedConditions')

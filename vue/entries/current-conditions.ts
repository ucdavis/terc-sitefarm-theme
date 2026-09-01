/**
 * Entry: Current Conditions (real-time station data) blocks.
 *
 * One entry per block group; each is registered as its own Drupal library in
 * terc.libraries.yml. Modules shared between entries (core/cache,
 * core/requestState, future data modules) are factored into common chunks by
 * the build and instantiated once per page, so all blocks share one cache.
 *
 * Future entries: forecasted-conditions.ts, weather-alerts.ts.
 */
import { registerBlocks, mountRegistered } from '../lib/mount'
import HelloLake from '../components/HelloLake.vue'
import CurrentConditionsShell from '../components/CurrentConditionsShell.vue'

registerBlocks({
  'hello-lake': HelloLake,
  'current-conditions': CurrentConditionsShell,
})

mountRegistered('tercCurrentConditions')

import { registerBlocks, mountRegistered } from '../lib/mount'
import WeatherWarningBlock from '../components/WeatherWarningBlock.vue'

registerBlocks({
  'weather-alerts': WeatherWarningBlock,
})

mountRegistered('tercWeatherAlerts')

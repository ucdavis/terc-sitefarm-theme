import { NOAA_ALERTS, TAHOE_ALERT_ZONES } from '../config/endpoints'
import { tracedFetch } from '../core/requestLog'

interface NwsAlertFeature {
  id?: unknown
  properties?: {
    severity?: unknown
  }
}

interface NwsAlertCollection {
  features?: unknown
}

export interface WeatherAlert {
  id: string
  severity: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function fetchWeatherAlerts(signal?: AbortSignal): Promise<WeatherAlert[]> {
  const url = new URL(NOAA_ALERTS)
  url.searchParams.set('zone', TAHOE_ALERT_ZONES.join(','))

  // tracedFetch is our wrapper around fetch. It works exactly like fetch,
  // but when an editor turns on the "Show endpoint diagnostics" block
  // setting, every request made through it shows up in that panel (URL,
  // time taken, status, errors). Every network call in vue/data uses it,
  // so problems with any API can be seen without opening dev tools.
  const response = await tracedFetch(url.toString(), {
    signal,
    headers: { Accept: 'application/geo+json' },
  })
  if (!response.ok) throw new Error(`NWS alerts request failed (${response.status})`)

  // response.json() can return null or a non-object, so read `features`
  // with optional chaining instead of assuming there is an object.
  const body = (await response.json()) as NwsAlertCollection | null
  const features = body?.features
  if (!Array.isArray(features)) throw new Error('NWS alerts response is invalid')

  return (features as NwsAlertFeature[]).flatMap((feature, index) => {
    if (!feature.properties) return []
    return [{
      id: text(feature.id) || `weather-alert-${index}`,
      severity: text(feature.properties.severity) || 'Unknown',
    }]
  })
}

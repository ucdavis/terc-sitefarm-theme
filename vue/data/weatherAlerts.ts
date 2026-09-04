import { NOAA_ALERTS, TAHOE_ALERT_ZONES } from '../config/endpoints'

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

  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/geo+json' },
  })
  if (!response.ok) throw new Error(`NWS alerts request failed (${response.status})`)

  const body = (await response.json()) as NwsAlertCollection
  if (!Array.isArray(body.features)) throw new Error('NWS alerts response is invalid')

  return (body.features as NwsAlertFeature[]).flatMap((feature, index) => {
    if (!feature.properties) return []
    return [{
      id: text(feature.id) || `weather-alert-${index}`,
      severity: text(feature.properties.severity) || 'Unknown',
    }]
  })
}

import { NOAA_ALERTS, TAHOE_ALERT_ZONES } from '../config/endpoints'
import { tracedFetch } from '../core/requestLog'
import sampleAlertBody from './nws-sample-alert.json'

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
  return adaptWeatherAlerts((await response.json()) as NwsAlertCollection | null)
}

/** The block's view of an NWS alert collection; throws on a bad shape. */
export function adaptWeatherAlerts(body: NwsAlertCollection | null): WeatherAlert[] {
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

/**
 * A real advisory for testing the display when nothing is in effect
 * (TERC-66): the Lake Wind Advisory NWS Reno issued 2026-09-04 02:02 PDT
 * for the Tahoe zones, captured from the NWS alerts archive
 * (`/alerts?zone=CAZ072,NVZ002&start=…`), so every field is genuine.
 * Served only when the block's "Show a sample alert" setting is on — and
 * the block labels it as a sample. No network involved.
 */
export function sampleWeatherAlerts(): WeatherAlert[] {
  return adaptWeatherAlerts(sampleAlertBody as NwsAlertCollection)
}

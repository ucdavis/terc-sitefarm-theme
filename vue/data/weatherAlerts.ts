import { NOAA_ALERTS, TAHOE_ALERT_ZONES } from '../config/endpoints'
import { tracedFetch } from '../core/requestLog'

interface NwsAlertFeature {
  id?: unknown
  properties?: {
    event?: unknown
    severity?: unknown
    headline?: unknown
    areaDesc?: unknown
    affectedZones?: unknown
    description?: unknown
    instruction?: unknown
    urgency?: unknown
    certainty?: unknown
    onset?: unknown
    ends?: unknown
    senderName?: unknown
  }
}

interface NwsAlertCollection {
  features?: unknown
}

export interface WeatherAlert {
  id: string
  event: string
  severity: string
  headline: string | null
  description: string
  instruction: string | null
  areaDesc: string
  zones: string[]
  urgency: string
  certainty: string
  onset: Date | null
  ends: Date | null
  senderName: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function date(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
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
    const properties = feature.properties
    const zones = Array.isArray(properties.affectedZones)
      ? properties.affectedZones.map((zone) => text(zone).split('/').pop() ?? '').filter(Boolean)
      : []
    return [{
      id: text(feature.id) || `weather-alert-${index}`,
      event: text(properties.event) || 'Weather alert',
      severity: text(properties.severity) || 'Unknown',
      headline: text(properties.headline) || null,
      description: text(properties.description),
      instruction: text(properties.instruction) || null,
      areaDesc: text(properties.areaDesc),
      zones,
      urgency: text(properties.urgency) || 'Unknown',
      certainty: text(properties.certainty) || 'Unknown',
      onset: date(properties.onset),
      ends: date(properties.ends),
      senderName: text(properties.senderName) || 'National Weather Service',
    }]
  })
}

/**
 * A real advisory for testing the display when nothing is in effect
 * (TERC-66): the Lake Wind Advisory NWS Reno issued 2026-09-04 02:02 PDT
 * for the Tahoe zones, captured from the NWS alerts archive
 * (`/alerts?zone=CAZ072,NVZ002&start=…`), so every field is genuine.
 * Served only when the block's "Show a sample alert" setting is on — and
 * the block labels it as a sample. The fixture is loaded on demand (its
 * own chunk), so visitors on the live path never download it.
 */
export async function sampleWeatherAlerts(): Promise<WeatherAlert[]> {
  const { default: body } = await import('./nws-sample-alert.json')
  return adaptWeatherAlerts(body as NwsAlertCollection)
}

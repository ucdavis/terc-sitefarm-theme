import { describe, expect, it } from 'vitest'
import { adaptWeatherAlerts, sampleWeatherAlerts } from '../weatherAlerts'
import fixture from '../nws-sample-alert.json'

describe('weatherAlerts', () => {
  it('the sample is a genuine archived NWS advisory for the Tahoe zones', () => {
    const [feature] = fixture.features
    expect(feature.properties.event).toBe('Lake Wind Advisory')
    expect(feature.properties.senderName).toBe('NWS Reno NV')
    expect(feature.properties.sent).toBe('2026-09-04T02:02:00-07:00')
    expect(feature.properties.affectedZones.join(' ')).toMatch(/CAZ072|NVZ002/)
    expect(sampleWeatherAlerts()).toEqual([{ id: feature.id, severity: 'Moderate' }])
  })

  it('adapts a collection and rejects bad shapes', () => {
    expect(adaptWeatherAlerts({ features: [{ id: 'x', properties: { severity: 'Severe' } }, { id: 'y' }] })).toEqual([
      { id: 'x', severity: 'Severe' },
    ])
    expect(() => adaptWeatherAlerts(null)).toThrow('invalid')
    expect(() => adaptWeatherAlerts({ features: 'nope' })).toThrow('invalid')
  })
})

import { describe, expect, it } from 'vitest'
import { adaptWeatherAlerts, sampleWeatherAlerts } from '../weatherAlerts'
import fixture from '../nws-sample-alert.json'

describe('weatherAlerts', () => {
  it('the sample is a genuine archived NWS advisory for the Tahoe zones', async () => {
    const [feature] = fixture.features
    expect(feature.properties.event).toBe('Lake Wind Advisory')
    expect(feature.properties.senderName).toBe('NWS Reno NV')
    expect(feature.properties.sent).toBe('2026-09-04T02:02:00-07:00')
    expect(feature.properties.affectedZones.join(' ')).toMatch(/CAZ072|NVZ002/)
    expect(await sampleWeatherAlerts()).toMatchObject([{ id: feature.id, severity: 'Moderate' }])
  })

  it('adapts a collection and rejects bad shapes', () => {
    expect(adaptWeatherAlerts({ features: [{ id: 'x', properties: { severity: 'Severe' } }, { id: 'y' }] })).toMatchObject([
      { id: 'x', severity: 'Severe' },
    ])
    expect(() => adaptWeatherAlerts(null)).toThrow('invalid')
    expect(() => adaptWeatherAlerts({ features: 'nope' })).toThrow('invalid')
  })

  it('adapts the checked-in NWS advisory fixture', () => {
    const [alert] = adaptWeatherAlerts(fixture)

    expect(alert.event).toBe('Lake Wind Advisory')
    expect(alert.zones).toContain('CAZ072')
    expect(alert.zones).toContain('NVZ002')
    expect(alert.senderName).toBe('NWS Reno NV')
    expect(alert.onset).toBeInstanceOf(Date)
    expect(alert.ends).toBeInstanceOf(Date)
    expect(alert.instruction).toBeTruthy()
  })

  it('returns null for invalid dates and rejects invalid collections', () => {
    const [alert] = adaptWeatherAlerts({
      features: [{ properties: { onset: 'not-a-date', ends: 42 } }],
    })
    expect(alert.onset).toBeNull()
    expect(alert.ends).toBeNull()
    expect(() => adaptWeatherAlerts(null)).toThrow('invalid')
  })
})

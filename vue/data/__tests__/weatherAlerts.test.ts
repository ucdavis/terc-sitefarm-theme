import { describe, expect, it } from 'vitest'
import fixture from '../nws-sample-alert.json'
import { adaptWeatherAlerts } from '../weatherAlerts'

describe('weatherAlerts', () => {
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

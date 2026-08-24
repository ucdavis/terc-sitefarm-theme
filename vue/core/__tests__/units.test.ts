import { describe, expect, it } from 'vitest'
import { cToF, isPlausible, mToFt, msToMph, parseReading } from '../units'

describe('unit conversions', () => {
  it('converts 20.44 °C -> 68.8 °F', () => {
    expect(cToF(20.44)).toBeCloseTo(68.79, 1)
  })
  it('converts metres to feet', () => {
    expect(mToFt(1)).toBeCloseTo(3.281, 3)
  })
  it('converts m/s to mph', () => {
    expect(msToMph(3.62)).toBeCloseTo(8.1, 1)
  })
})

describe('sentinel rejection (field-agnostic default)', () => {
  it('rejects the -9.0 "no reading" sentinel', () => {
    expect(parseReading('-9.0')).toBeNull()
    expect(parseReading('-9')).toBeNull()
  })
  it('rejects anything at or below -9', () => {
    expect(parseReading('-99')).toBeNull()
    expect(parseReading('-9.5')).toBeNull()
  })
  it('keeps valid readings, including small negatives above -9', () => {
    expect(parseReading('20.44766')).toBeCloseTo(20.44766)
    expect(parseReading('-2.5')).toBe(-2.5)
    expect(parseReading('0')).toBe(0)
  })
  it('rejects garbage', () => {
    expect(parseReading('')).toBeNull()
    expect(parseReading(undefined)).toBeNull()
    expect(parseReading('n/a')).toBeNull()
  })
})

describe('sentinel rejection (field-aware, airTempC)', () => {
  // PR review finding: the blunt <= -9 cutoff nulled every valid Tahoe
  // winter air temperature. With the airTempC rangeKey, cold-but-plausible
  // readings survive normalization.
  it('keeps cold but valid air temperatures below -9 °C', () => {
    expect(parseReading('-12.3', 'airTempC')).toBe(-12.3)
    expect(parseReading('-35', 'airTempC')).toBe(-35)
    expect(parseReading(-20, 'airTempC')).toBe(-20)
  })
  it('still rejects the exact -9.0 sentinel (documented ambiguity)', () => {
    expect(parseReading('-9.0', 'airTempC')).toBeNull()
    expect(parseReading(-9, 'airTempC')).toBeNull()
  })
  it('rejects values below the plausible floor', () => {
    expect(parseReading('-40', 'airTempC')).toBeNull()
    expect(parseReading('-9999', 'airTempC')).toBeNull()
  })
  it('fields with a floor >= 0 keep the blunt cutoff even with a rangeKey', () => {
    expect(parseReading('-9.5', 'waterTempC')).toBeNull()
    expect(parseReading('-9', 'turbidityNTU')).toBeNull()
    expect(parseReading('4.2', 'waterTempC')).toBe(4.2)
  })
})

describe('range validation', () => {
  it('accepts dissolved oxygen as % saturation', () => {
    expect(isPlausible('dissolvedOxygen', 118)).toBe(true)
    expect(isPlausible('dissolvedOxygen', 45)).toBe(true)
    expect(isPlausible('dissolvedOxygen', 250)).toBe(false)
  })
  it('accepts plausible water temperatures', () => {
    expect(isPlausible('waterTempC', 20.4)).toBe(true)
    expect(isPlausible('waterTempC', 80)).toBe(false)
  })
})

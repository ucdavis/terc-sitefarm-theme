import { describe, expect, it } from 'vitest'
import { assessMetric } from '../qualitative'

describe('assessMetric', () => {
  it('places values in their band (upper bound exclusive)', () => {
    expect(assessMetric('turbidity', 0.4)?.label).toBe('Crystal clear')
    expect(assessMetric('turbidity', 1)?.label).toBe('Clear') // 1 is NOT < 1
    expect(assessMetric('turbidity', 19.9)?.label).toBe('Slightly cloudy')
    expect(assessMetric('turbidity', 500)?.label).toBe('Murky')
  })

  it('gives every metric an open-ended top band', () => {
    for (const metric of [
      'waterTemp',
      'waveHeight',
      'airTemp',
      'windSpeed',
      'dissolvedOxygen',
      'turbidity',
      'conductivity',
      'chlorophyll',
    ] as const) {
      expect(assessMetric(metric, 1e9)).not.toBeNull()
    }
  })

  it('returns a full assessment with tone and sentence', () => {
    const a = assessMetric('dissolvedOxygen', 95)
    expect(a).toEqual({
      label: 'Healthy',
      tone: 'good',
      sentence: expect.stringContaining('Well-oxygenated'),
    })
  })

  it('returns null for missing or non-finite values', () => {
    expect(assessMetric('turbidity', null)).toBeNull()
    expect(assessMetric('turbidity', undefined)).toBeNull()
    expect(assessMetric('turbidity', Number.NaN)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { fmtDateParam, fmtLakeHour, lakeWallTimeToDate, parseTmStamp, startOfTodayLakeTime } from '../time'

describe('lake-time pinning (TERC-43)', () => {
  it('winter wall time maps to PST (UTC-8)', () => {
    expect(lakeWallTimeToDate(2026, 1, 15, 12).toISOString()).toBe('2026-01-15T20:00:00.000Z')
  })
  it('summer wall time maps to PDT (UTC-7)', () => {
    expect(lakeWallTimeToDate(2026, 7, 15, 12).toISOString()).toBe('2026-07-15T19:00:00.000Z')
  })
  it('parses TmStamp strings as UTC (live finding 2026-08-24)', () => {
    expect(parseTmStamp('2026-08-23 00:00:00').toISOString()).toBe('2026-08-23T00:00:00.000Z')
    expect(parseTmStamp('2026-01-10 14:20:00').toISOString()).toBe('2026-01-10T14:20:00.000Z')
  })
  it('rejects malformed TmStamp', () => {
    expect(Number.isNaN(parseTmStamp('garbage').getTime())).toBe(true)
  })
  it('spring-forward gap resolves to a valid instant near the jump', () => {
    // 2026-03-08 02:30 PST/PDT does not exist (clocks jump 02:00 -> 03:00).
    const d = lakeWallTimeToDate(2026, 3, 8, 2, 30)
    expect(Number.isNaN(d.getTime())).toBe(false)
    // Within an hour of the transition instant (10:00Z).
    expect(Math.abs(d.getTime() - Date.UTC(2026, 2, 8, 10, 0, 0))).toBeLessThanOrEqual(3600_000)
  })
  it('fall-back ambiguous time resolves to one of the two real instants', () => {
    // 2026-11-01 01:30 occurs twice: 08:30Z (PDT) and 09:30Z (PST).
    const t = lakeWallTimeToDate(2026, 11, 1, 1, 30).getTime()
    expect([Date.UTC(2026, 10, 1, 8, 30), Date.UTC(2026, 10, 1, 9, 30)]).toContain(t)
  })
  it('fmtDateParam uses the UTC calendar date (the API day boundary)', () => {
    expect(fmtDateParam(new Date('2026-01-16T07:59:00Z'))).toBe('20260116')
    expect(fmtDateParam(new Date('2026-01-15T23:59:00Z'))).toBe('20260115')
  })
  it('fmtLakeHour formats the instant, agreeing with fmtLakeTime on the DST gap frame', () => {
    // The "2026-03-08 02" model frame resolves to 09:00Z = 1:00 AM PST —
    // formatting the instant (not the filename hour) keeps the stepper
    // readout and the caption in agreement (PR review finding).
    expect(fmtLakeHour(new Date('2026-03-08T09:00:00Z'))).toBe('1:00 AM')
    expect(fmtLakeHour(new Date('2026-08-19T21:00:00Z'))).toBe('2:00 PM')
  })
  it('startOfTodayLakeTime returns lake-time midnight for the given instant', () => {
    // At 2026-07-15T05:00Z the lake clock reads Jul 14 22:00 PDT;
    // lake-midnight is Jul 14 00:00 PDT = Jul 14 07:00Z.
    expect(startOfTodayLakeTime(new Date('2026-07-15T05:00:00Z')).toISOString()).toBe(
      '2026-07-14T07:00:00.000Z',
    )
  })
})

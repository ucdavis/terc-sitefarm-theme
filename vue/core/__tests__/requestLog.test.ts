// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeEndpoint,
  enableRequestLog,
  noteRecords,
  requestLog,
  resetRequestLogForTests,
  tracedFetch,
} from '../requestLog'

const okResponse = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers })

beforeEach(() => resetRequestLogForTests())
afterEach(() => vi.unstubAllGlobals())

describe('describeEndpoint', () => {
  it('names each family the blocks talk to', () => {
    expect(describeEndpoint('https://x.execute-api.us-west-2.amazonaws.com/v1/report/met-uscg2020?id=1&rptdate=1')).toBe('report · met-uscg2020 #1')
    expect(describeEndpoint('https://x.execute-api.us-west-2.amazonaws.com/v1/report/ns-station-range?id=4')).toBe('report · ns-station-range #4')
    expect(describeEndpoint('/jsonapi/node/lake_locations?include=field_stations')).toBe('site · node/lake_locations')
    expect(describeEndpoint('/jsonapi/taxonomy_term/condition_bands?page[limit]=50')).toBe('site · taxonomy_term/condition_bands')
    expect(describeEndpoint('https://lake-tahoe-conditions.s3.us-west-2.amazonaws.com/contents.json')).toBe('s3 · manifest')
    expect(describeEndpoint('https://lake-tahoe-conditions.s3.us-west-2.amazonaws.com/temperature/2026-09-01_1200.npy')).toBe('s3 · grid temperature')
    expect(describeEndpoint('https://lake-tahoe-conditions.s3.us-west-2.amazonaws.com/waveheight/H_ws3_wd90.json')).toBe('s3 · wave bucket')
    expect(describeEndpoint('https://api.weather.gov/gridpoints/REV/33,87')).toBe('noaa · gridpoint forecast')
    expect(describeEndpoint('https://api.weather.gov/alerts/active?zone=CAZ072')).toBe('noaa · weather alerts')
  })
})

describe('tracedFetch', () => {
  it('is a plain pass-through while the log is disabled — nothing recorded', async () => {
    const f = vi.fn().mockResolvedValue(okResponse('[]'))
    vi.stubGlobal('fetch', f)
    const res = await tracedFetch('/jsonapi/x')
    expect(res.status).toBe(200)
    expect(f).toHaveBeenCalledWith('/jsonapi/x', undefined)
    noteRecords('/jsonapi/x', 3)
    expect(requestLog.value).toEqual([])
  })

  it('records status, duration, size and record count once enabled', async () => {
    enableRequestLog()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('[1,2]', { 'content-length': '5' })))
    await tracedFetch('/jsonapi/node/lake_locations')
    noteRecords('/jsonapi/node/lake_locations', 2)
    const [e] = requestLog.value
    expect(e.endpoint).toBe('site · node/lake_locations')
    expect(e.phase).toBe('ok')
    expect(e.status).toBe(200)
    expect(e.bytes).toBe(5)
    expect(e.records).toBe(2)
    expect(e.ms).toBeGreaterThanOrEqual(0)
    expect(e.error).toBeNull()
  })

  it('ignores a malformed Content-Length instead of showing NaN', async () => {
    enableRequestLog()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('[]', { 'content-length': 'abc' })))
    await tracedFetch('/jsonapi/x')
    expect(requestLog.value[0].bytes).toBeNull()
  })

  it('attaches a record count to the settled request it belongs to, not to a newer pending one', async () => {
    enableRequestLog()
    let releaseSecond: (r: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okResponse('[1,2,3]'))
        .mockImplementationOnce(() => new Promise<Response>((res) => (releaseSecond = res))),
    )
    const url = 'https://h/v1/report/ns-station-range?id=4'
    await tracedFetch(url) // settles first
    const second = tracedFetch(url) // same URL, still in flight
    noteRecords(url, 3) // the FIRST request's parse finishing
    const settled = requestLog.value.find((e) => e.phase === 'ok')!
    const pending = requestLog.value.find((e) => e.phase === 'pending')!
    expect(settled.records).toBe(3)
    expect(pending.records).toBeNull()
    releaseSecond(okResponse('[1]'))
    await second
    noteRecords(url, 1)
    expect(requestLog.value.find((e) => e.id === pending.id)!.records).toBe(1)
    expect(requestLog.value.find((e) => e.id === settled.id)!.records).toBe(3) // untouched
  })

  it('records an HTTP error with its status and still returns the response', async () => {
    enableRequestLog()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' })))
    const res = await tracedFetch('https://h/v1/report/met-uscg2020?id=1')
    expect(res.ok).toBe(false)
    expect(requestLog.value[0].phase).toBe('http-error')
    expect(requestLog.value[0].error).toBe('HTTP 503 Service Unavailable')
  })

  it('records a network failure and rethrows it untouched', async () => {
    enableRequestLog()
    const boom = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(boom))
    await expect(tracedFetch('https://h/v1/report/ns-station-range?id=4')).rejects.toBe(boom)
    expect(requestLog.value[0].phase).toBe('failed')
    expect(requestLog.value[0].error).toBe('TypeError: Failed to fetch')
  })

  it('keeps the newest entries first and bounds the log', async () => {
    enableRequestLog()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('')))
    for (let i = 0; i < 205; i++) await tracedFetch(`/jsonapi/n${i}`)
    expect(requestLog.value).toHaveLength(200)
    expect(requestLog.value[0].url).toBe('/jsonapi/n204')
  })
})

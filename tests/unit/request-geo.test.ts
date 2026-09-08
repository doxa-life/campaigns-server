import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { getRequestGeo, hasRequestGeo } from '../../server/utils/request-geo'

function fakeEvent(headers: Record<string, string>): H3Event {
  return { node: { req: { headers } } } as unknown as H3Event
}

describe('getRequestGeo', () => {
  it('reads the Cloudflare headers and rounds coordinates to one decimal', () => {
    const geo = getRequestGeo(fakeEvent({
      'cf-ipcountry': 'ke',
      'cf-ipcity': '  Nairobi ',
      'cf-iplatitude': '-1.29210',
      'cf-iplongitude': '36.82190'
    }))
    expect(geo).toEqual({ country: 'KE', city: 'Nairobi', latitude: -1.3, longitude: 36.8 })
    expect(hasRequestGeo(geo)).toBe(true)
  })

  it('returns nulls when no headers are present', () => {
    const geo = getRequestGeo(fakeEvent({}))
    expect(geo).toEqual({ country: null, city: null, latitude: null, longitude: null })
    expect(hasRequestGeo(geo)).toBe(false)
  })

  it('treats the unknown and Tor country codes as missing', () => {
    expect(getRequestGeo(fakeEvent({ 'cf-ipcountry': 'XX' })).country).toBeNull()
    expect(getRequestGeo(fakeEvent({ 'cf-ipcountry': 'T1' })).country).toBeNull()
    expect(getRequestGeo(fakeEvent({ 'cf-ipcountry': 'USA' })).country).toBeNull()
  })

  it('drops a lone or empty coordinate instead of turning it into zero', () => {
    expect(getRequestGeo(fakeEvent({ 'cf-iplatitude': '10.5' }))).toMatchObject({ latitude: null, longitude: null })
    expect(getRequestGeo(fakeEvent({ 'cf-iplatitude': '', 'cf-iplongitude': '20' }))).toMatchObject({ latitude: null, longitude: null })
    expect(getRequestGeo(fakeEvent({ 'cf-iplatitude': 'abc', 'cf-iplongitude': '20' }))).toMatchObject({ latitude: null, longitude: null })
  })

  it('keeps zero as a real coordinate', () => {
    expect(getRequestGeo(fakeEvent({ 'cf-iplatitude': '0', 'cf-iplongitude': '0' }))).toMatchObject({ latitude: 0, longitude: 0 })
  })

  it('drops out-of-range coordinates', () => {
    expect(getRequestGeo(fakeEvent({ 'cf-iplatitude': '91', 'cf-iplongitude': '20' }))).toMatchObject({ latitude: null, longitude: null })
    expect(getRequestGeo(fakeEvent({ 'cf-iplatitude': '10', 'cf-iplongitude': '-181' }))).toMatchObject({ latitude: null, longitude: null })
  })

  it('caps the city length', () => {
    const geo = getRequestGeo(fakeEvent({ 'cf-ipcity': 'x'.repeat(250) }))
    expect(geo.city).toHaveLength(100)
  })
})

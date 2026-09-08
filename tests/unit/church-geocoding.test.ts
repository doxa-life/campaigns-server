import { describe, expect, it, vi } from 'vitest'
import { buildNominatimSearchUrl, geocodeTown, pickSettlement } from '../../server/utils/app/nominatim'
import { guessChurchField, parseCongregationSize } from '../../shared/churches'

describe('pickSettlement', () => {
  it('takes the first settlement-level result', () => {
    const point = pickSettlement([
      { lat: '23.5', lon: '90.1', addresstype: 'state' },
      { lat: '24.1234', lon: '89.9876', addresstype: 'village' },
      { lat: '24.2', lon: '89.8', addresstype: 'town' }
    ])
    expect(point).toEqual({ latitude: 24.1234, longitude: 89.9876 })
  })

  it('rejects results broader than a town', () => {
    expect(pickSettlement([
      { lat: '23.5', lon: '90.1', addresstype: 'country' },
      { lat: '23.6', lon: '90.2', addresstype: 'district' },
      { lat: '23.7', lon: '90.3', addresstype: 'county' }
    ])).toBeNull()
  })

  it('skips results with unusable coordinates', () => {
    expect(pickSettlement([{ lat: 'abc', lon: '90.1', addresstype: 'village' }])).toBeNull()
    expect(pickSettlement([])).toBeNull()
  })
})

describe('buildNominatimSearchUrl', () => {
  it('restricts the search to the country and to settlements', () => {
    const url = new URL(buildNominatimSearchUrl('https://nominatim.example', 'Rangpur Sadar', 'BD'))
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('q')).toBe('Rangpur Sadar')
    expect(url.searchParams.get('countrycodes')).toBe('bd')
    expect(url.searchParams.get('featureType')).toBe('settlement')
    expect(url.searchParams.get('format')).toBe('jsonv2')
  })
})

describe('geocodeTown', () => {
  const options = { baseUrl: 'https://nominatim.example', userAgent: 'Test/1.0' }

  it('returns the point for a settlement match and sends an identifying user agent', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([
      { lat: '10.5', lon: '20.25', addresstype: 'village' }
    ]), { status: 200 }))
    const outcome = await geocodeTown('Somewhere', 'KE', { ...options, fetchImpl })
    expect(outcome).toEqual({ status: 'found', point: { latitude: 10.5, longitude: 20.25 } })
    const headers = (fetchImpl.mock.calls[0] as any)[1].headers
    expect(headers['User-Agent']).toBe('Test/1.0')
  })

  it('reports not found for an empty result set', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]', { status: 200 }))
    expect(await geocodeTown('Nowhere', 'KE', { ...options, fetchImpl })).toEqual({ status: 'not_found' })
  })

  it('reports unavailable on rate limiting, server errors and network failures', async () => {
    const limited = vi.fn(async () => new Response('', { status: 429 }))
    expect((await geocodeTown('X', 'KE', { ...options, fetchImpl: limited })).status).toBe('unavailable')

    const down = vi.fn(async () => new Response('', { status: 503 }))
    expect((await geocodeTown('X', 'KE', { ...options, fetchImpl: down })).status).toBe('unavailable')

    const offline = vi.fn(async () => { throw new Error('ECONNRESET') })
    expect((await geocodeTown('X', 'KE', { ...options, fetchImpl: offline })).status).toBe('unavailable')
  })
})

describe('parseCongregationSize', () => {
  it('takes the first number in free text', () => {
    expect(parseCongregationSize('about 50')).toBe(50)
    expect(parseCongregationSize('40-60 people')).toBe(40)
    expect(parseCongregationSize('1,200')).toBe(1200)
    expect(parseCongregationSize(75)).toBe(75)
  })

  it('returns null when there is no number', () => {
    expect(parseCongregationSize('unknown')).toBeNull()
    expect(parseCongregationSize('')).toBeNull()
    expect(parseCongregationSize(null)).toBeNull()
  })
})

describe('guessChurchField', () => {
  it('matches headers by label, key and alias regardless of case', () => {
    expect(guessChurchField('Church Name')).toBe('name')
    expect(guessChurchField('village')).toBe('town')
    expect(guessChurchField('Pastor')).toBe('pastor_name')
    expect(guessChurchField('pastor_phone')).toBe('pastor_phone')
    expect(guessChurchField('Language of Service')).toBe('service_language')
    expect(guessChurchField('Notes')).toBeNull()
  })
})

/**
 * OpenStreetMap Nominatim forward geocoding for a town inside a country.
 * Nominatim's public instance allows one request per second and needs an
 * identifying User-Agent; results may be stored under the ODbL licence.
 */

export const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org'

export interface NominatimResult {
  lat: string
  lon: string
  addresstype?: string
  class?: string
  type?: string
  display_name?: string
  importance?: number
}

/**
 * Place kinds specific enough to pin a church. Broader matches (district,
 * state, country) would put the pin somewhere it looks trustworthy but is not.
 */
export const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter'])

export interface GeocodedPoint {
  latitude: number
  longitude: number
}

export function buildNominatimSearchUrl(baseUrl: string, town: string, countryCode: string): string {
  const url = new URL('/search', baseUrl)
  url.searchParams.set('q', town)
  url.searchParams.set('countrycodes', countryCode.toLowerCase())
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')
  url.searchParams.set('featureType', 'settlement')
  return url.toString()
}

/** First settlement-level result with usable coordinates, or null. */
export function pickSettlement(results: NominatimResult[]): GeocodedPoint | null {
  for (const result of results) {
    if (!SETTLEMENT_TYPES.has(result.addresstype ?? '')) continue
    const latitude = Number(result.lat)
    const longitude = Number(result.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    return { latitude, longitude }
  }
  return null
}

export type GeocodeOutcome =
  | { status: 'found'; point: GeocodedPoint }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: string }

export interface GeocodeOptions {
  baseUrl?: string
  userAgent: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Looks a town up. `unavailable` covers rate limiting, outages and network
 * errors, where the caller should retry later rather than record a miss.
 */
export async function geocodeTown(town: string, countryCode: string, options: GeocodeOptions): Promise<GeocodeOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = buildNominatimSearchUrl(options.baseUrl ?? DEFAULT_NOMINATIM_URL, town, countryCode)

  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': options.userAgent, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000)
    })
  } catch (error: any) {
    return { status: 'unavailable', reason: error?.message || 'network error' }
  }

  if (response.status === 429 || response.status >= 500) {
    return { status: 'unavailable', reason: `HTTP ${response.status}` }
  }
  if (!response.ok) return { status: 'not_found' }

  let results: NominatimResult[]
  try {
    results = await response.json()
  } catch {
    return { status: 'unavailable', reason: 'invalid response body' }
  }
  if (!Array.isArray(results)) return { status: 'not_found' }

  const point = pickSettlement(results)
  return point ? { status: 'found', point } : { status: 'not_found' }
}

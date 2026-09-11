import countries from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import { parseCongregationSize, type ChurchLocationStatus } from '#shared/churches'
import type { Church, UpdateChurchData } from '../../database/churches'

countries.registerLocale(countriesEn)

/** Wire shape accepted by the create, update and import paths. Every key is optional. */
export interface ChurchInput {
  name?: unknown
  town?: unknown
  country?: unknown
  pastor_name?: unknown
  pastor_phone?: unknown
  pastor_email?: unknown
  congregation_size?: unknown
  service_language?: unknown
  latitude?: unknown
  longitude?: unknown
}

const TEXT_KEYS = ['name', 'town', 'pastor_name', 'pastor_phone', 'pastor_email', 'service_language'] as const

function trimmedOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/** ISO 3166 alpha-2 code from a code or an English country name; undefined when unrecognised. */
export function normalizeCountry(value: unknown): string | null | undefined {
  const text = trimmedOrNull(value)
  if (text === null) return null
  if (/^[A-Za-z]{2}$/.test(text) && countries.isValid(text.toUpperCase())) return text.toUpperCase()
  return countries.getAlpha2Code(text, 'en') ?? undefined
}

function toCoordinate(value: unknown, max: number): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n) || Math.abs(n) > max) return undefined
  return n
}

/**
 * Turns a request body or CSV row into column values. Only keys present on the
 * input are returned, so a partial update leaves the other columns alone.
 * Blank strings become NULL; congregation size takes the first number in the
 * text. Errors name the offending field.
 */
export function normalizeChurchInput(input: ChurchInput): { data: UpdateChurchData; errors: string[] } {
  const data: UpdateChurchData = {}
  const errors: string[] = []

  for (const key of TEXT_KEYS) {
    if (!(key in input)) continue
    const value = trimmedOrNull(input[key])
    if (key === 'name') {
      if (value === null) errors.push('Name is required')
      else data.name = value
    } else {
      data[key] = value
    }
  }

  if ('country' in input) {
    const country = normalizeCountry(input.country)
    if (country === undefined) errors.push('Country is not recognised')
    else data.country = country
  }

  if ('congregation_size' in input) {
    data.congregation_size = parseCongregationSize(input.congregation_size as string | number | null)
  }

  if ('latitude' in input || 'longitude' in input) {
    const latitude = toCoordinate(input.latitude, 90)
    const longitude = toCoordinate(input.longitude, 180)
    if (latitude === undefined || longitude === undefined) {
      errors.push('Latitude and longitude must be valid coordinates')
    } else if ((latitude === null) !== (longitude === null)) {
      errors.push('Latitude and longitude must be given together')
    } else {
      data.latitude = latitude
      data.longitude = longitude
    }
  }

  return { data, errors }
}

/** Status for a church that has just been created from the given values. */
export function initialLocationStatus(data: UpdateChurchData): ChurchLocationStatus | null {
  if (data.latitude != null && data.longitude != null) return 'manual'
  return data.town && data.country ? 'pending' : null
}

/**
 * Location columns after applying an update. Coordinates in the update mean
 * the admin placed the pin. A town or country change re-queues a lookup, unless
 * the pin was placed by hand, in which case it stays where it was put.
 */
export function locationAfterUpdate(current: Church, data: UpdateChurchData): Partial<UpdateChurchData> {
  const town = data.town !== undefined ? data.town : current.town
  const country = data.country !== undefined ? data.country : current.country
  const lookupStatus: ChurchLocationStatus | null = town && country ? 'pending' : null

  if (data.latitude !== undefined && data.longitude !== undefined) {
    if (data.latitude !== null && data.longitude !== null) return { location_status: 'manual' }
    return { latitude: null, longitude: null, location_status: lookupStatus }
  }

  const placeChanged = (data.town !== undefined && data.town !== current.town)
    || (data.country !== undefined && data.country !== current.country)
  if (placeChanged && current.location_status !== 'manual') {
    return { latitude: null, longitude: null, location_status: lookupStatus }
  }
  return {}
}

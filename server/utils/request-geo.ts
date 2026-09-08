/**
 * The visitor's location as Cloudflare reports it on the incoming request
 * (the zone's "Add visitor location headers" transform). Local dev and
 * direct-to-origin requests carry none of these headers, so every field
 * may be null.
 *
 * Coordinates are rounded to one decimal (~11 km) before they are returned,
 * so what gets stored identifies an area, not a person.
 */
import type { H3Event } from 'h3'
import { getHeader } from 'h3'

export interface RequestGeo {
  /** ISO 3166-1 alpha-2, upper-case. */
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

// Cloudflare sends XX when the country is unknown and T1 for Tor exit nodes.
const UNKNOWN_COUNTRIES = new Set(['XX', 'T1'])
const MAX_CITY_LENGTH = 100

function toFiniteNumber(value: unknown): number | null {
  // Nullish/empty must not reach Number() — Number(null) and Number('') are 0,
  // a real coordinate.
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function coarsen(value: number): number {
  return Math.round(value * 10) / 10
}

export function getRequestGeo(event: H3Event): RequestGeo {
  const rawCountry = getHeader(event, 'cf-ipcountry')?.trim().toUpperCase() || ''
  const country = /^[A-Z]{2}$/.test(rawCountry) && !UNKNOWN_COUNTRIES.has(rawCountry) ? rawCountry : null

  const city = getHeader(event, 'cf-ipcity')?.trim().slice(0, MAX_CITY_LENGTH) || null

  // Pair-or-nothing: a lone coordinate cannot be plotted.
  const lat = toFiniteNumber(getHeader(event, 'cf-iplatitude'))
  const lon = toFiniteNumber(getHeader(event, 'cf-iplongitude'))
  const plottable = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

  return {
    country,
    city,
    latitude: plottable ? coarsen(lat) : null,
    longitude: plottable ? coarsen(lon) : null
  }
}

export function hasRequestGeo(geo: RequestGeo): boolean {
  return geo.country !== null || geo.city !== null || geo.latitude !== null
}

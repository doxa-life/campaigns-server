// Church records entered by partner denominations: where each congregation is
// and how to reach its pastor. Field keys match the churches table columns.

export type ChurchLocationStatus = 'pending' | 'geocoded' | 'manual' | 'not_found'

/** A churches row as it travels over the wire. */
export interface ChurchRecord {
  id: number
  name: string
  town: string | null
  country: string | null
  pastor_name: string | null
  pastor_phone: string | null
  pastor_email: string | null
  congregation_size: number | null
  service_language: string | null
  latitude: number | null
  longitude: number | null
  location_status: ChurchLocationStatus | null
  geocode_attempts: number
  created_at: string
  updated_at: string
}

export const CHURCH_LOCATION_STATUS_LABELS: Record<ChurchLocationStatus, string> = {
  pending: 'Locating…',
  geocoded: 'Located',
  manual: 'Set manually',
  not_found: 'Not found',
}

export const CHURCH_LOCATION_STATUS_COLORS: Record<ChurchLocationStatus, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  pending: 'info',
  geocoded: 'success',
  manual: 'success',
  not_found: 'warning',
}

/** Label for a stored status; a NULL status means there is nothing to locate from. */
export function churchLocationStatusLabel(status: string | null | undefined): string {
  return status && status in CHURCH_LOCATION_STATUS_LABELS
    ? CHURCH_LOCATION_STATUS_LABELS[status as ChurchLocationStatus]
    : 'No location'
}

export function churchLocationStatusColor(status: string | null | undefined): 'success' | 'info' | 'warning' | 'error' | 'neutral' {
  return status && status in CHURCH_LOCATION_STATUS_COLORS
    ? CHURCH_LOCATION_STATUS_COLORS[status as ChurchLocationStatus]
    : 'neutral'
}

export type ChurchFieldType = 'text' | 'select' | 'number' | 'email' | 'phone'

export interface ChurchFieldDefinition {
  key: string
  label: string
  type: ChurchFieldType
  description?: string
  /** Header names the CSV importer treats as this field when guessing a mapping. */
  aliases?: string[]
}

export const CHURCH_FIELDS: ChurchFieldDefinition[] = [
  { key: 'name', label: 'Church name', type: 'text', aliases: ['church', 'church name', 'name of church'] },
  { key: 'town', label: 'Village / town', type: 'text', description: 'Village, town or city the church meets in', aliases: ['village', 'town', 'city', 'village/town', 'location'] },
  { key: 'country', label: 'Country', type: 'select', description: 'Country the church is in' },
  { key: 'pastor_name', label: 'Pastor name', type: 'text', aliases: ['pastor', 'pastor name', 'name of pastor'] },
  { key: 'pastor_phone', label: 'Pastor phone', type: 'phone', aliases: ['phone', 'pastor phone', 'telephone', 'mobile'] },
  { key: 'pastor_email', label: 'Pastor email', type: 'email', aliases: ['email', 'pastor email', 'e-mail'] },
  { key: 'congregation_size', label: 'Congregation size', type: 'number', description: 'Typical attendance', aliases: ['size', 'congregation', 'congregation size', 'attendance', 'members'] },
  { key: 'service_language', label: 'Language of service', type: 'text', aliases: ['language', 'language of service', 'service language'] },
  { key: 'latitude', label: 'Latitude', type: 'number', aliases: ['lat'] },
  { key: 'longitude', label: 'Longitude', type: 'number', aliases: ['lng', 'lon', 'long'] },
]

const fieldMap = new Map(CHURCH_FIELDS.map(f => [f.key, f]))

export function getChurchField(key: string): ChurchFieldDefinition | undefined {
  return fieldMap.get(key)
}

export function getChurchFieldLabel(key: string): string {
  return fieldMap.get(key)?.label || key
}

/** Field key a CSV header most likely holds, by exact label/key/alias match, or null. */
export function guessChurchField(header: string): string | null {
  const normalized = header.trim().toLowerCase().replace(/[_\s]+/g, ' ')
  for (const field of CHURCH_FIELDS) {
    const candidates = [field.key.replace(/_/g, ' '), field.label.toLowerCase(), ...(field.aliases ?? [])]
    if (candidates.includes(normalized)) return field.key
  }
  return null
}

/**
 * Whole number from free-form attendance text: "about 50", "40-60 people" and
 * "1,200" all yield the first number found. Null when there is none.
 */
export function parseCongregationSize(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
  const match = value.replace(/,/g, '').match(/\d+/)
  if (!match) return null
  const n = parseInt(match[0], 10)
  return Number.isFinite(n) ? n : null
}

/** True when a church has a stored coordinate pair that can be drawn on a map. */
export function hasChurchCoordinates(church: { latitude: number | null; longitude: number | null }): boolean {
  return church.latitude !== null && church.longitude !== null
    && Number.isFinite(church.latitude) && Number.isFinite(church.longitude)
}

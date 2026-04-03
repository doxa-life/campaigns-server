import { getFieldOptionLabel, getFieldOptionDescription, getFieldOptionAlternates, getCountryLabel, allFields } from './field-options'
import { generatePeopleGroupDescription } from './people-group-description'

interface PeopleGroupRecord {
  id: number
  name: string
  slug: string | null
  image_url: string | null
  metadata: Record<string, any> | null
  population: number | null
  country_code: string | null
  latitude: number | null
  longitude: number | null
  engagement_status: string | null
  primary_religion: string | null
  primary_language: string | null
  descriptions: Record<string, string> | null
  total_people_praying?: number
  people_committed?: number
  [key: string]: unknown
}

interface ValueLabelPair {
  value: string
  label: string
}

// Fields that should be formatted as {value, label} pairs — derived from field definitions
const FORMATTED_FIELDS = new Set(
  allFields.filter(f => f.type === 'select').map(f => f.key)
)

// Map from API response field names to internal field keys
const FIELD_KEY_MAP: Record<string, string> = {
  wagf_region: 'doxa_wagf_region',
  wagf_block: 'doxa_wagf_block',
  wagf_member: 'doxa_wagf_member',
  country: 'country_code',
  rop1: 'imb_reg_of_people_1',
  religion: 'primary_religion'
}

/**
 * Get a formatted value-label pair for a field
 */
function formatValueLabel(fieldKey: string, value: string | null | undefined, lang: string): ValueLabelPair | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const label = getFieldOptionLabel(fieldKey, value, lang)

  return {
    value,
    label: label || value
  }
}

/**
 * Get a field value from either table column or metadata
 */
function getFieldValue(pg: PeopleGroupRecord, fieldKey: string): string | null {
  // Check if it's a table column field first
  if (fieldKey in pg && pg[fieldKey] !== undefined) {
    const val = pg[fieldKey]
    return val !== null && val !== undefined ? String(val) : null
  }

  // Otherwise look in metadata
  if (!pg.metadata) return null

  const val = pg.metadata[fieldKey]
  return val !== null && val !== undefined ? String(val) : null
}

/**
 * Parse metadata JSON safely
 */
function parseMetadata(metadata: Record<string, any> | null): Record<string, unknown> {
  return metadata || {}
}

/**
 * Format a value-label pair and include description when the field has one.
 */
function formatValueLabelWithDescription(
  fieldKey: string,
  value: string | null | undefined,
  lang: string
): (ValueLabelPair & { description?: string, alternates?: string[] }) | null {
  const pair = formatValueLabel(fieldKey, value, lang)
  if (!pair) return null
  const result: ValueLabelPair & { description?: string, alternates?: string[] } = { ...pair }
  const description = getFieldOptionDescription(fieldKey, value!, lang)
  if (description) result.description = description
  const alternates = getFieldOptionAlternates(fieldKey, value!, lang)
  if (alternates) result.alternates = alternates
  return result
}

/**
 * Format a generic field value — applies select formatting if applicable
 */
function formatField(pg: PeopleGroupRecord, fieldKey: string, lang: string): unknown {
  const fieldDef = allFields.find(f => f.key === fieldKey)

  // Boolean fields: preserve native type
  if (fieldDef?.type === 'boolean') {
    const raw = pg.metadata?.[fieldKey]
    return raw === true || raw === '1' ? true : raw === false || raw === '0' ? false : null
  }

  const value = getFieldValue(pg, fieldKey)

  if (value !== null && FORMATTED_FIELDS.has(fieldKey)) {
    return formatValueLabelWithDescription(fieldKey, value, lang)
  }

  return value ?? pg.metadata?.[fieldKey] ?? null
}

/**
 * Resolve a requested field name, handling aliases and special computed fields.
 * Returns undefined if the field should be handled generically.
 */
function resolveSpecialField(pg: PeopleGroupRecord, field: string, meta: Record<string, unknown>, lang: string): { value: unknown } | undefined {
  switch (field) {
    case 'id': return { value: pg.slug }
    case 'display_name': return { value: meta.imb_display_name || pg.name }
    case 'location_description': return { value: meta.imb_location_description || null }
    case 'has_photo': return { value: meta.imb_has_photo === '1' || meta.imb_has_photo === true }
    case 'picture_url': return { value: pg.image_url || meta.imb_picture_url || null }
    case 'picture_credit': return { value: meta.picture_credit || null }
    case 'picture_credit_html': return { value: meta.imb_picture_credit_html || null }
    case 'people_praying': return { value: pg.total_people_praying || 0 }
    case 'people_committed': return { value: pg.people_committed || 0 }
    case 'adopted_by_churches': return { value: (pg as any).adopted_by_churches || 0 }
    case 'descriptions': return { value: pg.descriptions?.[lang] || pg.descriptions?.['en'] || null }
    case 'generated_description':
    case 'imb_people_description':
      return {
        value: generatePeopleGroupDescription({
          name: pg.name,
          descriptions: pg.descriptions,
          country_code: pg.country_code,
          population: pg.population,
          engagement_status: pg.engagement_status,
          primary_religion: pg.primary_religion,
          primary_language: pg.primary_language as string | null,
          metadata: meta as any
        }, lang)
      }
    default: return undefined
  }
}

/**
 * Format a people group for the list endpoint
 * Returns summary data with {value, label} formatting for select fields
 */
export function formatPeopleGroupForList(pg: PeopleGroupRecord, lang: string = 'en'): Record<string, unknown> {
  const meta = parseMetadata(pg.metadata)

  return {
    id: pg.slug,
    name: pg.name,
    slug: pg.slug,
    display_name: meta.imb_display_name || pg.name,
    wagf_region: formatValueLabel('doxa_wagf_region', meta.doxa_wagf_region as string, lang),
    wagf_block: formatValueLabel('doxa_wagf_block', meta.doxa_wagf_block as string, lang),
    wagf_member: formatValueLabel('doxa_wagf_member', meta.doxa_wagf_member as string, lang),
    country: formatValueLabel('country_code', pg.country_code, lang),
    rop1: formatValueLabel('imb_reg_of_people_1', meta.imb_reg_of_people_1 as string, lang),
    religion: formatValueLabelWithDescription('primary_religion', pg.primary_religion as string, lang),
    location_description: meta.imb_location_description || null,
    population: pg.population || null,
    has_photo: meta.imb_has_photo === '1' || meta.imb_has_photo === true,
    picture_url: pg.image_url || meta.imb_picture_url || null,
    picture_credit: meta.picture_credit || null,
    people_praying: pg.total_people_praying || 0,
    people_committed: pg.people_committed || 0,
    adopted_by_churches: (pg as any).adopted_by_churches || 0
  }
}

/**
 * Format a people group with only requested fields for list endpoint
 */
export function formatPeopleGroupForListWithFields(
  pg: PeopleGroupRecord,
  fields: string[],
  lang: string = 'en'
): Record<string, unknown> {
  const meta = parseMetadata(pg.metadata)
  const result: Record<string, unknown> = {}

  for (const field of fields) {
    // Check special/computed fields first
    const special = resolveSpecialField(pg, field, meta, lang)
    if (special) {
      result[field] = special.value
      continue
    }

    // Resolve aliased field names (e.g. 'country' -> 'country_code')
    const fieldKey = FIELD_KEY_MAP[field] || field

    // If aliased, format with label
    if (FIELD_KEY_MAP[field]) {
      result[field] = formatValueLabelWithDescription(fieldKey, getFieldValue(pg, fieldKey), lang)
    } else {
      result[field] = formatField(pg, fieldKey, lang)
    }
  }

  return result
}

/**
 * Format a people group for the detail endpoint
 * Returns all fields with {value, label} formatting where applicable
 */
export function formatPeopleGroupForDetail(pg: PeopleGroupRecord, lang: string = 'en'): Record<string, unknown> {
  const meta = parseMetadata(pg.metadata)

  const result: Record<string, unknown> = {
    id: pg.slug,
    name: pg.name,
    slug: pg.slug,
    display_name: meta.imb_display_name || pg.name,
    image_url: pg.image_url,
    picture_credit: meta.picture_credit || null,
    population: pg.population,
    people_praying: pg.total_people_praying || 0,
    adopted_by_churches: (pg as any).adopted_by_churches || 0,
    joshua_project_id: (pg as any).joshua_project_id ?? null
  }

  // Process all defined fields
  for (const fieldDef of allFields) {
    const key = fieldDef.key

    // Skip fields we've already handled or don't want in the response
    if (['name', 'image_url', 'imb_picture_credit_html', 'descriptions', 'joshua_project_id', 'doxa_masteruid', 'picture_credit'].includes(key)) continue

    // Handle generated description
    if (key === 'imb_people_description') {
      result[key] = generatePeopleGroupDescription({
        name: pg.name,
        descriptions: pg.descriptions,
        metadata: meta as any
      }, lang)
      continue
    }

    result[key] = formatField(pg, key, lang)
  }

  return result
}

/**
 * Format a people group for the /all endpoint (raw values, no formatting)
 * Returns only the requested fields
 */
export function formatPeopleGroupRaw(pg: PeopleGroupRecord, fields: string[], lang: string = 'en'): Record<string, unknown> {
  const meta = parseMetadata(pg.metadata)
  const result: Record<string, unknown> = {}

  for (const field of fields) {
    switch (field) {
      case 'display_name':
      case 'imb_display_name':
        result[field] = meta.imb_display_name || pg.name
        break
      case 'latitude':
        result.latitude = pg.latitude !== null ? String(pg.latitude) : null
        break
      case 'longitude':
        result.longitude = pg.longitude !== null ? String(pg.longitude) : null
        break
      case 'population':
        result.population = pg.population !== null ? String(pg.population) : null
        break
      case 'descriptions':
        result.descriptions = pg.descriptions?.['en'] || null
        break
      case 'generated_description':
      case 'imb_people_description':
        result[field] = generatePeopleGroupDescription({
          name: pg.name,
          descriptions: pg.descriptions,
          country_code: pg.country_code,
          population: pg.population,
          engagement_status: pg.engagement_status,
          primary_religion: pg.primary_religion,
          primary_language: pg.primary_language as string | null,
          metadata: meta as any
        }, lang)
        break
      default:
        result[field] = getFieldValue(pg, field) ?? meta[field] ?? null
        break
    }
  }

  return result
}

// Default fields for /list endpoint
export const DEFAULT_LIST_FIELDS = [
  'id', 'name', 'slug', 'display_name', 'wagf_region', 'wagf_block', 'wagf_member',
  'country', 'rop1', 'religion', 'location_description', 'population',
  'has_photo', 'picture_url', 'people_praying', 'people_committed', 'adopted_by_churches'
]

// Default fields for /all endpoint
export const DEFAULT_ALL_FIELDS = [
  'name', 'slug', 'imb_reg_of_people_1', 'doxa_wagf_region', 'doxa_wagf_block',
  'population', 'primary_religion', 'imb_reg_of_religion_3', 'country_code',
  'imb_has_photo', 'image_url', 'latitude', 'longitude',
  'imb_people_description'
]

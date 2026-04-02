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

// Fields that should be formatted as {value, label} pairs
const FORMATTED_FIELDS = new Set([
  'doxa_wagf_region',
  'doxa_wagf_block',
  'doxa_wagf_member',
  'country_code',
  'imb_reg_of_people_1',
  'primary_religion',
  'imb_reg_of_religion_3',
  'imb_reg_of_religion_4',
  'region',
  'imb_subregion',
  'engagement_status',
  'imb_evangelical_level',
  'imb_population_class',
  'imb_gsec',
  'imb_strategic_priority_index',
  'imb_lostness_priority_index',
  'imb_affinity_code',
  'imb_is_indigenous',
  'imb_congregation_existing',
  'imb_church_planting',
  'imb_bible_available',
  'imb_jesus_film_available',
  'imb_radio_broadcast_available',
  'imb_gospel_recordings_available',
  'imb_audio_scripture_available',
  'imb_bible_stories_available',
  'imb_bible_translation_level',
  'primary_language'
])

// Map from API response field names to metadata field keys
const FIELD_KEY_MAP: Record<string, string> = {
  wagf_region: 'doxa_wagf_region',
  wagf_block: 'doxa_wagf_block',
  wagf_member: 'doxa_wagf_member',
  country: 'country_code',
  rop1: 'imb_reg_of_people_1',
  religion: 'imb_reg_of_religion_3'
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
    adopted_by_churches: 0
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
    switch (field) {
      case 'id':
        result.id = pg.slug
        break
      case 'name':
        result.name = pg.name
        break
      case 'slug':
        result.slug = pg.slug
        break
      case 'display_name':
        result.display_name = meta.imb_display_name || pg.name
        break
      case 'wagf_region':
        result.wagf_region = formatValueLabel('doxa_wagf_region', meta.doxa_wagf_region as string, lang)
        break
      case 'wagf_block':
        result.wagf_block = formatValueLabel('doxa_wagf_block', meta.doxa_wagf_block as string, lang)
        break
      case 'wagf_member':
        result.wagf_member = formatValueLabel('doxa_wagf_member', meta.doxa_wagf_member as string, lang)
        break
      case 'country':
        result.country = formatValueLabel('country_code', pg.country_code, lang)
        break
      case 'rop1':
        result.rop1 = formatValueLabel('imb_reg_of_people_1', meta.imb_reg_of_people_1 as string, lang)
        break
      case 'religion':
        result.religion = formatValueLabelWithDescription('primary_religion', pg.primary_religion as string, lang)
        break
      case 'location_description':
        result.location_description = meta.imb_location_description || null
        break
      case 'population':
        result.population = pg.population || null
        break
      case 'has_photo':
        result.has_photo = meta.imb_has_photo === '1' || meta.imb_has_photo === true
        break
      case 'picture_url':
        result.picture_url = pg.image_url || meta.imb_picture_url || null
        break
      case 'picture_credit_html':
        result.picture_credit_html = meta.imb_picture_credit_html || null
        break
      case 'picture_credit':
        result.picture_credit = meta.picture_credit || null
        break
      case 'people_praying':
        result.people_praying = pg.total_people_praying || 0
        break
      case 'people_committed':
        result.people_committed = pg.people_committed || 0
        break
      case 'adopted_by_churches':
        result.adopted_by_churches = 0
        break
      case 'joshua_project_id':
        result.joshua_project_id = pg.joshua_project_id ?? null
        break
      case 'descriptions':
        result.descriptions = pg.descriptions?.[lang] || pg.descriptions?.['en'] || null
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
      default: {
        // Try to get from metadata or table columns
        const value = getFieldValue(pg, field)
        if (value !== null) {
          result[field] = FORMATTED_FIELDS.has(field)
            ? formatValueLabelWithDescription(field, value, lang)
            : value
        } else if (meta[field] !== undefined) {
          result[field] = meta[field]
        }
        break
      }
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
    adopted_by_churches: 0,
    joshua_project_id: pg.joshua_project_id ?? null
  }

  // Process all defined fields
  for (const fieldDef of allFields) {
    const key = fieldDef.key

    // Skip fields we've already handled or don't want in the response
    if (['name', 'image_url', 'imb_picture_credit_html', 'descriptions', 'joshua_project_id', 'doxa_masteruid', 'picture_credit'].includes(key)) continue

    // Handle special fields
    if (key === 'imb_people_description') {
      result[key] = generatePeopleGroupDescription({
        name: pg.name,
        descriptions: pg.descriptions,
        metadata: meta as any
      }, lang)
      continue
    }

    // Get the value from table columns or metadata
    const value = getFieldValue(pg, key)

    // Format with label (and description when available) if this is a select field
    if (FORMATTED_FIELDS.has(key) && value !== null && value !== undefined) {
      result[key] = formatValueLabelWithDescription(key, value, lang)
    } else {
      result[key] = value ?? null
    }
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
    // Handle special mapped fields
    switch (field) {
      case 'name':
        result.name = pg.name
        break
      case 'image_url':
        result.image_url = pg.image_url
        break
      case 'joshua_project_id':
        result.joshua_project_id = pg.joshua_project_id
        break
      case 'slug':
        result.slug = pg.slug
        break
      case 'imb_display_name':
        result.imb_display_name = meta.imb_display_name || pg.name
        break
      case 'country_code':
        result.country_code = pg.country_code
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
      case 'engagement_status':
        result.engagement_status = pg.engagement_status
        break
      case 'primary_religion':
        result.primary_religion = pg.primary_religion
        break
      case 'primary_language':
        result.primary_language = pg.primary_language
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
        // Get from metadata
        result[field] = meta[field] ?? null
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

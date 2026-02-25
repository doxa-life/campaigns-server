import { getFieldOptionLabel, getFieldOptionDescription, getCountryLabel, allFields } from './field-options'
import { generatePeopleGroupDescription } from './people-group-description'

interface PeopleGroupRecord {
  id: number
  dt_id: string
  name: string
  slug: string | null
  image_url: string | null
  metadata: string | null
  population: number | null
  country_code: string | null
  latitude: number | null
  longitude: number | null
  engagement_status: string | null
  primary_religion: string | null
  descriptions: Record<string, string> | null
  total_people_praying?: number
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
  'imb_isoalpha3',
  'imb_reg_of_people_1',
  'imb_reg_of_religion',
  'imb_reg_of_religion_3',
  'imb_reg_of_religion_4',
  'imb_region',
  'imb_subregion',
  'imb_engagement_status',
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
  'imb_reg_of_language'
])

// Map from API response field names to metadata field keys
const FIELD_KEY_MAP: Record<string, string> = {
  wagf_region: 'doxa_wagf_region',
  wagf_block: 'doxa_wagf_block',
  wagf_member: 'doxa_wagf_member',
  country: 'imb_isoalpha3',
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
  const tableColumnMap: Record<string, keyof PeopleGroupRecord> = {
    imb_isoalpha3: 'country_code',
    imb_lat: 'latitude',
    imb_lng: 'longitude',
    imb_population: 'population',
    imb_engagement_status: 'engagement_status',
    imb_reg_of_religion: 'primary_religion'
  }

  if (tableColumnMap[fieldKey]) {
    const val = pg[tableColumnMap[fieldKey]]
    return val !== null && val !== undefined ? String(val) : null
  }

  // Otherwise look in metadata
  if (!pg.metadata) return null

  try {
    const meta = typeof pg.metadata === 'string' ? JSON.parse(pg.metadata) : pg.metadata
    const val = meta[fieldKey]
    return val !== null && val !== undefined ? String(val) : null
  } catch {
    return null
  }
}

/**
 * Parse metadata JSON safely
 */
function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {}
  try {
    return typeof metadata === 'string' ? JSON.parse(metadata) : metadata
  } catch {
    return {}
  }
}

/**
 * Format a value-label pair and include description when the field has one.
 */
function formatValueLabelWithDescription(
  fieldKey: string,
  value: string | null | undefined,
  lang: string
): (ValueLabelPair & { description?: string }) | null {
  const pair = formatValueLabel(fieldKey, value, lang)
  if (!pair) return null
  const description = getFieldOptionDescription(fieldKey, value!, lang)
  if (description) return { ...pair, description }
  return pair
}

/**
 * Format a people group for the list endpoint
 * Returns summary data with {value, label} formatting for select fields
 */
export function formatPeopleGroupForList(pg: PeopleGroupRecord, lang: string = 'en'): Record<string, unknown> {
  const meta = parseMetadata(pg.metadata)

  return {
    id: pg.dt_id,
    name: pg.name,
    slug: pg.slug || pg.dt_id,
    display_name: meta.imb_display_name || pg.name,
    wagf_region: formatValueLabel('doxa_wagf_region', meta.doxa_wagf_region as string, lang),
    wagf_block: formatValueLabel('doxa_wagf_block', meta.doxa_wagf_block as string, lang),
    wagf_member: formatValueLabel('doxa_wagf_member', meta.doxa_wagf_member as string, lang),
    country: formatValueLabel('imb_isoalpha3', pg.country_code, lang),
    rop1: formatValueLabel('imb_reg_of_people_1', meta.imb_reg_of_people_1 as string, lang),
    religion: formatValueLabelWithDescription('imb_reg_of_religion', (pg.primary_religion || meta.imb_reg_of_religion) as string, lang),
    location_description: meta.imb_location_description || null,
    population: pg.population || null,
    has_photo: meta.imb_has_photo === 'yes' || meta.imb_has_photo === true || !!pg.image_url,
    picture_url: pg.image_url || meta.imb_picture_url || null,
    picture_credit_html: meta.imb_picture_credit_html || null,
    picture_credit: meta.picture_credit || null,
    people_praying: pg.total_people_praying || 0,
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
        result.id = pg.dt_id
        break
      case 'name':
        result.name = pg.name
        break
      case 'slug':
        result.slug = pg.slug || pg.dt_id
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
        result.country = formatValueLabel('imb_isoalpha3', pg.country_code, lang)
        break
      case 'rop1':
        result.rop1 = formatValueLabel('imb_reg_of_people_1', meta.imb_reg_of_people_1 as string, lang)
        break
      case 'religion':
        result.religion = formatValueLabelWithDescription('imb_reg_of_religion', (pg.primary_religion || meta.imb_reg_of_religion) as string, lang)
        break
      case 'location_description':
        result.location_description = meta.imb_location_description || null
        break
      case 'population':
        result.population = pg.population || null
        break
      case 'has_photo':
        result.has_photo = meta.imb_has_photo === 'yes' || meta.imb_has_photo === true || !!pg.image_url
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
      case 'adopted_by_churches':
        result.adopted_by_churches = 0
        break
      case 'descriptions':
        result.descriptions = pg.descriptions?.[lang] || pg.descriptions?.['en'] || null
        break
      case 'generated_description':
      case 'imb_people_description':
        result[field] = generatePeopleGroupDescription({
          name: pg.name,
          descriptions: pg.descriptions,
          metadata: meta as any
        }, lang)
        break
      default:
        // Try to get from metadata
        if (meta[field] !== undefined) {
          result[field] = meta[field]
        }
        break
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
    id: pg.dt_id,
    name: pg.name,
    slug: pg.slug || pg.dt_id,
    display_name: meta.imb_display_name || pg.name,
    image_url: pg.image_url,
    picture_credit: meta.picture_credit || null,
    population: pg.population,
    people_praying: pg.total_people_praying || 0,
    adopted_by_churches: 0
  }

  // Process all defined fields
  for (const fieldDef of allFields) {
    const key = fieldDef.key

    // Skip fields we've already handled or don't want in the response
    if (['name', 'image_url', 'imb_picture_credit_html', 'descriptions', 'dt_id', 'doxa_masteruid'].includes(key)) continue

    // Handle special fields
    if (key === 'imb_people_description') {
      result[key] = generatePeopleGroupDescription({
        name: pg.name,
        descriptions: pg.descriptions,
        metadata: meta as any
      }, lang)
      continue
    }

    // Get the value
    let value: string | null = null

    // Check table columns first
    if (key === 'imb_isoalpha3') {
      value = pg.country_code
    } else if (key === 'imb_lat') {
      value = pg.latitude !== null ? String(pg.latitude) : null
    } else if (key === 'imb_lng') {
      value = pg.longitude !== null ? String(pg.longitude) : null
    } else if (key === 'imb_population') {
      value = pg.population !== null ? String(pg.population) : null
    } else if (key === 'imb_engagement_status') {
      value = pg.engagement_status
    } else if (key === 'imb_reg_of_religion') {
      value = pg.primary_religion
    } else {
      // Get from metadata
      value = meta[key] as string | null
    }

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
      case 'dt_id':
        result.dt_id = pg.dt_id
        break
      case 'slug':
        result.slug = pg.slug || pg.dt_id
        break
      case 'imb_display_name':
        result.imb_display_name = meta.imb_display_name || pg.name
        break
      case 'imb_isoalpha3':
        result.imb_isoalpha3 = pg.country_code
        break
      case 'imb_lat':
        result.imb_lat = pg.latitude !== null ? String(pg.latitude) : null
        break
      case 'imb_lng':
        result.imb_lng = pg.longitude !== null ? String(pg.longitude) : null
        break
      case 'imb_population':
        result.imb_population = pg.population !== null ? String(pg.population) : null
        break
      case 'imb_engagement_status':
        result.imb_engagement_status = pg.engagement_status || meta.imb_engagement_status || null
        break
      case 'imb_reg_of_religion':
        result.imb_reg_of_religion = pg.primary_religion || meta.imb_reg_of_religion || null
        break
      case 'descriptions':
        result.descriptions = pg.descriptions?.['en'] || null
        break
      case 'generated_description':
      case 'imb_people_description':
        result[field] = generatePeopleGroupDescription({
          name: pg.name,
          descriptions: pg.descriptions,
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
  'has_photo', 'picture_url', 'picture_credit_html', 'people_praying', 'adopted_by_churches'
]

// Default fields for /all endpoint
export const DEFAULT_ALL_FIELDS = [
  'name', 'slug', 'imb_reg_of_people_1', 'doxa_wagf_region', 'doxa_wagf_block',
  'imb_population', 'imb_reg_of_religion', 'imb_reg_of_religion_3', 'imb_isoalpha3',
  'imb_has_photo', 'image_url', 'imb_lat', 'imb_lng',
  'imb_people_description'
]

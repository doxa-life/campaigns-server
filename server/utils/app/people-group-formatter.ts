import { getFieldOptionLabel, getFieldOptionDescription, getFieldOptionAlternates, allFields } from './field-options'
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

// Alias -> internal field key (for resolving incoming field requests)
const ALIAS_TO_INTERNAL: Record<string, string> = {
  wagf_region: 'doxa_wagf_region',
  wagf_block: 'doxa_wagf_block',
  wagf_member: 'doxa_wagf_member',
  rop1: 'imb_reg_of_people_1',
  religion: 'primary_religion',
  location_description: 'imb_location_description',
  has_photo: 'imb_has_photo'
}

// Internal field key -> alias (for outputting aliased keys)
export const INTERNAL_TO_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(ALIAS_TO_INTERNAL).map(([alias, internal]) => [internal, alias])
)

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
  if (fieldKey in pg && pg[fieldKey] !== undefined) {
    const val = pg[fieldKey]
    return val !== null && val !== undefined ? String(val) : null
  }

  if (!pg.metadata) return null

  const val = pg.metadata[fieldKey]
  return val !== null && val !== undefined ? String(val) : null
}

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
 * Resolve special/computed fields that don't come directly from field definitions.
 */
function resolveSpecialField(pg: PeopleGroupRecord, field: string, meta: Record<string, unknown>, lang: string): { value: unknown } | undefined {
  switch (field) {
    case 'location_description': return { value: meta.imb_location_description || null }
    case 'has_photo': return { value: meta.imb_has_photo === '1' || meta.imb_has_photo === true }
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
 * Unified people group formatter.
 * - No fields option: returns DEFAULT_LIST_FIELDS
 * - fields array: returns only those fields (supports aliases)
 * - fields 'all': returns all field definitions with aliases applied
 */
export function formatPeopleGroup(
  pg: PeopleGroupRecord,
  options: { fields?: string[] | 'all', lang?: string } = {}
): Record<string, unknown> {
  const lang = options.lang || 'en'
  const meta = parseMetadata(pg.metadata)
  const fields = options.fields || DEFAULT_LIST_FIELDS

  if (fields === 'all') {
    return formatAllFields(pg, meta, lang)
  }

  return formatRequestedFields(pg, meta, fields, lang)
}

/**
 * Format all fields — used by detail endpoint and CSV export.
 * Uses INTERNAL_TO_ALIAS to output aliased keys where defined.
 */
function formatAllFields(pg: PeopleGroupRecord, meta: Record<string, unknown>, lang: string): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: pg.name,
    slug: pg.slug,
    image_url: pg.image_url,
    picture_credit: meta.picture_credit || null,
    population: pg.population,
    people_praying: pg.total_people_praying || 0,
    adopted_by_churches: (pg as any).adopted_by_churches || 0,
    joshua_project_id: (pg as any).joshua_project_id ?? null
  }

  for (const fieldDef of allFields) {
    const key = fieldDef.key
    if (fieldDef.hidden || key in result) continue

    const outputKey = INTERNAL_TO_ALIAS[key] || key

    if (key === 'imb_people_description') {
      result[outputKey] = generatePeopleGroupDescription({
        name: pg.name,
        descriptions: pg.descriptions,
        metadata: meta as any
      }, lang)
      continue
    }

    result[outputKey] = formatField(pg, key, lang)
  }

  return result
}

/**
 * Format only requested fields — supports aliases and special fields.
 */
function formatRequestedFields(pg: PeopleGroupRecord, meta: Record<string, unknown>, fields: string[], lang: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const field of fields) {
    const special = resolveSpecialField(pg, field, meta, lang)
    if (special) {
      result[field] = special.value
      continue
    }

    // Resolve alias to internal key
    const internalKey = ALIAS_TO_INTERNAL[field] || field

    // If aliased, always format with label
    if (ALIAS_TO_INTERNAL[field]) {
      result[field] = formatValueLabelWithDescription(internalKey, getFieldValue(pg, internalKey), lang)
    } else {
      result[field] = formatField(pg, internalKey, lang)
    }
  }

  return result
}

// Default fields for /list endpoint
export const DEFAULT_LIST_FIELDS = [
  'name', 'slug', 'wagf_region', 'wagf_block', 'wagf_member',
  'country_code', 'rop1', 'religion', 'location_description', 'population',
  'has_photo', 'image_url', 'picture_credit', 'people_praying', 'people_committed', 'adopted_by_churches'
]

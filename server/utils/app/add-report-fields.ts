import { createError } from 'h3'
import { getSql } from '../../database/db'
import type { ImbPeopleGroup } from '../../database/imb-people-groups'
import { getField, addReportRequiredFieldKeys, addReportOptionalFieldKeys } from '~/utils/people-group-fields'
import { getFieldOptionLabel } from './field-options'

export interface PictureCreditSegment {
  text: string
  link: string | null
}

export type AddReportFieldKey =
  | (typeof addReportRequiredFieldKeys)[number]
  | (typeof addReportOptionalFieldKeys)[number]

export const addReportFieldKeys = [...addReportRequiredFieldKeys, ...addReportOptionalFieldKeys] as const

/**
 * What an editor supplies when applying an "add" report: the reviewer-facing
 * registry fields, plus the English description phrase and the photo credit,
 * which are not registry fields.
 */
export type AddReportFields = Partial<Record<AddReportFieldKey, string | null>> & {
  description_en?: string | null
  picture_credit?: PictureCreditSegment[] | null
}

const PLACEHOLDER_IMAGE_BASE = 'https://s3.doxa.life/no-photo-images/'

// Bucket file per WAGF region. Oceania only has a deaf image, so hearing
// Oceania groups use the Asia one; regions without a file do too.
const PLACEHOLDER_IMAGE_SLUGS: Record<string, string> = {
  africa: 'africa',
  asia: 'asia',
  europe: 'europe',
  middle_east: 'middle-east',
  'latin_america_&_caribbean': 'south-america',
  'north_america_&_non-spanish_caribbean': 'north-america'
}
const DEAF_PLACEHOLDER_IMAGE_SLUGS: Record<string, string> = { ...PLACEHOLDER_IMAGE_SLUGS, oceania: 'oceania' }

/** ROP1 affinity bloc of the Deaf people groups, which have their own placeholder set. */
const DEAF_AFFINITY_BLOC = 'A017'

/** The region placeholder picture for a group without a photo of its own. */
export function placeholderImageUrl(wagfRegion: string | null | undefined, rop1: string | null | undefined): string {
  const deaf = rop1 === DEAF_AFFINITY_BLOC
  const slugs = deaf ? DEAF_PLACEHOLDER_IMAGE_SLUGS : PLACEHOLDER_IMAGE_SLUGS
  const slug = slugs[wagfRegion ?? ''] ?? 'asia'
  return `${PLACEHOLDER_IMAGE_BASE}${deaf ? 'deaf-' : ''}${slug}.jpg`
}

export const JOSHUA_PROJECT_CREDIT: PictureCreditSegment[] = [
  { text: 'Photo courtesy of ', link: null },
  { text: 'Joshua Project', link: 'https://www.joshuaproject.net' }
]

/**
 * A select option key from either the key itself or its English label. IMB
 * exports carry labels for some columns ("Dispersed Church Planting") and
 * title-cased keys for others ("South-Eastern Asia"). Fields without static
 * options (countries) pass the value through.
 */
export function optionKeyForValue(fieldKey: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value).trim()
  if (!raw) return null
  const field = getField(fieldKey)
  if (!field?.options) return raw
  if (field.options.some((option) => option.value === raw)) return raw
  const asKey = raw.toLowerCase().replace(/\s+/g, '_')
  if (field.options.some((option) => option.value === asKey)) return asKey
  const lower = raw.toLowerCase()
  const byLabel = field.options.find(
    (option) => (getFieldOptionLabel(fieldKey, option.value, 'en') || '').toLowerCase() === lower
  )
  return byLabel?.value ?? null
}

export type CountryDerivedFields = Pick<
  AddReportFields,
  'region' | 'imb_subregion' | 'doxa_wagf_region' | 'doxa_wagf_block'
>

/**
 * Region and WAGF values shared by the other groups in a country (the most
 * common combination, the most complete one on a tie), or null when the
 * country has no group yet. WAGF membership is decided per group, so it is
 * never inferred from the country.
 */
export async function countryDerivedFields(countryCode: string | null | undefined): Promise<CountryDerivedFields | null> {
  if (!countryCode) return null
  const sql = getSql()
  const [row] = await sql<{
    region: string | null
    imb_subregion: string | null
    doxa_wagf_region: string | null
    doxa_wagf_block: string | null
  }[]>`
    SELECT
      region,
      metadata->>'imb_subregion' AS imb_subregion,
      metadata->>'doxa_wagf_region' AS doxa_wagf_region,
      metadata->>'doxa_wagf_block' AS doxa_wagf_block
    FROM people_groups
    WHERE country_code = ${countryCode} AND metadata->>'doxa_wagf_region' IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY
      COUNT(*) DESC,
      (region IS NOT NULL)::int
        + (metadata->>'imb_subregion' IS NOT NULL)::int
        + (metadata->>'doxa_wagf_block' IS NOT NULL)::int DESC
    LIMIT 1
  `
  if (!row) return null
  return {
    region: optionKeyForValue('region', row.region),
    imb_subregion: optionKeyForValue('imb_subregion', row.imb_subregion),
    doxa_wagf_region: optionKeyForValue('doxa_wagf_region', row.doxa_wagf_region),
    doxa_wagf_block: optionKeyForValue('doxa_wagf_block', row.doxa_wagf_block)
  }
}

/** IMB's photo-credit HTML as credit segments: plain runs and linked runs. */
export function pictureCreditFromHtml(html: string | null | undefined): PictureCreditSegment[] | null {
  if (!html) return null
  const text = html.replace(/<\/?div[^>]*>/gi, ' ')
  const segments: PictureCreditSegment[] = []
  const push = (raw: string, link: string | null) => {
    const value = raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
    if (value.trim()) segments.push({ text: link ? value.trim() : value, link })
  }
  const anchor = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let last = 0
  let match: RegExpExecArray | null
  while ((match = anchor.exec(text))) {
    push(text.slice(last, match.index), null)
    push(match[2]!, match[1] || null)
    last = match.index + match[0].length
  }
  push(text.slice(last), null)
  if (segments.length === 0) return null
  segments[0]!.text = segments[0]!.text.replace(/^\s+/, '')
  segments[segments.length - 1]!.text = segments[segments.length - 1]!.text.replace(/\s+$/, '')
  return segments
}

// IMB export column -> metadata key, copied verbatim.
const IMB_TEXT_COLUMNS: Record<string, string> = {
  PEID: 'imb_peid',
  PGID: 'imb_pgid',
  DisplayName: 'imb_display_name',
  Name: 'imb_people_name',
  LocationDescription: 'imb_location_description',
  ROP2Code: 'imb_reg_of_people_2',
  ROP3Code: 'imb_reg_of_people_3',
  ROP25Code: 'imb_reg_of_people_25',
  imbAffinityCode: 'imb_affinity_code',
  GSEC: 'imb_gsec',
  ROR3: 'imb_reg_of_religion_3',
  ROR4: 'imb_reg_of_religion_4',
  LanguageFamily: 'imb_language_family',
  LanguageSpeakers: 'imb_language_speakers',
  LostnessPriority: 'imb_lostness_priority_index',
  ResourceTotal: 'imb_total_resources_available',
  BibleYearPublished: 'imb_bible_year_published',
  PhotoCredit: 'imb_picture_credit_html'
}

// IMB "Available" / "Not Available" columns -> boolean metadata keys.
const IMB_AVAILABILITY_COLUMNS: Record<string, string> = {
  BibleAvailability: 'imb_bible_available',
  JesusFilmAvailability: 'imb_jesus_film_available',
  RadioProgramAvailability: 'imb_radio_broadcast_available',
  GospelResourceAvailability: 'imb_gospel_recordings_available',
  AudioResourceAvailability: 'imb_audio_scripture_available',
  BibleStoriesAvailability: 'imb_bible_stories_available'
}

export interface ImbMappedFields {
  fields: AddReportFields
  metadata: Record<string, any>
}

/** The reviewer-facing fields and the IMB detail metadata an IMB export row provides. */
export function fieldsFromImbRow(row: ImbPeopleGroup): ImbMappedFields {
  const raw: Record<string, unknown> = row.raw || {}
  const text = (column: string): string | null => {
    const value = raw[column]
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  const metadata: Record<string, any> = {}
  for (const [column, key] of Object.entries(IMB_TEXT_COLUMNS)) {
    const value = text(column)
    if (value !== null) metadata[key] = value
  }
  for (const [column, key] of Object.entries(IMB_AVAILABILITY_COLUMNS)) {
    const value = text(column)
    if (value === 'Available') metadata[key] = true
    else if (value === 'Not Available') metadata[key] = false
  }
  const congregations = text('CongregationsExist')
  if (congregations === 'Yes') metadata.imb_congregation_existing = '1'
  else if (congregations === 'No') metadata.imb_congregation_existing = '0'
  const churchPlanting = optionKeyForValue('imb_church_planting', text('ChurchPlantingWithinLast2Years'))
  if (churchPlanting) metadata.imb_church_planting = churchPlanting
  const evangelicalLevel = optionKeyForValue('imb_evangelical_level', text('EvangelicalLevel'))
  if (evangelicalLevel) metadata.imb_evangelical_level = evangelicalLevel
  if (text('Indigenous')) metadata.imb_is_indigenous = row.is_diaspora ? '0' : '1'

  const hasPhoto = text('HasPhoto') === 'Y'
  const fields: AddReportFields = {
    imb_reg_of_people_1: optionKeyForValue('imb_reg_of_people_1', text('ROP1Code')),
    primary_religion: optionKeyForValue('primary_religion', row.primary_religion),
    imb_alternate_name: text('AlternateNames'),
    region: optionKeyForValue('region', row.region),
    imb_subregion: optionKeyForValue('imb_subregion', row.subregion),
    description_en: text('Description'),
    picture_credit: hasPhoto ? pictureCreditFromHtml(text('PhotoCredit')) : null
  }
  return { fields, metadata }
}

/**
 * Validate and normalise an editor's add-report fields from a request body.
 * Throws a 400 naming the problem so the form can show it.
 */
export function parseAddReportFields(input: unknown): AddReportFields {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const fields: AddReportFields = {}

  for (const key of addReportFieldKeys) {
    const raw = body[key]
    if (raw === undefined || raw === null || raw === '') continue
    if (typeof raw !== 'string') {
      throw createError({ statusCode: 400, statusMessage: `${key} must be a string` })
    }
    const value = getField(key)?.options ? optionKeyForValue(key, raw) : raw.trim()
    if (!value) {
      throw createError({ statusCode: 400, statusMessage: `"${raw}" is not a valid ${key}` })
    }
    fields[key] = value
  }

  const missing = addReportRequiredFieldKeys.filter((key) => !fields[key])
  if (missing.length > 0) {
    throw createError({ statusCode: 400, statusMessage: `Missing required fields: ${missing.join(', ')}` })
  }

  if (typeof body.description_en === 'string' && body.description_en.trim()) {
    fields.description_en = body.description_en.trim()
  }
  if (Array.isArray(body.picture_credit)) {
    const segments: PictureCreditSegment[] = []
    for (const segment of body.picture_credit as unknown[]) {
      if (!segment || typeof segment !== 'object') continue
      const { text, link } = segment as { text?: unknown; link?: unknown }
      if (typeof text !== 'string' || !text.trim()) continue
      segments.push({ text, link: typeof link === 'string' && link.trim() ? link.trim() : null })
    }
    if (segments.length > 0) fields.picture_credit = segments
  }

  return fields
}

// Metadata keys accepted from auto-populate that are not registry fields.
const EXTRA_METADATA_KEYS = new Set(['imb_picture_credit_html'])

/**
 * The IMB detail metadata auto-populate proposed, limited to registry
 * metadata keys (not table columns, not the reviewer-facing fields).
 */
export function pickExtraMetadata(input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object') return {}
  const picked: Record<string, any> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === null || value === undefined || value === '') continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    if ((addReportFieldKeys as readonly string[]).includes(key)) continue
    const field = getField(key)
    if (field ? field.tableColumn : !EXTRA_METADATA_KEYS.has(key)) continue
    picked[key] = value
  }
  return picked
}

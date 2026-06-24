import { getSql } from '#server/database/db'
import { ENABLED_LANGUAGE_CODES } from '../../../../config/languages'
import { getReligionLabel, getCountryLabel, getFieldOptionLabel } from '../../../utils/app/field-options'

// Languages used by the Doxa Prayer Assets master spreadsheet, in its column order.
// Fixed and independent of the app's currently-enabled locales (it includes German).
const ASSET_LANGS = ['en', 'es', 'fr', 'pt', 'ru', 'de', 'ar'] as const

// Column order of the public prayer URLs in the asset format.
const URL_LANGS = ['en', 'es', 'fr', 'pt', 'ru', 'ar', 'de'] as const

// QR-code asset path columns, paired with their language suffix ('' for the language-neutral one).
const QR_LANGS = ['', 'en', 'ar', 'es', 'fr', 'pt', 'ru'] as const

const HEADERS = [
  'imb_peid',
  'PeopleGroup',
  'IMB - Display Name',
  'Description', 'Description-ES', 'Description-FR', 'Description-PT', 'Description-RU', 'Description-DE', 'Description-AR', 'Description-AR-NEW',
  'IMB - Picture URL',
  'PicAvailable',
  'Population',
  'Religion', 'Religion-ES', 'Religion-FR', 'Religion-PT', 'Religion-RU', 'Religion-DE', 'Religion-AR',
  'Area', 'Area-ES', 'Area-FR', 'Area-PT', 'Area-RU', 'Area-DE', 'Area-AR',
  'Country', 'Country-ES', 'Country-FR', 'Country-PT', 'Country-RU', 'Country-DE', 'Country-AR',
  '@Image',
  'NUMBER',
  '@QRUPG', '@QRUPGEN', '@QRUPGAR', '@QRUPGES', '@QRUPGFR', '@QRUPGPT', '@QRUPGRU',
  '@QRDOXA',
  'SLUG',
  'URL', 'URL-ES', 'URL-FR', 'URL-PT', 'URL-RU', 'URL-AR', 'URL-DE',
]

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

interface Row {
  id: number
  name: string
  slug: string | null
  country_code: string | null
  region: string | null
  population: number | null
  primary_religion: string | null
  image_url: string | null
  descriptions: Record<string, string> | null
  tags: string[] | null
  metadata: Record<string, unknown> | null
  content_count: string | number
  has_day_in_life: boolean
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const sql = getSql()
  const locales = ENABLED_LANGUAGE_CODES

  const base = (useRuntimeConfig().public.siteUrl || 'http://localhost:3000').replace(/\/+$/, '')

  const rows = await sql<Row[]>`
    SELECT
      pg.id,
      pg.name,
      pg.slug,
      pg.country_code,
      pg.region,
      pg.population,
      pg.primary_religion,
      pg.image_url,
      pg.descriptions,
      pg.tags,
      pg.metadata,
      COALESCE(lc.cnt, 0) AS content_count,
      (lib.id IS NOT NULL) AS has_day_in_life
    FROM people_groups pg
    LEFT JOIN libraries lib
      ON lib.people_group_id = pg.id AND lib.library_key = 'day_in_life'
    LEFT JOIN (
      SELECT library_id, COUNT(*) AS cnt
      FROM library_content
      WHERE language_code = 'en'
      GROUP BY library_id
    ) lc ON lc.library_id = lib.id
    WHERE COALESCE(pg.status, 'active') = 'active'
    ORDER BY pg.name
  `

  // Keep only groups with outstanding setup work — the same filter the onboarding tab applies.
  const pending = rows.filter((r) => {
    const promptsPending = !r.has_day_in_life || Number(r.content_count) < 365
    const descriptions = r.descriptions || {}
    const translationPending = locales.some(l => l !== 'en' && !(descriptions[l] && descriptions[l].trim()))
    const needsTags = (r.tags || []).some(t => t.startsWith('needs:'))
    return promptsPending || translationPending || needsTags
  })

  const dataRows = pending.map((r, i) => {
    const number = i + 1
    const slug = r.slug || ''
    const descriptions = r.descriptions || {}
    const meta = r.metadata || {}
    const hasPhoto = ['1', 'true', 'yes'].includes(String(meta.imb_has_photo ?? '').toLowerCase())

    const values: string[] = [
      String(meta.imb_peid ?? ''),
      r.name ?? '',
      String(meta.imb_display_name ?? ''),
      // Descriptions (en, es, fr, pt, ru, de, ar) + AR-NEW mirrors AR.
      ...ASSET_LANGS.map(l => descriptions[l] || ''),
      descriptions.ar || '',
      r.image_url || '',
      hasPhoto ? 'Yes' : 'No',
      r.population != null ? String(r.population) : '',
      // Religion in each asset language.
      ...ASSET_LANGS.map(l => (r.primary_religion ? getReligionLabel(r.primary_religion, l) || '' : '')),
      // Area = the region enum label in each asset language.
      ...ASSET_LANGS.map(l => (r.region ? getFieldOptionLabel('region', r.region, l) || '' : '')),
      // Country name in each asset language.
      ...ASSET_LANGS.map(l => (r.country_code ? getCountryLabel(r.country_code, l) || '' : '')),
      '', // @Image — assigned manually downstream
      String(number),
      // QR-code asset paths keyed off NUMBER.
      ...QR_LANGS.map(l => `qr/qr-code-${number}${l ? `-${l}` : ''}.png`),
      'images/Doxa-Life.png', // @QRDOXA
      slug,
      // Public prayer URLs; English has no locale prefix.
      ...URL_LANGS.map(l => (l === 'en' ? `${base}/${slug}` : `${base}/${l}/${slug}`)),
    ]

    return values.map(v => escapeCsvField(v)).join(',')
  })

  const csv = [HEADERS.join(','), ...dataRows].join('\r\n')

  // Match the master spreadsheet's encoding exactly: UTF-16 big-endian, no BOM.
  const body = Buffer.from(csv, 'utf16le').swap16()

  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-16be',
    'Content-Disposition': `attachment; filename="Doxa_Prayer_Assets_onboarding-${new Date().toISOString().slice(0, 10)}.csv"`,
  })

  return body
})

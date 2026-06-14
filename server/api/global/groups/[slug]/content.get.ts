/**
 * GET /api/global/groups/:slug/content?locale=en
 *
 * Returns a ready-to-render prayer bundle for one people group, for the
 * global.doxa.life card-stack flow:
 *   - demographics: the group's display + demographic fields
 *   - day_in_life:  one RANDOM day from the group's day_in_life library
 *   - pray_more:    a few RANDOM pieces drawn across the global shared libraries
 *
 * Randomness lives server-side so the client receives a finished stack. Content
 * is Tiptap JSON (content_json). Falls back to English when a locale row is
 * missing. Authenticated with the shared FORM_API_KEY.
 */
import { getSql } from '#server/database/db'
import { requireFormApiKey } from '#server/utils/form-api-key'
import { peopleGroupService } from '#server/database/people-groups'
import { libraryService } from '#server/database/libraries'
import { libraryContentService } from '#server/database/library-content'
import { appConfigService } from '#server/database/app-config'
import { formatPeopleGroup } from '#server/utils/app/people-group-formatter'

interface ValueLabel { value: string, label: string }

// How many shared-library "pray more" pieces to include per session.
const PRAY_MORE_COUNT = 2

// Resolve the positive (non-virtual) library ids that make up the global
// shared daily content, from the row-based app_config.
async function getGlobalLibraryIds(): Promise<number[]> {
  const config = await appConfigService.getConfig<{
    rows?: Array<{ libraries?: Array<{ libraryId: number }> }>
  }>('global_campaign_libraries')

  const ids = new Set<number>()
  for (const row of config?.rows ?? []) {
    for (const lib of row.libraries ?? []) {
      if (lib.libraryId > 0) ids.add(lib.libraryId)
    }
  }
  return Array.from(ids)
}

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'slug is required' })
  }

  const locale = (getQuery(event).locale as string) || 'en'

  const pg = await peopleGroupService.getPeopleGroupBySlug(slug)
  if (!pg) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const sql = getSql()

  // --- demographics ---
  // Reuse the same formatter the public pray.doxa.life detail page uses so the
  // value/label pairs (country name, religion, churches, status), the generated
  // description, and the photo credit match that page exactly.
  const formatted = formatPeopleGroup(pg as any, {
    fields: [
      'image_url', 'picture_credit', 'imb_people_description',
      'country_code', 'primary_language', 'religion',
      'engagement_status', 'imb_congregation_existing'
    ],
    lang: locale
  })

  const evangelical = pg.evangelical_pct != null ? Number(pg.evangelical_pct) : null
  const demographics = {
    id: pg.id,
    slug: pg.slug,
    name: pg.name,
    image_url: (formatted.image_url as string | null) ?? pg.image_url,
    picture_credit: (formatted.picture_credit as Array<{ text: string, link?: string }> | null) ?? null,
    description: (formatted.imb_people_description as string | null) || pg.descriptions?.[locale] || pg.descriptions?.en || null,
    population: pg.population,
    evangelical_pct: evangelical,
    far_from_jesus_pct: evangelical != null ? Math.max(0, Math.round((100 - evangelical) * 10) / 10) : null,
    country: (formatted.country_code as ValueLabel | null) ?? null,
    language: (formatted.primary_language as ValueLabel | null) ?? null,
    religion: (formatted.religion as ValueLabel | null) ?? null,
    status: (formatted.engagement_status as ValueLabel | null) ?? null,
    churches: (formatted.imb_congregation_existing as ValueLabel | null) ?? null,
    latitude: pg.latitude,
    longitude: pg.longitude
  }

  // --- day in the life: one random day from the group's day_in_life library ---
  let dayInLife: { content_json: any, day_number: number } | null = null
  const dilLibrary = await libraryService.getPeopleGroupLibraryByKey(pg.id, 'day_in_life')
  if (dilLibrary) {
    const range = await libraryContentService.getDayRange(dilLibrary.id)
    if (range) {
      const randomDay = range.minDay + Math.floor(Math.random() * (range.maxDay - range.minDay + 1))
      let content = await libraryContentService.getLibraryContentByDay(dilLibrary.id, randomDay, locale)
      if (!content && locale !== 'en') {
        content = await libraryContentService.getLibraryContentByDay(dilLibrary.id, randomDay, 'en')
      }
      if (content) {
        dayInLife = {
          day_number: content.day_number,
          content_json: typeof content.content_json === 'string'
            ? JSON.parse(content.content_json)
            : content.content_json
        }
      }
    }
  }

  // --- pray more: random pieces across the global shared libraries ---
  let prayMore: Array<{ content_json: any }> = []
  const globalLibIds = await getGlobalLibraryIds()
  if (globalLibIds.length > 0) {
    let rows = await sql`
      SELECT content_json FROM library_content
      WHERE library_id = ANY(${globalLibIds}) AND language_code = ${locale}
      ORDER BY random()
      LIMIT ${PRAY_MORE_COUNT}
    ` as Array<{ content_json: any }>
    if (rows.length === 0 && locale !== 'en') {
      rows = await sql`
        SELECT content_json FROM library_content
        WHERE library_id = ANY(${globalLibIds}) AND language_code = 'en'
        ORDER BY random()
        LIMIT ${PRAY_MORE_COUNT}
      ` as Array<{ content_json: any }>
    }
    prayMore = rows.map(r => ({
      content_json: typeof r.content_json === 'string' ? JSON.parse(r.content_json) : r.content_json
    }))
  }

  return {
    demographics,
    day_in_life: dayInLife,
    pray_more: prayMore
  }
})

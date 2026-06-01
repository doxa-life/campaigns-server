import { getSql } from '#server/database/db'
import { ENABLED_LANGUAGE_CODES } from '../../../../config/languages'

interface OnboardingRow {
  id: number
  name: string
  slug: string | null
  country_code: string | null
  status: string | null
  engagement_status: string | null
  created_at: string
  prompts_pending: boolean
  translation_pending_locales: string[]
  needs_tags: string[]
}

export default defineEventHandler(async (event): Promise<{ peopleGroups: OnboardingRow[] }> => {
  await requirePermission(event, 'people_groups.edit')

  const sql = getSql()
  const locales = ENABLED_LANGUAGE_CODES

  const rows = await sql<{
    id: number
    name: string
    slug: string | null
    country_code: string | null
    status: string | null
    engagement_status: string | null
    created_at: string
    descriptions: Record<string, string> | null
    tags: string[]
    content_count: string | number
    has_day_in_life: boolean
  }[]>`
    SELECT
      pg.id,
      pg.name,
      pg.slug,
      pg.country_code,
      pg.status,
      pg.engagement_status,
      pg.created_at,
      pg.descriptions,
      pg.tags,
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
  `

  const result: OnboardingRow[] = []
  for (const r of rows) {
    const promptsPending = !r.has_day_in_life || Number(r.content_count) < 365
    const descriptions = r.descriptions || {}
    const translationPendingLocales = locales.filter(
      l => l !== 'en' && !(descriptions[l] && descriptions[l].trim())
    )
    const needsTags = (r.tags || []).filter(t => t.startsWith('needs:'))

    if (!promptsPending && translationPendingLocales.length === 0 && needsTags.length === 0) {
      continue
    }

    result.push({
      id: r.id,
      name: r.name,
      slug: r.slug,
      country_code: r.country_code,
      status: r.status,
      engagement_status: r.engagement_status,
      created_at: r.created_at,
      prompts_pending: promptsPending,
      translation_pending_locales: translationPendingLocales,
      needs_tags: needsTags,
    })
  }

  result.sort((a, b) => {
    const aT = a.created_at ? new Date(a.created_at).getTime() : 0
    const bT = b.created_at ? new Date(b.created_at).getTime() : 0
    return bT - aT
  })

  return { peopleGroups: result }
})

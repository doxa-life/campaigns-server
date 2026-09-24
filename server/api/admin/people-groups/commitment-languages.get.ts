import { getSql } from '#server/database/db'

interface CommitmentLanguagesRow {
  id: number
  slug: string | null
  name: string
  people_committed: number
  // Active commitments per subscriber preferred language, e.g. { en: 12, es: 3 }.
  languages: Record<string, number>
}

export default defineEventHandler(async (event): Promise<{ people_groups: CommitmentLanguagesRow[] }> => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()

  const rows = await sql<{
    id: number
    slug: string | null
    name: string
    language: string
    committed: string | number
  }[]>`
    SELECT
      pg.id,
      pg.slug,
      pg.name,
      COALESCE(NULLIF(s.preferred_language, ''), 'en') AS language,
      COUNT(*) AS committed
    FROM campaign_subscriptions cs
    JOIN subscribers s ON s.id = cs.subscriber_id
    JOIN people_groups pg ON pg.id = cs.people_group_id
    WHERE cs.status = 'active'
      AND COALESCE(pg.status, 'active') != 'archived'
    GROUP BY pg.id, pg.slug, pg.name, language
  `

  const byGroup = new Map<number, CommitmentLanguagesRow>()
  for (const r of rows) {
    let group = byGroup.get(r.id)
    if (!group) {
      group = { id: r.id, slug: r.slug, name: r.name, people_committed: 0, languages: {} }
      byGroup.set(r.id, group)
    }
    const count = Number(r.committed)
    group.languages[r.language] = count
    group.people_committed += count
  }

  const peopleGroups = [...byGroup.values()].sort((a, b) =>
    b.people_committed - a.people_committed || (a.slug ?? '').localeCompare(b.slug ?? '')
  )

  return { people_groups: peopleGroups }
})

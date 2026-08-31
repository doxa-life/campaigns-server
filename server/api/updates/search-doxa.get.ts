import { peopleGroupService } from '../../database/people-groups'

/**
 * GET /api/updates/search-doxa?q=
 * Public search over Doxa people groups for the /updates form pickers.
 */
export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 2) return { results: [] }

  const groups = await peopleGroupService.getAllPeopleGroups({ search: q, limit: 20 })
  return {
    results: groups.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      country_code: g.country_code,
      status: g.status,
      engagement_status: g.engagement_status
    }))
  }
})

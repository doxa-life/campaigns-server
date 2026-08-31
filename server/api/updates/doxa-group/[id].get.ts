import { peopleGroupService } from '../../../database/people-groups'
import { publicSuggestibleFieldKeys, isTableColumn } from '~/utils/people-group-fields'

/**
 * GET /api/updates/doxa-group/[id]
 * Current values of the publicly suggestible fields, for the /updates
 * side-by-side comparison. Exposes only that subset. The path segment is
 * either a numeric people group id or a slug.
 */
export default defineEventHandler(async (event) => {
  const raw = String(getRouterParam(event, 'id') || '').trim()
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  const group = /^\d+$/.test(raw)
    ? await peopleGroupService.getPeopleGroupById(Number(raw))
    : await peopleGroupService.getPeopleGroupBySlug(raw)
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const metadata = group.metadata || {}
  const current_values: Record<string, any> = {}
  for (const key of publicSuggestibleFieldKeys) {
    current_values[key] = isTableColumn(key) ? (group as any)[key] ?? null : metadata[key] ?? null
  }

  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    status: group.status,
    engagement_status: group.engagement_status,
    image_url: group.image_url,
    current_values
  }
})

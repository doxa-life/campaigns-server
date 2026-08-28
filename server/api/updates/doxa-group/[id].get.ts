import { peopleGroupService } from '../../../database/people-groups'
import { publicSuggestibleFieldKeys, isTableColumn } from '~/utils/people-group-fields'
import { getIntParam } from '#server/utils/api-helpers'

/**
 * GET /api/updates/doxa-group/[id]
 * Current values of the publicly suggestible fields, for the /updates
 * side-by-side comparison. Exposes only that subset.
 */
export default defineEventHandler(async (event) => {
  const id = getIntParam(event, 'id')
  const group = await peopleGroupService.getPeopleGroupById(id)
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

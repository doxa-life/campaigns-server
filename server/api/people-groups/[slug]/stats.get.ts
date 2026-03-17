/**
 * GET /api/people-groups/:slug/stats
 * Returns live stats for a people group (no caching)
 */
import { peopleGroupService } from '#server/database/people-groups'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'

export default defineEventHandler(async (event) => {

  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Slug parameter is required'
    })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  const commitmentStats = await peopleGroupSubscriptionService.getCommitmentStats(peopleGroup.id)

  return {
    people_committed: commitmentStats.people_committed
  }
})

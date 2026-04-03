import { peopleGroupAccessService } from '#server/database/people-group-access'
import { peopleGroupService } from '#server/database/people-groups'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require admin authentication
  await requirePermission(event, 'users.manage')

  // Get and validate user ID from route params (UUID string)
  const userId = getUuidParam(event, 'id')

  try {
    // Get people group IDs the user has access to
    const peopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(userId)

    // Get all people groups
    const allPeopleGroups = await peopleGroupService.getAllPeopleGroups()

    // Return people groups with access flag
    const peopleGroupsWithAccess = allPeopleGroups.map(pg => ({
      ...pg,
      title: pg.name,
      hasAccess: peopleGroupIds.includes(pg.id)
    }))

    return {
      success: true,
      peopleGroups: peopleGroupsWithAccess
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch user people groups')
  }
})

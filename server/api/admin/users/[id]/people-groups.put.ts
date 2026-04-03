import { peopleGroupAccessService } from '#server/database/people-group-access'
import { userService } from '#server/database/users'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  // Get and validate user ID from route params (UUID string)
  const userId = getUuidParam(event, 'id')

  // Get request body
  const body = await readBody(event)

  // Validate people_group_ids is an array
  if (!Array.isArray(body.people_group_ids)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'people_group_ids must be an array'
    })
  }

  try {
    // Check if user exists
    const user = await userService.getUserById(userId)
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    await peopleGroupAccessService.removeUserFromAllPeopleGroups(userId)

    if (body.people_group_ids.length > 0) {
      await peopleGroupAccessService.assignUserToPeopleGroups(userId, body.people_group_ids)
    }

    return {
      success: true,
      message: `User assigned to ${body.people_group_ids.length} people group(s)`,
      people_group_ids: body.people_group_ids
    }
  } catch (error) {
    handleApiError(error, 'Failed to update user people groups')
  }
})

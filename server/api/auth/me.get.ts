import { userService } from '#server/database/users'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  try {
    // Get the authenticated user from the shared auth utility.
    const authUser = await getAuthUser(event)

    if (!authUser) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Not authenticated'
      })
    }

    // Fetch full user data from database
    // Note: JWT payload uses 'userId', not 'id'
    const userId = (authUser as any).userId || (authUser as any).id
    const fullUser = await userService.getUserById(userId)

    if (!fullUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Get user with roles including isAdmin and isSuperAdmin flags
    const userWithRoles = await getUserWithRoles(
      fullUser.id,
      fullUser.email,
      fullUser.display_name,
      fullUser.verified,
      fullUser.superadmin
    )

    return {
      user: userWithRoles
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch user')
  }
})

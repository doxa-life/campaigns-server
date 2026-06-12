import { userService } from '#server/database/users'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const requester = await requirePermission(event, 'users.manage')

  const userId = getUuidParam(event, 'id')

  if (requester.userId === userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'You cannot delete your own account'
    })
  }

  try {
    const user = await userService.getUserById(userId)
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    if (user.superadmin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Superadmin accounts cannot be deleted'
      })
    }

    try {
      await userService.deleteUser(userId)
    } catch (err: any) {
      if (err?.code === '23503') {
        throw createError({
          statusCode: 400,
          statusMessage: 'This user owns records that cannot be detached (e.g. marketing emails they created) and cannot be deleted'
        })
      }
      throw err
    }

    logDelete('users', userId, event, {
      deletedRecord: {
        email: user.email,
        display_name: user.display_name
      }
    })

    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete user')
  }
})

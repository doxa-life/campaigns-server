import { roleService, type RoleName } from '#server/database/roles'
import { userService } from '#server/database/users'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require admin authentication
  await requireAdmin(event)

  // Get and validate user ID from route params (UUID string)
  const userId = getUuidParam(event, 'id')

  // Get request body
  const body = await readBody(event)

  // Validate role is provided (can be null to remove role)
  if (body.role === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'role is required (use null to remove role)'
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

    const oldRole = user.role || null

    // If role is null, remove the user's role
    if (body.role === null) {
      await roleService.setUserRole(userId, null)

      if (oldRole !== null) {
        logUpdate('users', userId, event, { changes: { role: { from: oldRole, to: null } } })
      }

      return {
        success: true,
        message: 'User role removed'
      }
    }

    // Validate role name
    const roleConfig = roleService.getRoleByName(body.role)
    if (!roleConfig) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invalid role. Valid roles: admin, people_group_editor'
      })
    }

    // Set new role
    await roleService.setUserRole(userId, body.role as RoleName)

    if (oldRole !== body.role) {
      logUpdate('users', userId, event, { changes: { role: { from: oldRole, to: body.role } } })
    }

    return {
      success: true,
      role: body.role,
      message: `User role updated to ${body.role}`
    }
  } catch (error) {
    handleApiError(error, 'Failed to update user role')
  }
})

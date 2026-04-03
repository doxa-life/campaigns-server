import { roleService, type RoleName } from '#server/database/roles'
import { userService } from '#server/database/users'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const userId = getUuidParam(event, 'id')
  const body = await readBody(event)

  if (body.roles === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'roles is required (use empty array to remove all roles)'
    })
  }

  if (!Array.isArray(body.roles)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'roles must be an array'
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

    // Validate all role names
    const validRoleNames = Object.keys(roleService.getAllRoles().reduce((acc, r) => ({ ...acc, [r.name]: true }), {}))
    for (const roleName of body.roles) {
      if (!roleService.getRoleByName(roleName)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid role: ${roleName}. Valid roles: ${validRoleNames.join(', ')}`
        })
      }
    }

    const oldRoles = await roleService.getUserRoles(userId)
    await roleService.setUserRoles(userId, body.roles as RoleName[])

    const rolesChanged = JSON.stringify(oldRoles.sort()) !== JSON.stringify([...body.roles].sort())
    if (rolesChanged) {
      logUpdate('users', userId, event, { changes: { roles: { from: oldRoles, to: body.roles } } })
    }

    return {
      success: true,
      roles: body.roles,
      message: body.roles.length > 0
        ? `User roles updated to ${body.roles.join(', ')}`
        : 'User roles removed'
    }
  } catch (error) {
    handleApiError(error, 'Failed to update user roles')
  }
})

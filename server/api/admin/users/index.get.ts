import { userService } from '#server/database/users'
import { roleService, ROLES } from '#server/database/roles'
import { peopleGroupAccessService } from '#server/database/people-group-access'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  try {
    const users = await userService.getAllUsers()

    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const roles = await roleService.getUserRoles(user.id)
        const hasScopedAccess = await roleService.isPermissionScoped(user.id, 'people_groups.view')
        const peopleGroupCount = hasScopedAccess
          ? await peopleGroupAccessService.getUserPeopleGroupCount(user.id)
          : 0
        return {
          ...user,
          roles: roles.map(r => ({
            name: r,
            description: ROLES[r]?.description || ''
          })),
          hasScopedAccess,
          peopleGroupCount
        }
      })
    )

    return {
      users: usersWithRoles
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch users')
  }
})

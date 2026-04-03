import { userService } from '#server/database/users'
import { ROLES, type RoleName } from '#server/database/roles'
import { getSql } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'

function isPermissionScopedForRoles(roles: RoleName[], permissionName: string): boolean {
  let hasUnscoped = false
  let hasScoped = false
  const scopedVariant = permissionName + '_scoped'
  for (const roleName of roles) {
    const roleConfig = ROLES[roleName]
    if (!roleConfig) continue
    if (roleConfig.permissions.includes(permissionName)) hasUnscoped = true
    if (roleConfig.permissions.includes(scopedVariant)) hasScoped = true
  }
  return hasScoped && !hasUnscoped
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  try {
    const users = await userService.getAllUsers()

    // Find users with scoped access and batch-fetch their people group counts
    const scopedUserIds = users
      .filter(u => isPermissionScopedForRoles((u.roles || []) as RoleName[], 'people_groups.view'))
      .map(u => u.id)

    const pgCountMap = new Map<string, number>()
    if (scopedUserIds.length > 0) {
      const sql = getSql()
      const counts = await sql`
        SELECT user_id, COUNT(*) as count
        FROM campaign_users
        WHERE user_id IN ${sql(scopedUserIds)}
        GROUP BY user_id
      `
      for (const row of counts) {
        pgCountMap.set(row.user_id, Number(row.count))
      }
    }

    const usersWithRoles = users.map(user => {
      const roles = (user.roles || []) as RoleName[]
      const hasScopedAccess = isPermissionScopedForRoles(roles, 'people_groups.view')
      return {
        ...user,
        roles: roles.map(r => ({
          name: r,
          description: ROLES[r]?.description || ''
        })),
        hasScopedAccess,
        peopleGroupCount: hasScopedAccess ? (pgCountMap.get(user.id) || 0) : 0
      }
    })

    return {
      users: usersWithRoles
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch users')
  }
})

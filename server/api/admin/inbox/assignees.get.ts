import { userService } from '#server/database/users'
import { roleService } from '#server/database/roles'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Users a conversation can be assigned to: only those who can read the inbox.
 * Gated by `inbox.view` so inbox agents (who lack `users.manage`) can still
 * populate the assignee picker, without exposing the full users list.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')
  try {
    const roleNames = roleService.getRoleNamesWithPermission('inbox.view')
    const users = await userService.getUsersWithRoles(roleNames)
    return {
      users: users
        .map(u => ({
          id: u.id,
          display_name: u.display_name,
          email: u.email,
          email_alias: u.email_alias ?? null,
        }))
        .sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email)),
    }
  } catch (error) {
    handleApiError(error, 'Failed to load inbox assignees')
  }
})

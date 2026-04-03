import { roleService } from '#server/database/roles'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require admin authentication
  await requirePermission(event, 'users.manage')

  try {
    const roles = await roleService.getAllRoles()

    return {
      success: true,
      roles
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch roles')
  }
})

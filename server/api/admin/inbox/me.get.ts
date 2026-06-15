import { userService } from '#server/database/users'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * The current user's inbox sending identity (alias + display name + signature).
 * Lets the composer's From selector show the agent's personal address, and preview
 * the signature that gets appended on a personal send, without needing the full
 * users list (which requires users.manage).
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'inbox.view')
  try {
    const user = await userService.getUserById(auth.userId)
    return {
      id: auth.userId,
      display_name: user?.display_name ?? null,
      email_alias: user?.email_alias ?? null,
      email_signature: user?.email_signature ?? null,
    }
  } catch (error) {
    handleApiError(error, 'Failed to load inbox identity')
  }
})

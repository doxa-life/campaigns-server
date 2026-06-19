/**
 * Get the current user's activity email subscription preferences.
 */
import { getSql } from '#server/database/db'
import { resolveNotificationPreferences } from '#server/database/users'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const sql = getSql()

    const [row] = await sql`SELECT notification_preferences FROM users WHERE id = ${user.userId}`
    return resolveNotificationPreferences(row?.notification_preferences).stats
  } catch (error) {
    handleApiError(error, 'Failed to fetch activity email preferences')
  }
})

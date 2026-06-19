/**
 * Get the current user's activity email subscription preferences.
 */
import { getSql } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const sql = getSql()

    const [row] = await sql`SELECT notification_preferences FROM users WHERE id = ${user.userId}`
    const np = (typeof row?.notification_preferences === 'object' && row.notification_preferences) || null
    const prefs = (np && typeof np.stats === 'object' && np.stats)
      ? np.stats
      : { daily: true, weekly: true, monthly: true, yearly: true }

    return prefs
  } catch (error) {
    handleApiError(error, 'Failed to fetch activity email preferences')
  }
})

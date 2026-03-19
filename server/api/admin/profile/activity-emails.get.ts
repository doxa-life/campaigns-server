/**
 * Get the current user's activity email subscription preferences.
 */
import { getSql } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const sql = getSql()

    const [row] = await sql`SELECT activity_email_preferences FROM users WHERE id = ${user.userId}`
    const prefs = (typeof row?.activity_email_preferences === 'object' && row.activity_email_preferences)
      ? row.activity_email_preferences
      : { daily: true, weekly: true, monthly: true, yearly: true }

    return prefs
  } catch (error) {
    handleApiError(error, 'Failed to fetch activity email preferences')
  }
})

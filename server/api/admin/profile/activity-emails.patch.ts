/**
 * Update the current user's activity email subscription preferences (daily/weekly/monthly/yearly).
 * Used by the admin profile page to opt in/out of scheduled activity summary emails.
 */
import { getDatabase } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const body = await readBody(event)

    const preferences: Record<string, boolean> = {}
    for (const key of ['daily', 'weekly', 'monthly', 'yearly']) {
      if (typeof body[key] === 'boolean') {
        preferences[key] = body[key]
      }
    }

    if (Object.keys(preferences).length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'At least one preference must be provided'
      })
    }

    const db = getDatabase()
    const rawSql = db.rawSql

    // Read current prefs
    const [current] = await rawSql`SELECT activity_email_preferences FROM users WHERE id = ${user.userId}`
    const currentPrefs = (typeof current?.activity_email_preferences === 'object' && current.activity_email_preferences)
      ? current.activity_email_preferences
      : { daily: true, weekly: true, monthly: true, yearly: true }
    const merged = { ...currentPrefs, ...preferences }

    await rawSql`
      UPDATE users
      SET activity_email_preferences = ${rawSql.json(merged)},
          updated = NOW()
      WHERE id = ${user.userId}
    `

    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to update activity email preferences')
  }
})

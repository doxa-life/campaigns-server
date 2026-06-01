/**
 * Update the current user's activity email subscription preferences (daily/weekly/monthly/yearly).
 * Used by the admin profile page to opt in/out of scheduled activity summary emails.
 */
import { getSql } from '#server/database/db'
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

    const sql = getSql()

    // Read current prefs
    const [current] = await sql`SELECT activity_email_preferences FROM users WHERE id = ${user.userId}`
    const currentPrefs = (typeof current?.activity_email_preferences === 'object' && current.activity_email_preferences)
      ? current.activity_email_preferences
      : { daily: true, weekly: true, monthly: true, yearly: true }
    const merged = { ...currentPrefs, ...preferences }

    await sql`
      UPDATE users
      SET activity_email_preferences = ${sql.json(merged)},
          updated = NOW()
      WHERE id = ${user.userId}
    `

    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to update activity email preferences')
  }
})

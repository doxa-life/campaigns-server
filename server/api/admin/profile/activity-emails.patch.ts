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

    // Read current prefs and merge the partial stats update into notification_preferences.stats.
    const [current] = await sql`SELECT notification_preferences FROM users WHERE id = ${user.userId}`
    const np = (typeof current?.notification_preferences === 'object' && current.notification_preferences)
      ? current.notification_preferences
      : { stats: { daily: true, weekly: true, monthly: true, yearly: true }, adoption: false, contact_us: false }
    const currentStats = (typeof np.stats === 'object' && np.stats)
      ? np.stats
      : { daily: true, weekly: true, monthly: true, yearly: true }
    const merged = { ...np, stats: { ...currentStats, ...preferences } }

    await sql`
      UPDATE users
      SET notification_preferences = ${sql.json(merged)},
          updated = NOW()
      WHERE id = ${user.userId}
    `

    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to update activity email preferences')
  }
})

import { userService, DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '#server/database/users'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

type StatsKey = 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * Set a user's notification preferences from the user-management record: which stats-summary
 * frequencies they receive (only effective for stats-eligible roles), plus adoption and
 * contact-us opt-ins. Accepts a partial body and merges it with the user's current settings.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const userId = getUuidParam(event, 'id')
  const body = await readBody<{
    stats?: Partial<Record<StatsKey, boolean>>
    adoption?: boolean
    contact_us?: boolean
  }>(event)

  const target = await userService.getUserById(userId)
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const current = target.notification_preferences ?? DEFAULT_NOTIFICATION_PREFERENCES
  const currentStats = current.stats ?? DEFAULT_NOTIFICATION_PREFERENCES.stats

  const merged: NotificationPreferences = {
    stats: {
      daily: typeof body.stats?.daily === 'boolean' ? body.stats.daily : currentStats.daily,
      weekly: typeof body.stats?.weekly === 'boolean' ? body.stats.weekly : currentStats.weekly,
      monthly: typeof body.stats?.monthly === 'boolean' ? body.stats.monthly : currentStats.monthly,
      yearly: typeof body.stats?.yearly === 'boolean' ? body.stats.yearly : currentStats.yearly,
    },
    adoption: typeof body.adoption === 'boolean' ? body.adoption : current.adoption,
    contact_us: typeof body.contact_us === 'boolean' ? body.contact_us : current.contact_us,
  }

  try {
    const updated = await userService.updateNotificationPreferences(userId, merged)
    logUpdate('users', userId, event, {
      changes: { notification_preferences: { from: target.notification_preferences, to: merged } }
    })
    return { user: updated }
  } catch (error) {
    handleApiError(error, 'Failed to update notification preferences')
  }
})

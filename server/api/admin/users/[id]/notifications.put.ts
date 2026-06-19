import { userService, resolveNotificationPreferences, type NotificationPreferences } from '#server/database/users'
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

  const current = resolveNotificationPreferences(target.notification_preferences)
  const currentStats = current.stats

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

  // Audit only the settings that actually changed, with readable labels and On/Off values
  // (a single notification_preferences blob renders as raw JSON in the activity feed).
  const onOff = (b: boolean) => (b ? 'On' : 'Off')
  const statsLabels: Record<StatsKey, string> = {
    daily: 'Daily stats summary',
    weekly: 'Weekly stats summary',
    monthly: 'Monthly stats summary',
    yearly: 'Yearly stats summary',
  }
  const changes: Record<string, { from: string; to: string }> = {}
  for (const k of ['daily', 'weekly', 'monthly', 'yearly'] as StatsKey[]) {
    if (currentStats[k] !== merged.stats[k]) {
      changes[statsLabels[k]] = { from: onOff(currentStats[k]), to: onOff(merged.stats[k]) }
    }
  }
  if (current.adoption !== merged.adoption) {
    changes['Adoption notifications'] = { from: onOff(current.adoption), to: onOff(merged.adoption) }
  }
  if (current.contact_us !== merged.contact_us) {
    changes['Contact-us notifications'] = { from: onOff(current.contact_us), to: onOff(merged.contact_us) }
  }

  try {
    const updated = await userService.updateNotificationPreferences(userId, merged)
    if (Object.keys(changes).length > 0) {
      logUpdate('users', userId, event, { changes })
    }
    return { user: updated }
  } catch (error) {
    handleApiError(error, 'Failed to update notification preferences')
  }
})

/**
 * POST /api/admin/subscriptions/reactivate
 * Put inactive email prayer times back on daily reminders. With subscription_ids,
 * only those; without, every one listed by GET /api/admin/subscriptions/inactive.
 * Ids that aren't eligible (unsubscribed, no consent, already active) are skipped.
 */
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'

export default defineEventHandler(async (event) => {
  await requireUnscopedPermission(event, 'subscribers.edit')

  const body = await readBody(event) || {}
  const { subscription_ids: subscriptionIds } = body

  if (subscriptionIds !== undefined) {
    if (!Array.isArray(subscriptionIds) || !subscriptionIds.every(id => Number.isInteger(id))) {
      throw createError({ statusCode: 400, statusMessage: 'subscription_ids must be an array of integers' })
    }
    if (subscriptionIds.length === 0) {
      return { reactivated_count: 0, subscriber_count: 0, subscription_ids: [] }
    }
  }

  const reactivated = await peopleGroupSubscriptionService.reactivateInactiveSubscriptions(subscriptionIds)

  for (const row of reactivated) {
    logUpdate('campaign_subscriptions', String(row.id), event, {
      changes: { status: { from: 'inactive', to: 'active' } }
    })
    logCreate('subscribers', String(row.subscriber_id), event, {
      source: 'admin',
      badge: 'Reactivated',
      message: 'Reactivated by an admin for',
      link_text: row.people_group_name,
      link_url: `/admin/people-groups/${row.people_group_id}`
    })
  }

  return {
    reactivated_count: reactivated.length,
    subscriber_count: new Set(reactivated.map(r => r.subscriber_id)).size,
    subscription_ids: reactivated.map(r => r.id)
  }
})

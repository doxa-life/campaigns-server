/**
 * GET /api/admin/subscriptions/inactive
 * Email prayer times the system (or an admin) set to 'inactive' whose subscriber
 * still holds Doxa general consent — the same people as the doxa_inactive_pg
 * marketing audience. Deliberate 'unsubscribed' opt-outs never appear.
 */
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'

export default defineEventHandler(async (event) => {
  await requireUnscopedPermission(event, 'subscribers.edit')

  const subscriptions = await peopleGroupSubscriptionService.getReactivatableInactiveSubscriptions()

  return {
    subscriptions,
    subscriber_count: new Set(subscriptions.map(s => s.subscriber_id)).size
  }
})

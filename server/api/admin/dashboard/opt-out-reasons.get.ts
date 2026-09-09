/**
 * GET /api/admin/dashboard/opt-out-reasons
 * Why subscribers muted or stopped prayer times, counted as distinct people so
 * someone who stops five reminders at once counts once.
 *
 * Two ranges: the last 30 days, and everything since the feature shipped. Prayer
 * times stopped before then carry no reason and are absent from both, so neither
 * total is a count of all stops ever.
 */
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const [last30Days, sinceLaunch] = await Promise.all([
    peopleGroupSubscriptionService.getOptOutReasonBreakdown(30),
    peopleGroupSubscriptionService.getOptOutReasonBreakdown(null)
  ])

  return {
    last_30_days: last30Days,
    since_launch: sinceLaunch
  }
})

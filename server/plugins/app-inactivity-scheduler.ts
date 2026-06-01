import { Cron } from 'croner'
import { peopleGroupSubscriptionService } from '../database/people-group-subscriptions'

const INACTIVITY_THRESHOLD_DAYS = 30

async function claimAppInactivityLock(dateKey: string): Promise<boolean> {
  const lockKey = `app-inactivity-scheduler:${dateKey}`
  const [row] = await sql`
    INSERT INTO activity_logs (id, timestamp, event_type, metadata)
    VALUES (
      md5(${lockKey})::uuid,
      ${Date.now()},
      'APP_INACTIVITY_SCHEDULER_LOCK',
      ${{ date: dateKey, thresholdDays: INACTIVITY_THRESHOLD_DAYS }}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  return !!row
}

async function logSubscriptionActivity(
  row: { subscriber_id: number; people_group_id: number; people_group_name: string },
  message: string
): Promise<void> {
  const metadata: Record<string, unknown> = {
    source: 'system',
    message,
    link_text: row.people_group_name,
    link_url: `/admin/people-groups/${row.people_group_id}`
  }
  await sql`
    INSERT INTO activity_logs (timestamp, event_type, table_name, record_id, user_id, metadata)
    VALUES (
      ${Date.now()},
      'CREATE',
      'subscribers',
      ${String(row.subscriber_id)},
      NULL,
      ${metadata}
    )
  `
}

export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  console.log(`📱 Scheduling app inactivity sweep (daily at 3 AM UTC, threshold ${INACTIVITY_THRESHOLD_DAYS} days)`)

  const task = new Cron('0 3 * * *', { timezone: 'UTC' }, async () => {
    const dateKey = new Date().toISOString().split('T')[0]!
    if (!await claimAppInactivityLock(dateKey)) return

    try {
      const markedInactive = await peopleGroupSubscriptionService.markInactiveAppSubscriptions(
        INACTIVITY_THRESHOLD_DAYS
      )
      const reactivated = await peopleGroupSubscriptionService.reactivateAppSubscriptionsWithRecentActivity(
        INACTIVITY_THRESHOLD_DAYS
      )

      for (const row of markedInactive) {
        try {
          await logSubscriptionActivity(
            row,
            `Marked inactive — no prayer activity for ${INACTIVITY_THRESHOLD_DAYS} days (mobile app)`
          )
        } catch (error: any) {
          console.error(`  ❌ Failed to log app-inactivity mark-inactive for subscription ${row.id}:`, error.message)
        }
      }

      for (const row of reactivated) {
        try {
          await logSubscriptionActivity(row, 'Reactivated — prayer activity resumed (mobile app)')
        } catch (error: any) {
          console.error(`  ❌ Failed to log app-inactivity reactivation for subscription ${row.id}:`, error.message)
        }
      }

      if (markedInactive.length > 0 || reactivated.length > 0) {
        console.log(`📱 App inactivity sweep complete: ${markedInactive.length} marked inactive, ${reactivated.length} reactivated`)
      }
    } catch (error: any) {
      console.error('❌ App inactivity sweep error:', error.message)
    }
  })

  console.log('✅ App inactivity scheduler initialized')

  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping app inactivity scheduler...')
    task.stop()
  })
})

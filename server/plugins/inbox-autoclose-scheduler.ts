import { Cron } from 'croner'
import { conversationService } from '../database/conversations'

const AUTO_CLOSE_QUIET_DAYS = 14

async function claimInboxAutocloseLock(dateKey: string): Promise<boolean> {
  const lockKey = `inbox-autoclose-scheduler:${dateKey}`
  const [row] = await sql`
    INSERT INTO activity_logs (id, timestamp, event_type, metadata)
    VALUES (
      md5(${lockKey})::uuid,
      ${Date.now()},
      'INBOX_AUTOCLOSE_SCHEDULER_LOCK',
      ${{ date: dateKey, quietDays: AUTO_CLOSE_QUIET_DAYS }}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  return !!row
}

export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  console.log(`📪 Scheduling inbox auto-close sweep (daily at 4 AM UTC, quiet threshold ${AUTO_CLOSE_QUIET_DAYS} days)`)

  const task = new Cron('0 4 * * *', { timezone: 'UTC' }, async () => {
    const dateKey = new Date().toISOString().split('T')[0]!
    if (!await claimInboxAutocloseLock(dateKey)) return

    try {
      const closed = await conversationService.autoCloseStalePending(AUTO_CLOSE_QUIET_DAYS)

      for (const conversation of closed) {
        logUpdate('conversations', String(conversation.id), undefined, {
          source: 'system',
          message: `Status → closed (auto: no reply for ${AUTO_CLOSE_QUIET_DAYS} days)`,
          status: 'closed',
        })
      }

      if (closed.length > 0) {
        console.log(`📪 Inbox auto-close sweep complete: ${closed.length} pending conversation(s) closed`)
      }
    } catch (error: any) {
      console.error('❌ Inbox auto-close sweep error:', error.message)
    }
  })

  console.log('✅ Inbox auto-close scheduler initialized')

  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping inbox auto-close scheduler...')
    task.stop()
  })
})

import { Cron } from 'croner'
import { syncGroundingDocuments } from '../utils/inbox/grounding-sync'

// Singleton lock (per CLAUDE.md): only the instance whose INSERT wins runs the sync.
async function claimSyncLock(dateKey: string): Promise<boolean> {
  const lockKey = `inbox-grounding-sync:${dateKey}`
  const [row] = await sql`
    INSERT INTO activity_logs (id, timestamp, event_type, metadata)
    VALUES (
      md5(${lockKey})::uuid,
      ${Date.now()},
      'INBOX_GROUNDING_SYNC_LOCK',
      ${{ date: dateKey }}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  return !!row
}

async function runSync() {
  const dateKey = new Date().toISOString().split('T')[0]!
  if (!await claimSyncLock(dateKey)) return
  try {
    const result = await syncGroundingDocuments()
    console.log(`✅ Inbox grounding sync: ${result.synced.length} synced, ${result.failed.length} failed, ${result.pruned} pruned`)
    if (result.failed.length) {
      console.warn('   failed pages:', result.failed.map(f => `${f.slug} (${f.error})`).join(', '))
    }
  } catch (error: any) {
    console.error('❌ Inbox grounding sync error:', error?.message)
  }
}

/**
 * Refreshes the cached doxa.life grounding content daily (3 AM UTC), plus once
 * shortly after boot. Both paths share the per-day claim lock, so across multiple
 * instances only one sync runs per day.
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  const task = new Cron('0 3 * * *', { timezone: 'UTC' }, runSync)
  const initial = setTimeout(() => { void runSync() }, 30_000)

  console.log('📅 Inbox grounding scheduler initialized (daily 3 AM UTC)')

  nitroApp.hooks.hook('close', () => {
    task.stop()
    clearTimeout(initial)
  })
})

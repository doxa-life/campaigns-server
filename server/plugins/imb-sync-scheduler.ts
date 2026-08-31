import { Cron } from 'croner'
import { syncImbPeopleGroups } from '../utils/app/imb-sync'

function isoWeekKey(date: Date): string {
  // ISO week number: Thursday of the current week determines the year.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

async function claimImbSyncLock(weekKey: string): Promise<boolean> {
  const lockKey = `imb-sync:${weekKey}`
  const [row] = await sql`
    INSERT INTO activity_logs (id, timestamp, event_type, metadata)
    VALUES (
      md5(${lockKey})::uuid,
      ${Date.now()},
      'IMB_SYNC_LOCK',
      ${{ week: weekKey }}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  return !!row
}

/**
 * Nitro plugin refreshing the imb_people_groups mirror from the peoplegroups.org
 * CSV weekly (Mondays 3 AM UTC). Powers the /updates add-flow search.
 */
export default defineNitroPlugin(() => {
  if (process.env.VITEST) return

  const enabled = process.env.ENABLE_IMB_SYNC === 'true'
  const isProduction = process.env.NODE_ENV === 'production'
  if (!enabled && !isProduction) {
    console.log('⏸️  IMB mirror sync disabled in development mode (set ENABLE_IMB_SYNC=true to enable)')
    return
  }

  console.log('📅 Scheduling weekly IMB mirror sync (Mondays 3 AM UTC)')

  new Cron('0 3 * * 1', { timezone: 'UTC' }, async () => {
    const weekKey = isoWeekKey(new Date())
    if (!await claimImbSyncLock(weekKey)) return

    console.log('🔄 Starting IMB mirror sync...')
    try {
      const result = await syncImbPeopleGroups()
      console.log(`✅ IMB mirror sync complete: ${result.total} rows (${result.removed} removed)`)
    } catch (error) {
      console.error('❌ IMB mirror sync failed:', error)
    }
  })
})

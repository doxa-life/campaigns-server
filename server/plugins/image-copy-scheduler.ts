import { Cron } from 'croner'
import { hasPendingImageCopies, makePeopleGroupImageCopies } from '../utils/app/people-group-image-copies'

const BATCH_SIZE = 50
const MAX_BATCHES_PER_RUN = 60 // ~3,000 groups, more than the whole table
const STARTUP_DELAY_MS = 2 * 60 * 1000

async function claimImageCopyLock(dayKey: string): Promise<boolean> {
  const lockKey = `image-copy-scheduler:${dayKey}`
  const [row] = await sql`
    INSERT INTO activity_logs (id, timestamp, event_type, metadata)
    VALUES (
      md5(${lockKey})::uuid,
      ${Date.now()},
      'IMAGE_COPY_LOCK',
      ${{ day: dayKey }}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  return !!row
}

/** Copy every pending group in one pass, a batch at a time. */
async function runImageCopies() {
  try {
    if (!await hasPendingImageCopies()) return
    if (!await claimImageCopyLock(new Date().toISOString().slice(0, 10))) return

    let copied = 0
    let failed = 0
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const batch = await makePeopleGroupImageCopies(BATCH_SIZE)
      copied += batch.copied
      failed += batch.failed
      if (batch.copied + batch.failed === 0) break
    }
    console.log(`🖼️  Compressed image copies: ${copied} made, ${failed} failed`)
  } catch (error) {
    console.error('❌ Image copy scheduler error:', error)
  }
}

/**
 * Nitro plugin keeping compressed copies of people group photos (served to
 * the mobile app as compressed_image_url). Runs once shortly after startup, so
 * a deploy starts the backfill, and daily at 4:30 AM UTC (after the Monday IMB
 * sync) for groups added or edited since. One run per day across instances.
 * Set ENABLE_IMAGE_COPIES=false to turn it off.
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  const flag = process.env.ENABLE_IMAGE_COPIES
  const isProduction = process.env.NODE_ENV === 'production'
  if (flag === 'false' || (flag !== 'true' && !isProduction)) {
    console.log('⏸️  Compressed image copies disabled (set ENABLE_IMAGE_COPIES=true to enable outside production)')
    return
  }
  if (!process.env.S3_PUBLIC_BUCKET || !process.env.S3_PUBLIC_BASE_URL) {
    console.log('⏸️  Compressed image copies disabled: S3_PUBLIC_BUCKET / S3_PUBLIC_BASE_URL not configured')
    return
  }

  const startup = setTimeout(runImageCopies, STARTUP_DELAY_MS)
  const task = new Cron('30 4 * * *', { timezone: 'UTC', protect: true }, runImageCopies)

  nitroApp.hooks.hook('close', () => {
    clearTimeout(startup)
    task.stop()
  })
})

import { churchService } from '../../database/churches'
import { getSql } from '../../database/db'
import { geocodeTown } from './nominatim'

// Spacing between lookups; Nominatim's usage policy caps clients at one request per second.
const MIN_INTERVAL_MS = 1100
// A drain stops after this many lookups or this much time and leaves the rest to the next tick.
const MAX_PER_DRAIN = 50
const MAX_DRAIN_MS = 55_000
const LOCK_KEY = 'church-geocode'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function userAgent(): string {
  const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `DoxaPrayer/1.0 (+${siteUrl})`
}

/**
 * Geocodes churches marked pending, one lookup at a time. Only one drain runs
 * across all app instances: the advisory lock lives for this transaction, so
 * a concurrent caller returns immediately instead of doubling the request rate.
 * Returns the number of churches resolved (found or not found) in this drain.
 */
export async function drainChurchGeocodeQueue(): Promise<number> {
  const sql = getSql()
  return await sql.begin(async (tx) => {
    const [lock] = await tx`SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS locked`
    if (!lock?.locked) return 0

    const started = Date.now()
    let processed = 0
    const baseUrl = process.env.NOMINATIM_URL || undefined
    const agent = userAgent()

    while (processed < MAX_PER_DRAIN && Date.now() - started < MAX_DRAIN_MS) {
      const church = await churchService.nextPendingGeocode()
      if (!church) break

      if (!church.town || !church.country) {
        await churchService.recordGeocodeResult(church.id, null)
        processed++
        continue
      }

      const requestedAt = Date.now()
      const outcome = await geocodeTown(church.town, church.country, { baseUrl, userAgent: agent })

      if (outcome.status === 'unavailable') {
        // Leave the row pending and stop this drain; the next tick retries.
        console.warn(`⚠️  Church geocoding paused (${outcome.reason})`)
        await churchService.recordGeocodeFailure(church.id)
        break
      }

      await churchService.recordGeocodeResult(church.id, outcome.status === 'found' ? outcome.point : null)
      processed++

      const elapsed = Date.now() - requestedAt
      if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed)
    }

    return processed
  })
}

/**
 * Starts a drain without waiting for it, so a church saved from the admin
 * locates within seconds instead of at the next scheduler tick. Skipped under
 * test so the suite never calls Nominatim.
 */
export function kickChurchGeocoding(): void {
  if (process.env.VITEST) return
  drainChurchGeocodeQueue().catch((error) => {
    console.error('❌ Church geocoding failed:', error)
  })
}

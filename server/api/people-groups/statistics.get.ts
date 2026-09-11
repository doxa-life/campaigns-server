/**
 * GET /api/people-groups/statistics
 * Get aggregate prayer/adoption statistics
 */
import { getSql } from '../../database/db'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { setCacheHeaders } from '../../utils/app/cors'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const sql = getSql()

  const [result, adoptedResult, prayingNowResult, commitmentStats] = await Promise.all([
    sql`
      SELECT
        COUNT(*) as total_active,
        COUNT(*) FILTER (WHERE pg.people_praying > 0) as total_with_prayer,
        COUNT(*) FILTER (WHERE pg.engagement_status = 'engaged') as total_engaged,
        COUNT(*) FILTER (WHERE pg.engagement_status IS DISTINCT FROM 'engaged') as total_unengaged,
        COALESCE(SUM(pg.population), 0) as total_population,
        COALESCE(SUM(pg.population) FILTER (WHERE pg.engagement_status IS DISTINCT FROM 'engaged'), 0) as unengaged_population
      FROM people_groups pg
      WHERE pg.status != 'archived'
    `.then(rows => rows[0] as { total_active: string | number; total_with_prayer: string | number; total_engaged: string | number; total_unengaged: string | number; total_population: string | number; unengaged_population: string | number }),
    sql`
      SELECT COUNT(DISTINCT a.people_group_id) as count
      FROM people_group_adoptions a
      JOIN people_groups pg ON pg.id = a.people_group_id
      WHERE a.status = 'active' AND pg.status != 'archived'
    `.then(rows => rows[0] as { count: string | number }),
    // "Praying right now". Every prayer session upserts its row on each ping
    // (immediately on open, then 30s/60s and every 60s to 15 min), and the
    // upsert rewrites `timestamp` — so `timestamp` is the session's LAST-SEEN
    // time, and a recent one means someone is still on the page.
    //
    // `NOW() AT TIME ZONE 'UTC'` is deliberate, not decoration: `timestamp` is
    // TIMESTAMP *without* time zone holding UTC (migration 012). Comparing it
    // against bare NOW() converts using the DB session's TimeZone, which over a
    // 5-minute window would make this permanently 0 or permanently everything.
    //
    // COALESCE to session_id so one person's two tabs count once, while
    // sessions with no tracking_id (SSR, iframes, blocked storage) still count.
    sql`
      SELECT COUNT(DISTINCT COALESCE(tracking_id, session_id)) as praying_now
      FROM prayer_activity
      WHERE timestamp > (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 minutes'
    `.then(rows => rows[0] as { praying_now: string | number }),
    peopleGroupSubscriptionService.getGlobalCommitmentStats()
  ])

  return {
    total: Number(result.total_active),
    total_with_prayer: Number(result.total_with_prayer),
    total_engaged: Number(result.total_engaged),
    total_unengaged: Number(result.total_unengaged),
    total_population: Number(result.total_population),
    unengaged_population: Number(result.unengaged_population),
    total_with_100_committed: commitmentStats.people_groups_with_100_committed,
    total_with_prayer_committed: commitmentStats.people_groups_with_commitment,
    total_adopted: Number(adoptedResult.count),
    people_committed: commitmentStats.people_committed,
    committed_duration: commitmentStats.committed_duration,
    praying_now: Number(prayingNowResult.praying_now)
  }
})

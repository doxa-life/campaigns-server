/**
 * GET /api/admin/dashboard/prayer-locations?window=24h|7d|30d|all
 *
 * How many people prayed from each country, for the dashboard map. The
 * country is the pray-er's, captured from Cloudflare on the prayer session.
 * People are counted the same way the "Unique People Praying" chart does:
 * by tracking_id, falling back to the row.
 */
import { getSql } from '#server/database/db'
import countries from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(countriesEn)

const WINDOWS: Record<string, string | null> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  all: null
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const query = getQuery(event)
  const window = typeof query.window === 'string' && query.window in WINDOWS ? query.window : '7d'
  const interval = WINDOWS[window]

  const sql = getSql()
  const inWindow = interval
    ? sql`pa.timestamp >= (NOW() AT TIME ZONE 'UTC') - ${interval}::interval`
    : sql`TRUE`

  const [rows, [totals]] = await Promise.all([
    sql`
      SELECT
        pa.country,
        COUNT(DISTINCT COALESCE(pa.tracking_id, pa.id::text))::int AS count
      FROM prayer_activity pa
      WHERE pa.country IS NOT NULL AND ${inWindow}
      GROUP BY pa.country
      ORDER BY count DESC, pa.country ASC
    `,
    sql`
      SELECT
        COUNT(DISTINCT COALESCE(pa.tracking_id, pa.id::text))::int AS total,
        COUNT(DISTINCT COALESCE(pa.tracking_id, pa.id::text)) FILTER (WHERE pa.country IS NOT NULL)::int AS located
      FROM prayer_activity pa
      WHERE ${inWindow}
    `
  ])

  return {
    window,
    countries: rows.map(r => ({
      country: r.country as string,
      name: countries.getName(r.country, 'en') ?? (r.country as string),
      count: r.count as number
    })),
    located: totals?.located ?? 0,
    total: totals?.total ?? 0
  }
})

/**
 * GET /api/admin/dashboard/prayer-locations?window=24h|7d|30d|all
 *
 * Where people prayed from, for the dashboard map. One point per stored
 * location cell (coordinates are already rounded to ~11 km at write time)
 * plus city and country, counting distinct people the same way the
 * "Unique People Praying" chart does: by tracking_id, falling back to the row.
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

  const [points, [totals]] = await Promise.all([
    sql`
      SELECT
        pa.latitude,
        pa.longitude,
        pa.city,
        pa.country,
        COUNT(DISTINCT COALESCE(pa.tracking_id, pa.id::text))::int AS count
      FROM prayer_activity pa
      WHERE pa.latitude IS NOT NULL AND pa.longitude IS NOT NULL AND ${inWindow}
      GROUP BY pa.latitude, pa.longitude, pa.city, pa.country
      ORDER BY count DESC
    `,
    sql`
      SELECT
        COUNT(DISTINCT COALESCE(pa.tracking_id, pa.id::text))::int AS total,
        COUNT(DISTINCT COALESCE(pa.tracking_id, pa.id::text)) FILTER (WHERE pa.latitude IS NOT NULL)::int AS located
      FROM prayer_activity pa
      WHERE ${inWindow}
    `
  ])

  return {
    window,
    points: points.map(p => ({
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      city: (p.city as string | null) ?? null,
      country: (p.country as string | null) ?? null,
      label: [p.city, p.country ? countries.getName(p.country, 'en') ?? p.country : null].filter(Boolean).join(', '),
      count: p.count as number
    })),
    located: totals?.located ?? 0,
    total: totals?.total ?? 0
  }
})

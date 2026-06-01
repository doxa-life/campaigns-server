import type { Sql, Fragment } from 'postgres'

/**
 * Frequency-weighted daily prayer minutes for a campaign_subscriptions row.
 *
 * `prayer_duration` is a per-occurrence figure. To express it as average minutes
 * committed PER DAY — so daily and weekly commitments are comparable and the
 * 1440 (= minutes in a day) full-coverage threshold stays meaningful — weekly
 * commitments are scaled by how many days a week they actually run:
 * `duration * days_of_week / 7`. Daily (and any non-weekly) commitments run
 * every day, so they keep their full duration. A weekly row with no days
 * contributes 0 (it never sends).
 *
 * The day count uses regexp_count over the TEXT column rather than casting it to
 * json: `days_of_week::json` on a single malformed value would throw and take
 * down the whole query — including the public people-group detail endpoint and
 * the dashboard. Counting integer tokens handles the canonical JSON arrays
 * (`[1,3,5]` → 3), tolerates any legacy/garbage value, and never raises. `[]` /
 * '' / NULL yield 0 days, so such a weekly row contributes 0.
 *
 * Uses bare column names, so it must be embedded only in a query where
 * `campaign_subscriptions` is the only table exposing `prayer_duration` /
 * `frequency` / `days_of_week` (true at every current call site).
 */
export function committedDailyMinutes(sql: Sql): Fragment {
  return sql`
    prayer_duration * CASE
      WHEN frequency = 'weekly'
        THEN regexp_count(COALESCE(days_of_week, ''), '[0-9]+') / 7.0
      ELSE 1
    END
  `
}

export function buildWhere(sql: Sql, conditions: Fragment[]): Fragment {
  if (conditions.length === 0) return sql``
  let combined = conditions[0]!
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} AND ${conditions[i]!}`
  }
  return sql`WHERE ${combined}`
}

export function buildSet(sql: Sql, fields: Fragment[]): Fragment {
  let combined = fields[0]!
  for (let i = 1; i < fields.length; i++) {
    combined = sql`${combined}, ${fields[i]!}`
  }
  return combined
}

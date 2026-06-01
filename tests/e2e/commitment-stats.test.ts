import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestPeopleGroupSubscription
} from '../helpers/db'

// committed_duration is frequency-weighted: prayer_duration counts as average
// minutes PER DAY, so a weekly commitment contributes duration * days/7.
// Test subscriptions use the default prayer_duration of 10 minutes.
describe('Commitment stats frequency weighting', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  it('weights a 1-day weekly commitment as 1/7 of its duration', async () => {
    const pg = await createTestPeopleGroup(sql)
    const daily = await createTestSubscriber(sql, { name: 'Test Daily' })
    const weekly = await createTestSubscriber(sql, { name: 'Test Weekly' })

    // Daily 10-min → 10 min/day.
    await createTestPeopleGroupSubscription(sql, pg.id, daily.id, { frequency: 'daily' })
    // Weekly 10-min, one day a week → 10 * 1/7 ≈ 1.43 min/day.
    await createTestPeopleGroupSubscription(sql, pg.id, weekly.id, { frequency: 'weekly', days_of_week: [1] })

    const detail = await $fetch(`/api/people-groups/detail/${pg.slug}`)

    // ROUND(10 + 10/7) = ROUND(11.43) = 11
    expect(Number(detail.committed_duration)).toBe(11)
    // people_committed stays a plain count regardless of frequency.
    expect(Number(detail.people_committed)).toBe(2)
  })

  it('weights a 3-day weekly commitment as 3/7 of its duration', async () => {
    const pg = await createTestPeopleGroup(sql)
    const weekly = await createTestSubscriber(sql, { name: 'Test Weekly 3' })

    // Weekly 10-min on Mon/Wed/Fri → 10 * 3/7 ≈ 4.29 → ROUND = 4.
    await createTestPeopleGroupSubscription(sql, pg.id, weekly.id, { frequency: 'weekly', days_of_week: [1, 3, 5] })

    const detail = await $fetch(`/api/people-groups/detail/${pg.slug}`)
    expect(Number(detail.committed_duration)).toBe(4)
  })

  it('does not throw on a weekly row with non-JSON days_of_week (legacy/garbage)', async () => {
    const pg = await createTestPeopleGroup(sql)
    const legacy = await createTestSubscriber(sql, { name: 'Test Legacy' })
    const garbage = await createTestSubscriber(sql, { name: 'Test Garbage' })

    // Inserted directly to bypass the JSON.stringify helper. A legacy comma list
    // ("1,3,5" = 3 days) and an unparseable value must both leave the query
    // standing rather than 500 the whole endpoint (the old ::json cast threw).
    await sql`
      INSERT INTO campaign_subscriptions
        (people_group_id, subscriber_id, delivery_method, frequency, time_preference, timezone, status, days_of_week)
      VALUES
        (${pg.id}, ${legacy.id}, 'email', 'weekly', '09:00', 'UTC', 'active', '1,3,5'),
        (${pg.id}, ${garbage.id}, 'email', 'weekly', '09:00', 'UTC', 'active', 'not-json')
    `

    const detail = await $fetch(`/api/people-groups/detail/${pg.slug}`)

    // legacy "1,3,5" → 3 days → 10*3/7 ≈ 4.29; "not-json" has no digit → 0.
    // ROUND(4.29 + 0) = 4
    expect(Number(detail.committed_duration)).toBe(4)
    expect(Number(detail.people_committed)).toBe(2)
  })

  it('leaves daily commitments at their full duration', async () => {
    const pg = await createTestPeopleGroup(sql)
    const a = await createTestSubscriber(sql, { name: 'Test Daily A' })
    const b = await createTestSubscriber(sql, { name: 'Test Daily B' })

    await createTestPeopleGroupSubscription(sql, pg.id, a.id, { frequency: 'daily' })
    await createTestPeopleGroupSubscription(sql, pg.id, b.id, { frequency: 'daily' })

    const detail = await $fetch(`/api/people-groups/detail/${pg.slug}`)
    expect(Number(detail.committed_duration)).toBe(20)
  })
})

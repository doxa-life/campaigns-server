import { describe, it, expect, afterEach, afterAll } from 'vitest'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestPeopleGroupSubscription
} from '../helpers/db'
import { peopleGroupSubscriptionService } from '../../server/database/people-group-subscriptions'

const THRESHOLD_DAYS = 30

describe('App inactivity reactivate', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  async function recordPrayerActivity(
    trackingId: string,
    peopleGroupId: number,
    daysAgo: number
  ): Promise<void> {
    const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
    await sql`
      INSERT INTO prayer_activity (people_group_id, tracking_id, duration, timestamp, session_id)
      VALUES (${peopleGroupId}, ${trackingId}, 60, ${ts}, ${`test-session-${trackingId}-${peopleGroupId}-${daysAgo}`})
    `
  }

  describe('reactivateAppSubscriptionsWithRecentActivity', () => {
    it('reactivates inactive app subs that have recent prayer activity for the same PG', async () => {
      const pg = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Returning App User' })
      const sub = await createTestPeopleGroupSubscription(sql, pg.id, subscriber.id, {
        delivery_method: 'app',
        status: 'inactive'
      })
      await recordPrayerActivity(subscriber.tracking_id, pg.id, 3)

      const result = await peopleGroupSubscriptionService.reactivateAppSubscriptionsWithRecentActivity(THRESHOLD_DAYS)

      expect(result.find(r => r.id === sub.id)).toBeDefined()

      const [updated] = await sql`SELECT status FROM campaign_subscriptions WHERE id = ${sub.id}`
      expect(updated.status).toBe('active')
    })

    it('does NOT reactivate inactive app subs with no recent prayer activity for that PG', async () => {
      const pg = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Still-Inactive App User' })
      const sub = await createTestPeopleGroupSubscription(sql, pg.id, subscriber.id, {
        delivery_method: 'app',
        status: 'inactive'
      })
      await recordPrayerActivity(subscriber.tracking_id, pg.id, 60)

      const result = await peopleGroupSubscriptionService.reactivateAppSubscriptionsWithRecentActivity(THRESHOLD_DAYS)

      expect(result.find(r => r.id === sub.id)).toBeUndefined()

      const [updated] = await sql`SELECT status FROM campaign_subscriptions WHERE id = ${sub.id}`
      expect(updated.status).toBe('inactive')
    })

    it('does NOT touch already-active app subs', async () => {
      const pg = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Active App User' })
      const sub = await createTestPeopleGroupSubscription(sql, pg.id, subscriber.id, {
        delivery_method: 'app',
        status: 'active'
      })
      await recordPrayerActivity(subscriber.tracking_id, pg.id, 3)

      const result = await peopleGroupSubscriptionService.reactivateAppSubscriptionsWithRecentActivity(THRESHOLD_DAYS)

      expect(result.find(r => r.id === sub.id)).toBeUndefined()
    })

    it('does NOT reactivate email subscriptions even with recent activity', async () => {
      const pg = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Inactive Email User' })
      const sub = await createTestPeopleGroupSubscription(sql, pg.id, subscriber.id, {
        delivery_method: 'email',
        status: 'inactive'
      })
      await recordPrayerActivity(subscriber.tracking_id, pg.id, 3)

      const result = await peopleGroupSubscriptionService.reactivateAppSubscriptionsWithRecentActivity(THRESHOLD_DAYS)

      expect(result.find(r => r.id === sub.id)).toBeUndefined()

      const [updated] = await sql`SELECT status FROM campaign_subscriptions WHERE id = ${sub.id}`
      expect(updated.status).toBe('inactive')
    })

    it('does NOT reactivate manually-unsubscribed subs even with recent activity (sticky opt-out)', async () => {
      const pg = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Sticky Unsub User' })
      const sub = await createTestPeopleGroupSubscription(sql, pg.id, subscriber.id, {
        delivery_method: 'app',
        status: 'unsubscribed'
      })
      await recordPrayerActivity(subscriber.tracking_id, pg.id, 3)

      const result = await peopleGroupSubscriptionService.reactivateAppSubscriptionsWithRecentActivity(THRESHOLD_DAYS)

      expect(result.find(r => r.id === sub.id)).toBeUndefined()

      const [updated] = await sql`SELECT status FROM campaign_subscriptions WHERE id = ${sub.id}`
      expect(updated.status).toBe('unsubscribed')
    })

    it('per-PG: only the engaged PG sub is reactivated when user prays for one PG', async () => {
      const pgRussia = await createTestPeopleGroup(sql, { slug: `test-russia-r-${Date.now()}` })
      const pgChina = await createTestPeopleGroup(sql, { slug: `test-china-r-${Date.now()}` })
      const subscriber = await createTestSubscriber(sql, { name: 'Test Multi-PG Return User' })

      const subRussia = await createTestPeopleGroupSubscription(sql, pgRussia.id, subscriber.id, {
        delivery_method: 'app',
        status: 'inactive'
      })
      const subChina = await createTestPeopleGroupSubscription(sql, pgChina.id, subscriber.id, {
        delivery_method: 'app',
        status: 'inactive'
      })

      // Praying only for Russia
      await recordPrayerActivity(subscriber.tracking_id, pgRussia.id, 3)

      const result = await peopleGroupSubscriptionService.reactivateAppSubscriptionsWithRecentActivity(THRESHOLD_DAYS)

      expect(result.find(r => r.id === subRussia.id)).toBeDefined()
      expect(result.find(r => r.id === subChina.id)).toBeUndefined()

      const [updatedRussia] = await sql`SELECT status FROM campaign_subscriptions WHERE id = ${subRussia.id}`
      const [updatedChina] = await sql`SELECT status FROM campaign_subscriptions WHERE id = ${subChina.id}`
      expect(updatedRussia.status).toBe('active')
      expect(updatedChina.status).toBe('inactive')
    })
  })
})

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber
} from '../helpers/db'
import type postgres from 'postgres'

const SECRET = process.env.ANON_SIGNUP_SECRET || ''
if (!SECRET) {
  throw new Error('ANON_SIGNUP_SECRET must be set in .env to run these tests (forwarded via vitest.config.ts)')
}
const headers = { 'x-app-secret': SECRET }

async function getPushRows(sql: ReturnType<typeof postgres>, subscriptionId: string) {
  return await sql`
    SELECT * FROM push_subscriptions WHERE onesignal_subscription_id = ${subscriptionId}
  ` as Array<{
    id: number
    subscriber_id: number
    onesignal_subscription_id: string
    external_id: string | null
    platform: string | null
    created_at: string
    updated_at: string
  }>
}

describe('POST /api/push/register', () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    // push_subscriptions rows are removed by the subscriber cascade in
    // cleanupTestData (test subscribers are named 'Test %'). Nothing extra needed.
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  describe('Auth', () => {
    it('returns 403 without the app secret', async () => {
      const error = await $fetch('/api/push/register', {
        method: 'POST',
        body: { tracking_id: uuidv4(), onesignal_subscription_id: uuidv4(), platform: 'ios' }
      }).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 403 with a wrong secret', async () => {
      const error = await $fetch('/api/push/register', {
        method: 'POST',
        headers: { 'x-app-secret': 'wrong-secret' },
        body: { tracking_id: uuidv4(), onesignal_subscription_id: uuidv4(), platform: 'ios' }
      }).catch(e => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('Validation', () => {
    it('returns 400 when onesignal_subscription_id is missing', async () => {
      const error = await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: { tracking_id: uuidv4(), platform: 'ios' }
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('returns 400 for an empty body', async () => {
      const error = await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: {}
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('Unknown device (pre-signup)', () => {
    it('soft no-ops (200, registered:false) when no subscriber matches', async () => {
      const subscriptionId = uuidv4()
      const res = await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: { tracking_id: uuidv4(), onesignal_subscription_id: subscriptionId, platform: 'android' }
      })
      expect(res).toEqual({ ok: true, registered: false })

      const rows = await getPushRows(sql, subscriptionId)
      expect(rows.length).toBe(0)
    })
  })

  describe('Registration', () => {
    it('registers by tracking_id and stores tracking_id as the external_id', async () => {
      const subscriber = await createTestSubscriber(sql)
      const subscriptionId = uuidv4()

      const res = await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        // No profile_id — the server should resolve by tracking_id.
        body: { tracking_id: subscriber.tracking_id, onesignal_subscription_id: subscriptionId, platform: 'android' }
      })
      expect(res).toEqual({ ok: true, registered: true })

      const rows = await getPushRows(sql, subscriptionId)
      expect(rows.length).toBe(1)
      expect(rows[0]!.subscriber_id).toBe(subscriber.id)
      expect(rows[0]!.external_id).toBe(subscriber.tracking_id)
      expect(rows[0]!.platform).toBe('android')
    })

    it('prefers profile_id for resolution and stores it as the external_id', async () => {
      const subscriber = await createTestSubscriber(sql)
      const subscriptionId = uuidv4()

      const res = await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: {
          tracking_id: subscriber.tracking_id,
          profile_id: subscriber.profile_id,
          onesignal_subscription_id: subscriptionId,
          platform: 'ios'
        }
      })
      expect(res).toEqual({ ok: true, registered: true })

      const rows = await getPushRows(sql, subscriptionId)
      expect(rows.length).toBe(1)
      expect(rows[0]!.subscriber_id).toBe(subscriber.id)
      expect(rows[0]!.external_id).toBe(subscriber.profile_id)
      expect(rows[0]!.platform).toBe('ios')
    })

    it('falls back to tracking_id when the given profile_id does not exist', async () => {
      const subscriber = await createTestSubscriber(sql)
      const subscriptionId = uuidv4()

      const res = await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: {
          tracking_id: subscriber.tracking_id,
          profile_id: uuidv4(), // unknown profile
          onesignal_subscription_id: subscriptionId,
          platform: 'ios'
        }
      })
      expect(res).toEqual({ ok: true, registered: true })

      const rows = await getPushRows(sql, subscriptionId)
      expect(rows.length).toBe(1)
      expect(rows[0]!.subscriber_id).toBe(subscriber.id)
    })

    it('stores an unrecognised platform as null', async () => {
      const subscriber = await createTestSubscriber(sql)
      const subscriptionId = uuidv4()

      await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: { tracking_id: subscriber.tracking_id, onesignal_subscription_id: subscriptionId, platform: 'windows' }
      })

      const rows = await getPushRows(sql, subscriptionId)
      expect(rows.length).toBe(1)
      expect(rows[0]!.platform).toBeNull()
    })
  })

  describe('Idempotency', () => {
    it('upserts on a repeat call with the same subscription id (no duplicate row)', async () => {
      const subscriber = await createTestSubscriber(sql)
      const subscriptionId = uuidv4()

      // First register without a profile id (external_id = tracking_id).
      await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: { tracking_id: subscriber.tracking_id, onesignal_subscription_id: subscriptionId, platform: 'android' }
      })

      // Re-register the same device once the profile id is known — should update
      // the existing row's external_id/platform in place, not duplicate.
      await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: {
          tracking_id: subscriber.tracking_id,
          profile_id: subscriber.profile_id,
          onesignal_subscription_id: subscriptionId,
          platform: 'ios'
        }
      })

      const rows = await getPushRows(sql, subscriptionId)
      expect(rows.length).toBe(1)
      expect(rows[0]!.external_id).toBe(subscriber.profile_id)
      expect(rows[0]!.platform).toBe('ios')
    })

    it('reassigns the subscription to a new subscriber on conflict', async () => {
      const first = await createTestSubscriber(sql)
      const second = await createTestSubscriber(sql)
      const subscriptionId = uuidv4()

      await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: { tracking_id: first.tracking_id, onesignal_subscription_id: subscriptionId, platform: 'ios' }
      })

      // Same device id now reported under a different subscriber (e.g. account
      // switch on a shared device) — the row should move, not duplicate.
      await $fetch('/api/push/register', {
        method: 'POST',
        headers,
        body: { tracking_id: second.tracking_id, onesignal_subscription_id: subscriptionId, platform: 'ios' }
      })

      const rows = await getPushRows(sql, subscriptionId)
      expect(rows.length).toBe(1)
      expect(rows[0]!.subscriber_id).toBe(second.id)
      expect(rows[0]!.external_id).toBe(second.tracking_id)
    })
  })
})

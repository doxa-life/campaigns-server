import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  getAllTestSubscriptions,
  getTestContactMethod
} from '../helpers/db'

const SECRET = process.env.ANON_SIGNUP_SECRET || ''
if (!SECRET) {
  throw new Error('ANON_SIGNUP_SECRET must be set in .env to run these tests (forwarded via vitest.config.ts)')
}
const headers = { 'x-app-secret': SECRET }

describe('POST /api/people-groups/[slug]/anon-signup', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    // Anonymous subscribers are named 'Anonymous' and aren't caught by the
    // shared 'Test %' cleanup, so remove them explicitly first.
    await sql`DELETE FROM subscribers WHERE name = 'Anonymous'`
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  describe('Auth', () => {
    it('returns 403 without the app secret', async () => {
      const pg = await createTestPeopleGroup(sql)
      const error = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        body: { frequency: 'daily', time: '08:00' }
      }).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 403 with a wrong secret', async () => {
      const pg = await createTestPeopleGroup(sql)
      const error = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers: { 'x-app-secret': 'wrong-secret' },
        body: { frequency: 'daily', time: '08:00' }
      }).catch(e => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('Validation', () => {
    it('returns 404 for an unknown people group', async () => {
      const error = await $fetch('/api/people-groups/test-does-not-exist/anon-signup', {
        method: 'POST',
        headers,
        body: { frequency: 'daily', time: '08:00' }
      }).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('returns 400 for weekly without days_of_week', async () => {
      const pg = await createTestPeopleGroup(sql)
      const error = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: { frequency: 'weekly', time: '08:00' }
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('returns 400 for an invalid time', async () => {
      const pg = await createTestPeopleGroup(sql)
      const error = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: { frequency: 'daily', time: '8am' }
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('Anonymous signup', () => {
    it('creates an anonymous subscriber + active app subscription with no contact method', async () => {
      const pg = await createTestPeopleGroup(sql)
      const res = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: { frequency: 'daily', time: '08:00', timezone: 'America/New_York' }
      })

      expect(res.tracking_id).toBeTruthy()
      expect(res.profile_id).toBeTruthy()
      expect(res.subscription_id).toBeTruthy()

      const [subscriber] = await sql`SELECT * FROM subscribers WHERE tracking_id = ${res.tracking_id}`
      expect(subscriber).toBeDefined()
      expect(subscriber.name).toBe('Anonymous')

      const contacts = await sql`SELECT * FROM contact_methods WHERE subscriber_id = ${subscriber.id}`
      expect(contacts.length).toBe(0)

      const subs = await getAllTestSubscriptions(sql, pg.id, subscriber.id)
      expect(subs.length).toBe(1)
      expect(subs[0]!.delivery_method).toBe('app')
      expect(subs[0]!.status).toBe('active')
      expect(subs[0]!.frequency).toBe('daily')
      expect(subs[0]!.time_preference).toBe('08:00')
      expect(subs[0]!.timezone).toBe('America/New_York')
    })

    it('upserts on a repeat call with the same tracking_id (no duplicate records)', async () => {
      const pg = await createTestPeopleGroup(sql)
      const first = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: { frequency: 'daily', time: '08:00' }
      })

      const second = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: { tracking_id: first.tracking_id, frequency: 'weekly', time: '21:30', days_of_week: [1, 3, 5] }
      })

      expect(second.tracking_id).toBe(first.tracking_id)
      expect(second.subscription_id).toBe(first.subscription_id)

      const subscribers = await sql`SELECT * FROM subscribers WHERE tracking_id = ${first.tracking_id}`
      expect(subscribers.length).toBe(1)

      const subs = await getAllTestSubscriptions(sql, pg.id, subscribers[0]!.id)
      expect(subs.length).toBe(1)
      expect(subs[0]!.frequency).toBe('weekly')
      expect(subs[0]!.time_preference).toBe('21:30')
    })
  })

  describe('Email dedup', () => {
    it('dedups against an existing email subscriber when email is provided', async () => {
      const pg = await createTestPeopleGroup(sql)
      const existing = await createTestSubscriber(sql, { name: 'Test Web User' })
      const email = `test-web-${Date.now()}@example.com`
      await createTestContactMethod(sql, existing.id, { type: 'email', value: email, verified: true })

      const res = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: {
          frequency: 'daily',
          time: '08:00',
          email,
          name: 'Test Web User',
          tracking_id: '11111111-2222-3333-4444-555555555555'
        }
      })

      // Resolved to the existing subscriber, NOT the device tracking_id we sent.
      expect(res.tracking_id).toBe(existing.tracking_id)

      const subs = await getAllTestSubscriptions(sql, pg.id, existing.id)
      expect(subs.length).toBe(1)
      expect(subs[0]!.delivery_method).toBe('app')
    })

    it('attaches the email to the new subscriber and records consents', async () => {
      const pg = await createTestPeopleGroup(sql)
      const email = `test-anon-email-${Date.now()}@example.com`

      const res = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: {
          frequency: 'daily',
          time: '08:00',
          email,
          name: 'Test Anon Email',
          consent_people_group_updates: true,
          consent_doxa_general: true
        }
      })

      const [subscriber] = await sql`SELECT * FROM subscribers WHERE tracking_id = ${res.tracking_id}`
      const contact = await getTestContactMethod(sql, subscriber.id, 'email')
      expect(contact).toBeDefined()
      expect(contact!.value.toLowerCase()).toBe(email.toLowerCase())
      expect(contact!.verified).toBe(false)
      expect(contact!.consent_doxa_general).toBe(true)
      expect(contact!.consented_people_group_ids).toContain(pg.id)
    })

    it('does not send verification or tag news source when email is supplied without consent', async () => {
      const pg = await createTestPeopleGroup(sql)
      const email = `test-anon-nocons-${Date.now()}@example.com`

      const res = await $fetch(`/api/people-groups/${pg.slug}/anon-signup`, {
        method: 'POST',
        headers,
        body: {
          frequency: 'daily',
          time: '08:00',
          email,
          name: 'Test Anon NoConsent'
          // no consent flags — email is here purely for dedup
        }
      })

      const [subscriber] = await sql`SELECT * FROM subscribers WHERE tracking_id = ${res.tracking_id}`
      const contact = await getTestContactMethod(sql, subscriber.id, 'email')
      expect(contact).toBeDefined()
      expect(contact!.verified).toBe(false)
      expect(contact!.verification_token).toBeNull()
      expect(contact!.consent_doxa_general).toBe(false)
      expect(subscriber.sources).not.toContain('news')
      expect(subscriber.sources).toContain('anon-app')
    })
  })

  describe('Concurrency', () => {
    it('does not create duplicate app subscriptions under concurrent calls with the same tracking_id', async () => {
      const pg = await createTestPeopleGroup(sql)
      const trackingId = '99999999-aaaa-bbbb-cccc-dddddddddddd'
      const body = { tracking_id: trackingId, frequency: 'daily', time: '08:00' }

      const [r1, r2] = await Promise.all([
        $fetch(`/api/people-groups/${pg.slug}/anon-signup`, { method: 'POST', headers, body }),
        $fetch(`/api/people-groups/${pg.slug}/anon-signup`, { method: 'POST', headers, body })
      ])

      expect(r1.tracking_id).toBe(trackingId)
      expect(r2.tracking_id).toBe(trackingId)

      const [subscriber] = await sql`SELECT * FROM subscribers WHERE tracking_id = ${trackingId}`
      expect(subscriber).toBeDefined()

      const subs = await getAllTestSubscriptions(sql, pg.id, subscriber.id)
      const appSubs = subs.filter(s => s.delivery_method === 'app')
      expect(appSubs.length).toBe(1)
    })
  })
})

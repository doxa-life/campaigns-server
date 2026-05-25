import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  getTestContactMethod,
  getTestSubscriberByEmail
} from '../helpers/db'

const SECRET = process.env.ANON_SIGNUP_SECRET || ''
const FORM_KEY = process.env.FORM_API_KEY || ''

describe('POST /api/news-signup', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  it('returns 403 with no auth', async () => {
    const error = await $fetch('/api/news-signup', {
      method: 'POST',
      body: { email: 'test-noauth@example.com' }
    }).catch(e => e)
    expect(error.statusCode).toBe(403)
  })

  it('returns 400 for an invalid email', async () => {
    const error = await $fetch('/api/news-signup', {
      method: 'POST',
      headers: { 'x-app-secret': SECRET },
      body: { email: 'not-an-email' }
    }).catch(e => e)
    expect(error.statusCode).toBe(400)
  })

  it('creates a subscriber + email + doxa consent and queues verification (app secret)', async () => {
    const email = `test-news-${Date.now()}@example.com`
    const res = await $fetch('/api/news-signup', {
      method: 'POST',
      headers: { 'x-app-secret': SECRET },
      body: { name: 'Test News User', email, consent_doxa_general: true }
    })

    expect(res.success).toBe(true)
    expect(res.tracking_id).toBeTruthy()
    expect(res.profile_id).toBeTruthy()

    const subscriber = await getTestSubscriberByEmail(sql, email)
    expect(subscriber).toBeDefined()

    const contact = await getTestContactMethod(sql, subscriber!.id, 'email')
    expect(contact!.consent_doxa_general).toBe(true)
    expect(contact!.verified).toBe(false)
    expect(contact!.verification_token).toBeTruthy()
  })

  it.skipIf(!FORM_KEY)('accepts the form API key via x-api-key', async () => {
    const email = `test-news-formkey-${Date.now()}@example.com`
    const res = await $fetch('/api/news-signup', {
      method: 'POST',
      headers: { 'x-api-key': FORM_KEY },
      body: { name: 'Test News FormKey', email, consent_doxa_general: true }
    })
    expect(res.success).toBe(true)
  })

  it('records people-group consent when slug + flag are provided', async () => {
    const pg = await createTestPeopleGroup(sql)
    const email = `test-news-pg-${Date.now()}@example.com`

    await $fetch('/api/news-signup', {
      method: 'POST',
      headers: { 'x-app-secret': SECRET },
      body: { name: 'Test News PG', email, people_group_slug: pg.slug, consent_people_group_updates: true }
    })

    const subscriber = await getTestSubscriberByEmail(sql, email)
    const contact = await getTestContactMethod(sql, subscriber!.id, 'email')
    expect(contact!.consented_people_group_ids).toContain(pg.id)
  })

  it('dedups by existing email (no duplicate subscriber)', async () => {
    const existing = await createTestSubscriber(sql, { name: 'Test News Existing' })
    const email = `test-news-existing-${Date.now()}@example.com`
    await createTestContactMethod(sql, existing.id, { type: 'email', value: email, verified: true })

    const res = await $fetch('/api/news-signup', {
      method: 'POST',
      headers: { 'x-app-secret': SECRET },
      body: { name: 'Test News Existing', email, consent_doxa_general: true }
    })

    expect(res.tracking_id).toBe(existing.tracking_id)

    const subscribers = await sql`SELECT * FROM subscribers WHERE tracking_id = ${existing.tracking_id}`
    expect(subscribers.length).toBe(1)
  })

  it('attaches the email to an existing anonymous subscriber via tracking_id', async () => {
    // Simulate a prior anonymous signup (subscriber exists, no email yet).
    const anon = await createTestSubscriber(sql, { name: 'Test News Anon' })
    const email = `test-news-attach-${Date.now()}@example.com`

    const res = await $fetch('/api/news-signup', {
      method: 'POST',
      headers: { 'x-app-secret': SECRET },
      body: { name: 'Test News Anon', email, tracking_id: anon.tracking_id, consent_doxa_general: true }
    })

    expect(res.tracking_id).toBe(anon.tracking_id)

    const contact = await getTestContactMethod(sql, anon.id, 'email')
    expect(contact).toBeDefined()
    expect(contact!.value.toLowerCase()).toBe(email.toLowerCase())
  })
})

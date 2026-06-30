import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber,
  createTestContactMethod,
  getTestContactMethod,
  getTestSubscriberByEmail
} from '../helpers/db'

const FORM_KEY = process.env.FORM_API_KEY || ''

// Latest feedback conversation for a subscriber, with its first inbound message.
async function latestFeedbackConversation(sql: ReturnType<typeof getTestDatabase>, subscriberId: number) {
  const [conversation] = await sql`
    SELECT * FROM conversations
    WHERE subscriber_id = ${subscriberId} AND source = 'feedback'
    ORDER BY id DESC LIMIT 1
  `
  if (!conversation) return null
  const [message] = await sql`
    SELECT * FROM conversation_messages
    WHERE conversation_id = ${conversation.id} AND direction = 'inbound'
    ORDER BY id ASC LIMIT 1
  `
  return { conversation, message }
}

describe('POST /api/feedback', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    // Feedback-created subscribers are named by their email (not "Test %"), so the
    // shared cleanup won't catch them — delete them by the test email pattern, which
    // cascades their conversations/messages. Also clear the rate-limit log so the
    // next test starts from a clean window.
    await sql`
      DELETE FROM subscribers WHERE id IN (
        SELECT DISTINCT subscriber_id FROM contact_methods
        WHERE subscriber_id IS NOT NULL AND value LIKE 'test-feedback-%@example.com'
      )
    `
    await sql`DELETE FROM activity_logs WHERE event_type = 'FEEDBACK_SUBMISSION'`
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  // --- Validation ---------------------------------------------------------

  it('returns 400 when email is missing', async () => {
    const error = await $fetch('/api/feedback', {
      method: 'POST',
      body: { message: 'no email here', feedback_type: 'suggestion' }
    }).catch(e => e)
    expect(error.statusCode).toBe(400)
  })

  it('returns 400 for an invalid email', async () => {
    const error = await $fetch('/api/feedback', {
      method: 'POST',
      body: { email: 'not-an-email', message: 'hi', feedback_type: 'suggestion' }
    }).catch(e => e)
    expect(error.statusCode).toBe(400)
  })

  it('returns 400 when message is missing', async () => {
    const error = await $fetch('/api/feedback', {
      method: 'POST',
      body: { email: `test-feedback-${Date.now()}@example.com`, feedback_type: 'suggestion' }
    }).catch(e => e)
    expect(error.statusCode).toBe(400)
  })

  it('returns 400 when feedback_type is missing or invalid', async () => {
    const missing = await $fetch('/api/feedback', {
      method: 'POST',
      body: { email: `test-feedback-${Date.now()}@example.com`, message: 'hi' }
    }).catch(e => e)
    expect(missing.statusCode).toBe(400)

    const invalid = await $fetch('/api/feedback', {
      method: 'POST',
      body: { email: `test-feedback-${Date.now()}@example.com`, message: 'hi', feedback_type: 'rant' }
    }).catch(e => e)
    expect(invalid.statusCode).toBe(400)
  })

  // --- Core behaviour -----------------------------------------------------

  it('opens a feedback conversation with source, subject prefix, tag and message', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Feedback Core' })
    const email = `test-feedback-core-${Date.now()}@example.com`

    const res = await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        name: 'Test Feedback Core',
        email,
        message: 'This is a test suggestion.\nWith a second line.',
        feedback_type: 'suggestion',
        tracking_id: subscriber.tracking_id
      }
    })
    expect(res.success).toBe(true)

    const result = await latestFeedbackConversation(sql, subscriber.id)
    expect(result).not.toBeNull()
    expect(result!.conversation.source).toBe('feedback')
    expect(result!.conversation.subject).toMatch(/^\[Suggestion\] /)
    expect(result!.conversation.tags).toContain('feedback-suggestion')

    expect(result!.message).toBeDefined()
    expect(result!.message.direction).toBe('inbound')
    expect(result!.message.body_text).toBe('This is a test suggestion.\nWith a second line.')
    expect(result!.message.from_email).toBe(email)
  })

  it.each([
    ['compliment', 'Compliment'],
    ['suggestion', 'Suggestion'],
    ['problem', 'Problem']
  ])('maps feedback_type "%s" to its tag and subject prefix', async (type, label) => {
    const subscriber = await createTestSubscriber(sql, { name: `Test Feedback ${label}` })
    const email = `test-feedback-${type}-${Date.now()}@example.com`

    await $fetch('/api/feedback', {
      method: 'POST',
      body: { email, message: `A ${type}`, feedback_type: type, tracking_id: subscriber.tracking_id }
    })

    const result = await latestFeedbackConversation(sql, subscriber.id)
    expect(result!.conversation.tags).toContain(`feedback-${type}`)
    expect(result!.conversation.subject.startsWith(`[${label}] `)).toBe(true)
  })

  it('creates a new subscriber by email when no tracking_id is given', async () => {
    const email = `test-feedback-new-${Date.now()}@example.com`

    const res = await $fetch('/api/feedback', {
      method: 'POST',
      body: { email, message: 'Standalone feedback', feedback_type: 'problem' }
    })
    expect(res.success).toBe(true)

    const subscriber = await getTestSubscriberByEmail(sql, email)
    expect(subscriber).toBeDefined()
    const result = await latestFeedbackConversation(sql, subscriber!.id)
    expect(result!.conversation.source).toBe('feedback')
  })

  it('links to an existing subscriber via tracking_id (new email attaches, no duplicate)', async () => {
    const anon = await createTestSubscriber(sql, { name: 'Test Feedback Anon' })
    const email = `test-feedback-attach-${Date.now()}@example.com`

    const res = await $fetch('/api/feedback', {
      method: 'POST',
      body: { email, message: 'Linked feedback', feedback_type: 'compliment', tracking_id: anon.tracking_id }
    })
    expect(res.success).toBe(true)

    // Email attached to the same subscriber, not a new one.
    const contact = await getTestContactMethod(sql, anon.id, 'email')
    expect(contact!.value.toLowerCase()).toBe(email.toLowerCase())

    const rows = await sql`SELECT id FROM subscribers WHERE tracking_id = ${anon.tracking_id}`
    expect(rows.length).toBe(1)

    // And the conversation is attributed to that subscriber.
    const result = await latestFeedbackConversation(sql, anon.id)
    expect(result).not.toBeNull()
  })

  it('reuses the subscriber that already owns the email', async () => {
    const existing = await createTestSubscriber(sql, { name: 'Test Feedback Existing' })
    const email = `test-feedback-existing-${Date.now()}@example.com`
    await createTestContactMethod(sql, existing.id, { type: 'email', value: email, verified: true })

    await $fetch('/api/feedback', {
      method: 'POST',
      body: { email, message: 'Hi again', feedback_type: 'suggestion' }
    })

    const result = await latestFeedbackConversation(sql, existing.id)
    expect(result).not.toBeNull()
    expect(result!.conversation.subscriber_id).toBe(existing.id)
  })

  it('records doxa consent and queues a verification when consent_doxa_general is true', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Feedback Consent' })
    const email = `test-feedback-consent-${Date.now()}@example.com`

    await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        email,
        message: 'Sign me up too',
        feedback_type: 'compliment',
        consent_doxa_general: true,
        tracking_id: subscriber.tracking_id
      }
    })

    const contact = await getTestContactMethod(sql, subscriber.id, 'email')
    expect(contact!.consent_doxa_general).toBe(true)
    expect(contact!.verified).toBe(false)
    expect(contact!.verification_token).toBeTruthy()
  })

  // --- Abuse protection ---------------------------------------------------

  it('rate-limits after 10 submissions from the same client within the window', async () => {
    const email = `test-feedback-rate-${Date.now()}@example.com`
    const codes: number[] = []

    // 11th request should be rejected (limit is 10 / hour / IP).
    for (let i = 0; i < 11; i++) {
      const res = await $fetch('/api/feedback', {
        method: 'POST',
        body: { email, message: `rate ${i}`, feedback_type: 'suggestion' }
      })
        .then(() => 200)
        .catch(e => e.statusCode as number)
      codes.push(res)
    }

    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200))
    expect(codes[10]).toBe(429)
  })

  // --- Regression: the key-gated contact endpoint must stay gated ----------

  it('does not open the key-gated /api/contact endpoint', async () => {
    const error = await $fetch('/api/contact', {
      method: 'POST',
      body: { email: `test-feedback-contact-${Date.now()}@example.com`, message: 'hi' }
    }).catch(e => e)
    // Without the form key, the request is rejected: 401 (key missing/invalid) or
    // 500 (FORM_API_KEY not configured in this environment). Never 2xx.
    expect([401, 500]).toContain(error.statusCode)
  })

  it.skipIf(!FORM_KEY)('still accepts /api/contact with a valid form key', async () => {
    const res = await $fetch('/api/contact', {
      method: 'POST',
      headers: { 'x-api-key': FORM_KEY },
      body: { email: `test-feedback-contactok-${Date.now()}@example.com`, message: 'hi via key' }
    })
    expect(res.success).toBe(true)
  })
})

import { describe, it, expect, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber,
  createTestContactMethod
} from '../../../helpers/db'

const sql = getTestDatabase()

const testEmail = () => `test-${randomUUID().slice(0, 8)}@example.com`

// Signature validation is skipped under VITEST (x-test-verify-sig opts back in),
// so tests can post synthetic event batches.
async function postEvents(events: Record<string, any>[]) {
  return await $fetch<{ status: string; processed: number; suppressed: number; unsubscribed: number; matched: number }>(
    '/api/webhooks/sendgrid/events',
    { method: 'POST', body: events }
  )
}

function bounceEvent(email: string, opts: { type?: string; reason?: string } = {}) {
  return {
    event: 'bounce',
    type: opts.type || 'bounce',
    email,
    reason: opts.reason || '550 user unknown',
    sg_message_id: `${randomUUID().replace(/-/g, '')}.filterdrecv-test`,
    timestamp: Math.floor(Date.now() / 1000),
  }
}

async function getSuppression(email: string) {
  const [row] = await sql`
    SELECT suppression_reason as reason, bounce_count, suppressed_at
    FROM contact_methods
    WHERE type = 'email' AND LOWER(value) = ${email.toLowerCase()} AND suppressed_at IS NOT NULL
  `
  return row as { reason: string; bounce_count: number } | undefined
}

afterEach(async () => {
  await cleanupTestData(sql)
})

afterAll(async () => {
  await closeTestDatabase()
})

describe('SendGrid events webhook → email suppression', () => {
  it('suppresses a hard bounce', async () => {
    const email = testEmail()
    const res = await postEvents([bounceEvent(email)])

    expect(res.suppressed).toBe(1)
    const row = await getSuppression(email)
    expect(row?.reason).toBe('hard_bounce')
    expect(row?.bounce_count).toBe(1)
  })

  it('does NOT suppress a blocked bounce', async () => {
    const email = testEmail()
    const res = await postEvents([bounceEvent(email, { type: 'blocked', reason: 'temporarily deferred' })])

    expect(res.suppressed).toBe(0)
    expect(await getSuppression(email)).toBeFalsy()
  })

  it('suppresses a spam report as a complaint', async () => {
    const email = testEmail()
    const res = await postEvents([{ event: 'spamreport', email }])

    expect(res.suppressed).toBe(1)
    expect((await getSuppression(email))?.reason).toBe('complaint')
  })

  it('treats an unsubscribe as a marketing opt-out, not a suppression', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test SendGrid Unsub' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    await sql`UPDATE contact_methods SET consent_doxa_general = true, consent_product_emails = true WHERE id = ${cm.id}`

    const res = await postEvents([{ event: 'unsubscribe', email: cm.value }])
    expect(res.unsubscribed).toBe(1)
    expect(res.suppressed).toBe(0)

    const [row] = await sql`
      SELECT consent_doxa_general, consent_product_emails, suppressed_at
      FROM contact_methods WHERE id = ${cm.id}
    `
    expect((row as any).consent_doxa_general).toBe(false)
    expect((row as any).consent_product_emails).toBe(false)
    expect((row as any).suppressed_at).toBeNull()
  })

  it('is idempotent — a repeat hard bounce bumps bounce_count, not row count', async () => {
    const email = testEmail()
    await postEvents([bounceEvent(email)])
    await postEvents([bounceEvent(email)])

    const rows = await sql`
      SELECT bounce_count FROM contact_methods
      WHERE type = 'email' AND LOWER(value) = ${email.toLowerCase()}
    `
    expect(rows.length).toBe(1)
    expect((rows[0] as any).bounce_count).toBe(2)
  })

  it('processes a mixed batch in one POST', async () => {
    const bounced = testEmail()
    const complained = testEmail()
    const res = await postEvents([
      bounceEvent(bounced),
      { event: 'spamreport', email: complained },
      { event: 'open', email: testEmail() },
    ])

    expect(res.processed).toBe(3)
    expect(res.suppressed).toBe(2)
    expect((await getSuppression(bounced))?.reason).toBe('hard_bounce')
    expect((await getSuppression(complained))?.reason).toBe('complaint')
  })
})

describe('SendGrid events webhook → outbound message state', () => {
  it('marks an outbound conversation message delivered by sg_message_id', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test SendGrid Delivery' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    const token = randomUUID().replace(/-/g, '').slice(0, 20)
    const [convo] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${subscriber.id}, 'open', ${token}, 'SendGrid delivery test')
      RETURNING id
    `
    // Sends store the response's X-Message-Id; events echo it as the prefix of sg_message_id.
    const sgId = randomUUID().replace(/-/g, '')
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, to_email, body_text, provider_message_id)
      VALUES (${convo!.id}, 'outbound', 'sent', 'contact@doxa.life', ${cm.value}, 'hi', ${sgId})
    `

    const res = await postEvents([{
      event: 'delivered',
      email: cm.value,
      sg_message_id: `${sgId}.filterdrecv-test-0`,
      timestamp: Math.floor(Date.now() / 1000),
    }])
    expect(res.matched).toBe(1)

    const [msg] = await sql`SELECT status, delivered_at FROM conversation_messages WHERE conversation_id = ${convo!.id}`
    expect((msg as any).status).toBe('delivered')
    expect((msg as any).delivered_at).toBeTruthy()

    await sql`DELETE FROM conversations WHERE id = ${convo!.id}`
  })
})

describe('SendGrid events webhook → signature', () => {
  it('rejects an unsigned POST with 406 when verification is exercised', async () => {
    let status = 0
    try {
      await $fetch('/api/webhooks/sendgrid/events', {
        method: 'POST',
        body: [bounceEvent(testEmail())],
        headers: { 'x-test-verify-sig': '1' },
      })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(406)
  })
})

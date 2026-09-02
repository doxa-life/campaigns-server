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

// SNS envelope around an SES event payload. Signature validation is skipped under
// VITEST (x-test-verify-sig opts back in), so tests can post synthetic envelopes.
function snsEnvelope(message: Record<string, any>, overrides: Record<string, any> = {}) {
  return {
    Type: 'Notification',
    MessageId: randomUUID(),
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-email-events',
    Message: JSON.stringify(message),
    Timestamp: new Date().toISOString(),
    SignatureVersion: '1',
    Signature: 'test-signature',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem',
    ...overrides,
  }
}

async function postSesEvent(eventBody: Record<string, any>) {
  return await $fetch<{ status: string; suppressed?: boolean; matched?: boolean }>(
    '/api/webhooks/ses/events',
    { method: 'POST', body: snsEnvelope(eventBody) }
  )
}

function bounceEvent(email: string, bounceType: string, diagnosticCode?: string) {
  return {
    eventType: 'Bounce',
    bounce: {
      bounceType,
      bounceSubType: 'General',
      bouncedRecipients: [{ emailAddress: email, ...(diagnosticCode ? { diagnosticCode } : {}) }],
    },
    mail: { messageId: randomUUID().replace(/-/g, '') },
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

describe('SES events webhook → email suppression', () => {
  it('suppresses a permanent bounce as a hard bounce', async () => {
    const email = testEmail()
    const res = await postSesEvent(bounceEvent(email, 'Permanent', 'smtp; 550 user unknown'))

    expect(res.suppressed).toBe(true)
    const row = await getSuppression(email)
    expect(row?.reason).toBe('hard_bounce')
    expect(row?.bounce_count).toBe(1)
  })

  it('suppresses a complaint', async () => {
    const email = testEmail()
    const res = await postSesEvent({
      eventType: 'Complaint',
      complaint: { complainedRecipients: [{ emailAddress: email }], complaintFeedbackType: 'abuse' },
      mail: { messageId: randomUUID().replace(/-/g, '') },
    })

    expect(res.suppressed).toBe(true)
    expect((await getSuppression(email))?.reason).toBe('complaint')
  })

  it('does NOT suppress a transient bounce', async () => {
    const email = testEmail()
    const res = await postSesEvent(bounceEvent(email, 'Transient'))

    expect(res.suppressed).toBeFalsy()
    expect(await getSuppression(email)).toBeFalsy()
  })

  it('does NOT suppress an undetermined bounce', async () => {
    const email = testEmail()
    const res = await postSesEvent(bounceEvent(email, 'Undetermined'))

    expect(res.suppressed).toBeFalsy()
    expect(await getSuppression(email)).toBeFalsy()
  })

  it('is idempotent — a repeat permanent bounce bumps bounce_count, not row count', async () => {
    const email = testEmail()
    await postSesEvent(bounceEvent(email, 'Permanent'))
    await postSesEvent(bounceEvent(email, 'Permanent'))

    const rows = await sql`
      SELECT bounce_count FROM contact_methods
      WHERE type = 'email' AND LOWER(value) = ${email.toLowerCase()}
    `
    expect(rows.length).toBe(1)
    expect((rows[0] as any).bounce_count).toBe(2)
  })

  it('handles the identity-notification shape (notificationType instead of eventType)', async () => {
    const email = testEmail()
    const res = await postSesEvent({
      notificationType: 'Bounce',
      bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: email }] },
      mail: { messageId: randomUUID().replace(/-/g, '') },
    })

    expect(res.suppressed).toBe(true)
    expect((await getSuppression(email))?.reason).toBe('hard_bounce')
  })
})

describe('SES events webhook → outbound message state', () => {
  it('marks an outbound conversation message delivered by SES message id', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test SES Delivery' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    const token = randomUUID().replace(/-/g, '').slice(0, 20)
    const [convo] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${subscriber.id}, 'open', ${token}, 'SES delivery test')
      RETURNING id
    `
    const sesId = randomUUID().replace(/-/g, '')
    // Sends via the nodemailer SES transport store the id as <id@region.amazonses.com>;
    // the event carries only the bare id.
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, to_email, body_text, provider_message_id)
      VALUES (${convo!.id}, 'outbound', 'sent', 'contact@doxa.life', ${cm.value}, 'hi', ${`<${sesId}@email.amazonses.com>`})
    `

    const res = await postSesEvent({
      eventType: 'Delivery',
      mail: { messageId: sesId },
      delivery: { timestamp: new Date().toISOString() },
    })
    expect(res.status).toBe('delivered')
    expect(res.matched).toBe(true)

    const [msg] = await sql`SELECT status, delivered_at FROM conversation_messages WHERE conversation_id = ${convo!.id}`
    expect((msg as any).status).toBe('delivered')
    expect((msg as any).delivered_at).toBeTruthy()

    await sql`DELETE FROM conversations WHERE id = ${convo!.id}`
  })
})

describe('SES events webhook → SNS protocol', () => {
  it('reports a failed confirmation for a subscription with a non-AWS SubscribeURL', async () => {
    const res = await $fetch<{ status: string }>('/api/webhooks/ses/events', {
      method: 'POST',
      body: snsEnvelope({}, {
        Type: 'SubscriptionConfirmation',
        SubscribeURL: 'https://evil.example.com/confirm',
        Token: 'tok',
      }),
    })
    expect(res.status).toBe('subscription_confirm_failed')
  })

  it('rejects an invalid SNS signature with 406 when verification is exercised', async () => {
    let status = 0
    try {
      await $fetch('/api/webhooks/ses/events', {
        method: 'POST',
        body: snsEnvelope(bounceEvent(testEmail(), 'Permanent'), {
          SigningCertURL: 'http://evil.example.com/cert.pem',
        }),
        headers: { 'x-test-verify-sig': '1' },
      })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(406)
  })
})

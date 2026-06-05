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
import { createAndLoginUser, createAdminUser } from '../../../helpers/auth'

const sql = getTestDatabase()

const testEmail = () => `test-${randomUUID().slice(0, 8)}@example.com`

// Signature validation is skipped under VITEST, so we can post synthetic events.
async function postEvent(eventData: Record<string, any>) {
  return await $fetch<{ status: string; suppressed?: boolean }>(
    '/api/webhooks/mailgun/delivery',
    { method: 'POST', body: { 'event-data': eventData } }
  )
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

describe('Mailgun delivery webhook → email suppression', () => {
  it('suppresses a permanent failure as a hard bounce', async () => {
    const email = testEmail()
    const res = await postEvent({
      event: 'failed',
      severity: 'permanent',
      recipient: email,
      'delivery-status': { message: 'mailbox does not exist' }
    })

    expect(res.suppressed).toBe(true)
    const row = await getSuppression(email)
    expect(row?.reason).toBe('hard_bounce')
    expect(row?.bounce_count).toBe(1)
  })

  it('suppresses a spam complaint', async () => {
    const email = testEmail()
    const res = await postEvent({ event: 'complained', recipient: email })

    expect(res.suppressed).toBe(true)
    expect((await getSuppression(email))?.reason).toBe('complaint')
  })

  it('treats a Mailgun unsubscribe as a marketing opt-out, not a suppression', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Mailgun Unsub' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    await sql`UPDATE contact_methods SET consent_doxa_general = true, consent_product_emails = true WHERE id = ${cm.id}`

    const res = await postEvent({ event: 'unsubscribed', recipient: cm.value })
    expect(res.suppressed).toBeFalsy()

    const [row] = await sql`
      SELECT consent_doxa_general, consent_product_emails, suppressed_at
      FROM contact_methods WHERE id = ${cm.id}
    `
    // Marketing consents turned off...
    expect((row as any).consent_doxa_general).toBe(false)
    expect((row as any).consent_product_emails).toBe(false)
    // ...but deliverability untouched, so transactional reminders keep flowing.
    expect((row as any).suppressed_at).toBeNull()
  })

  it('does NOT suppress a temporary failure', async () => {
    const email = testEmail()
    const res = await postEvent({ event: 'failed', severity: 'temporary', recipient: email })

    expect(res.suppressed).toBeFalsy()
    expect(await getSuppression(email)).toBeFalsy()
  })

  it('is idempotent — a repeat permanent failure bumps bounce_count, not row count', async () => {
    const email = testEmail()
    await postEvent({ event: 'failed', severity: 'permanent', recipient: email })
    await postEvent({ event: 'failed', severity: 'permanent', recipient: email })

    const rows = await sql`
      SELECT bounce_count FROM contact_methods
      WHERE type = 'email' AND LOWER(value) = ${email.toLowerCase()}
    `
    expect(rows.length).toBe(1)
    expect((rows[0] as any).bounce_count).toBe(2)
  })
})

describe('Suppression filters recipient selection', () => {
  it('excludes a suppressed address from the doxa audience, restored on un-suppress', async () => {
    const { auth } = await createAndLoginUser(sql, 'admin', { superadmin: true })

    const subscriber = await createTestSubscriber(sql, { name: 'Test Suppression Doxa' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    await sql`UPDATE contact_methods SET consent_doxa_general = true WHERE id = ${cm.id}`

    const countDoxa = async () =>
      (await $fetch<{ count: number }>('/api/admin/marketing/audience/doxa', auth)).count

    const before = await countDoxa()

    // Hard bounce removes the address from the audience.
    await postEvent({ event: 'failed', severity: 'permanent', recipient: cm.value })
    expect(await countDoxa()).toBe(before - 1)

    // Admin un-suppression restores it.
    const removed = await $fetch<{ success: boolean }>(
      `/api/admin/email-suppressions/${encodeURIComponent(cm.value)}`,
      { method: 'DELETE', ...auth }
    )
    expect(removed.success).toBe(true)
    expect(await countDoxa()).toBe(before)
  })
})

describe('Suppression surfaces on the contact record', () => {
  it('flags the email and writes a subscriber activity entry', async () => {
    const { auth } = await createAdminUser(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Suppression Record' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })

    await postEvent({
      event: 'failed',
      severity: 'permanent',
      recipient: cm.value,
      'delivery-status': { message: 'no such user' }
    })

    const { subscriber: detail } = await $fetch<{ subscriber: any }>(
      `/api/admin/subscribers/${subscriber.id}`,
      auth
    )
    expect(detail.email_suppression?.reason).toBe('hard_bounce')
    const emailContact = detail.contacts.find((c: any) => c.type === 'email')
    expect(emailContact?.suppression?.reason).toBe('hard_bounce')

    const { activities } = await $fetch<{ activities: any[] }>(
      `/api/admin/activity/subscribers/${subscriber.id}`,
      auth
    )
    const entry = activities.find(a => a.metadata?.badge === 'Email Suppressed')
    expect(entry).toBeTruthy()
    expect(entry.metadata.email).toBe(cm.value.toLowerCase())
    expect(entry.metadata.reason).toBe('hard_bounce')
  })
})

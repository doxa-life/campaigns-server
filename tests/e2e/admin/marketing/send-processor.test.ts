import { describe, it, expect, afterEach, afterAll, vi } from 'vitest'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroup
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'

// Stub the outbound transport so the processor never makes a real SMTP/Mailgun call.
// vi.hoisted runs before the imports below, so the mock factory can reference the spy.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn(async () => true) }))
vi.mock('../../../../server/utils/marketing-email-sender', () => ({
  sendMarketingEmail: sendMock,
  buildMarketingFrom: (name: string, localPart: string) => `${name} <${localPart}@mail.example.com>`
}))

import { processMarketingEmail } from '../../../../server/jobs/processors/marketing-email'
import { contactMethodService } from '../../../../server/database/contact-methods'
import { marketingEmailService } from '../../../../server/database/marketing-emails'
import { marketingEmailSentService } from '../../../../server/database/marketing-email-sent'

const sql = getTestDatabase()

const CONTENT = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }] }

// Build the per-recipient job the queue would hand to the processor.
function jobFor(emailId: number, cm: { id: number; value: string }) {
  return {
    payload: { marketing_email_id: emailId, contact_method_id: cm.id, recipient_email: cm.value }
  } as any
}

// A marketing email in the 'queued' state, owned by a fresh admin.
async function makeQueuedEmail(audienceType: string, peopleGroupId: number | null = null) {
  const admin = await createAdminUser(sql)
  const email = await marketingEmailService.create({
    subject: 'Spring Update',
    content_json: CONTENT,
    audience_type: audienceType as any,
    people_group_id: peopleGroupId,
    created_by: admin.user.id
  })
  await marketingEmailService.updateStatus(email.id, 'queued')
  return email
}

// A verified email contact, with optional marketing consents granted.
async function makeContact(consents: { doxa?: boolean; product?: boolean } = {}) {
  const subscriber = await createTestSubscriber(sql, { name: 'Test Processor Sub' })
  const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
  if (consents.doxa) await contactMethodService.updateDoxaConsent(cm.id, true)
  if (consents.product === false) await contactMethodService.updateProductEmailsConsent(cm.id, false)
  return { subscriber, cm }
}

// How many per-recipient "sent" claim rows exist for an address.
async function claimCount(recipientEmail: string) {
  const [row] = await sql`
    SELECT COUNT(*)::int AS n FROM activity_logs
    WHERE event_type = 'MARKETING_EMAIL_SENT' AND metadata->>'recipient_email' = ${recipientEmail}
  `
  return Number(row?.n ?? 0)
}

afterEach(async () => {
  // Per-recipient claim rows aren't matched by cleanupTestData's name-based deletes.
  await sql`DELETE FROM activity_logs WHERE event_type = 'MARKETING_EMAIL_SENT' AND metadata->>'recipient_email' ILIKE 'test-%@example.com'`
  await cleanupTestData(sql)
  sendMock.mockClear()
  sendMock.mockResolvedValue(true)
})

afterAll(async () => {
  await sql`DELETE FROM activity_logs WHERE event_type = 'MARKETING_EMAIL_SENT' AND metadata->>'recipient_email' ILIKE 'test-%@example.com'`
  await cleanupTestData(sql)
  await closeTestDatabase()
})

// ── H2: consent is re-checked at send time, not only when the audience was built ──
describe('processMarketingEmail — consent re-check (H2)', () => {
  it('skips a recipient who unsubscribed between queue and processing', async () => {
    const email = await makeQueuedEmail('doxa')
    const { cm } = await makeContact({ doxa: true })

    // They opt out after the campaign was queued.
    await contactMethodService.updateDoxaConsent(cm.id, false)

    const result = await processMarketingEmail(jobFor(email.id, cm))

    expect(result).toEqual({ success: true, data: { skipped: 'unsubscribed' } })
    expect(sendMock).not.toHaveBeenCalled()
    expect(await claimCount(cm.value)).toBe(0)
  })

  it('sends to a recipient whose consent is still intact', async () => {
    const email = await makeQueuedEmail('doxa')
    const { cm } = await makeContact({ doxa: true })

    const result = await processMarketingEmail(jobFor(email.id, cm))

    expect(result.success).toBe(true)
    expect((result.data as any)?.skipped).toBeUndefined()
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(await claimCount(cm.value)).toBe(1)
  })

  it('skips a people-group recipient who removed their people-group consent', async () => {
    const pg = await createTestPeopleGroup(sql)
    const email = await makeQueuedEmail('people_group', (pg as any).id)
    const { cm } = await makeContact()

    await contactMethodService.addPeopleGroupConsent(cm.id, (pg as any).id)
    await contactMethodService.removePeopleGroupConsent(cm.id, (pg as any).id)

    const result = await processMarketingEmail(jobFor(email.id, cm))

    expect((result.data as any)?.skipped).toBe('unsubscribed')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does NOT apply the consent re-check to the "pick" testing audience', async () => {
    const email = await makeQueuedEmail('pick')
    const { cm } = await makeContact()
    // Revoke every marketing consent — pick must still send (it is the deliberate override).
    await contactMethodService.updateDoxaConsent(cm.id, false)
    await contactMethodService.updateProductEmailsConsent(cm.id, false)

    const result = await processMarketingEmail(jobFor(email.id, cm))

    expect(result.success).toBe(true)
    expect((result.data as any)?.skipped).toBeUndefined()
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT apply the consent re-check to the "admins" audience', async () => {
    const email = await makeQueuedEmail('admins')
    const { cm } = await makeContact()
    await contactMethodService.updateDoxaConsent(cm.id, false)
    await contactMethodService.updateProductEmailsConsent(cm.id, false)

    const result = await processMarketingEmail(jobFor(email.id, cm))

    expect(result.success).toBe(true)
    expect((result.data as any)?.skipped).toBeUndefined()
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})

// ── H3: each recipient is sent at most once, even if the job is re-claimed ──
describe('processMarketingEmail — per-recipient idempotency (H3)', () => {
  it('sends once and skips a re-queued duplicate job for the same recipient', async () => {
    const email = await makeQueuedEmail('doxa')
    const { cm } = await makeContact({ doxa: true })

    const first = await processMarketingEmail(jobFor(email.id, cm))
    expect(first.success).toBe(true)
    expect((first.data as any)?.skipped).toBeUndefined()

    // Same recipient + same campaign re-processed (reaper requeue / retry).
    const second = await processMarketingEmail(jobFor(email.id, cm))
    expect(second).toEqual({ success: true, data: { skipped: 'already_sent' } })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(await claimCount(cm.value)).toBe(1)
  })

  it('releases the claim on a returned send failure so a retry can re-send', async () => {
    const email = await makeQueuedEmail('doxa')
    const { cm } = await makeContact({ doxa: true })

    // Provider rejects the first attempt.
    sendMock.mockResolvedValueOnce(false)
    await expect(processMarketingEmail(jobFor(email.id, cm))).rejects.toThrow()

    // The claim was released, so the address is not stuck as "already sent".
    expect(await claimCount(cm.value)).toBe(0)

    // The queue's retry re-sends successfully.
    const retry = await processMarketingEmail(jobFor(email.id, cm))
    expect(retry.success).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(2)
    expect(await claimCount(cm.value)).toBe(1)
  })

  it('keeps the claim (does not re-send) when a recipient is also suppressed', async () => {
    const email = await makeQueuedEmail('doxa')
    const { cm } = await makeContact({ doxa: true })

    // Suppressed (hard bounce / complaint) after enqueue → skipped before the claim.
    await contactMethodService.suppressByEmail(cm.value, 'hard_bounce')

    const result = await processMarketingEmail(jobFor(email.id, cm))

    expect(result).toEqual({ success: true, data: { skipped: 'suppressed' } })
    expect(sendMock).not.toHaveBeenCalled()
    expect(await claimCount(cm.value)).toBe(0)
  })
})

// ── H2 predicate, exercised directly (robust even apart from the processor) ──
describe('contactMethodService.stillConsentsToAudience (H2 predicate)', () => {
  it('mirrors each audience-selection consent rule', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Predicate Sub' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    const pg = await createTestPeopleGroup(sql)
    const pgId = (pg as any).id

    // doxa / doxa_active_pg → consent_doxa_general
    await contactMethodService.updateDoxaConsent(cm.id, true)
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'doxa')).toBe(true)
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'doxa_active_pg')).toBe(true)
    await contactMethodService.updateDoxaConsent(cm.id, false)
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'doxa')).toBe(false)
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'doxa_active_pg')).toBe(false)

    // active_pg → consent_product_emails (defaults true)
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'active_pg')).toBe(true)
    await contactMethodService.updateProductEmailsConsent(cm.id, false)
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'active_pg')).toBe(false)

    // people_group → membership of the consented people-group array
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'people_group', pgId)).toBe(false)
    await contactMethodService.addPeopleGroupConsent(cm.id, pgId)
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'people_group', pgId)).toBe(true)

    // unknown / admins-style audience → no opt-out signal to honor → true
    expect(await contactMethodService.stillConsentsToAudience(cm.id, 'admins')).toBe(true)
  })

  it('returns false for a non-email contact method even if a consent flag is set', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Predicate Phone' })
    const phone = await createTestContactMethod(sql, subscriber.id, { type: 'phone', value: '+15551234567' })
    await contactMethodService.updateDoxaConsent(phone.id, true)
    expect(await contactMethodService.stillConsentsToAudience(phone.id, 'doxa')).toBe(false)
  })

  it('returns false for a missing contact method', async () => {
    expect(await contactMethodService.stillConsentsToAudience(999_999_999, 'doxa')).toBe(false)
  })
})

// ── H3 idempotency primitive, exercised directly ──
describe('marketingEmailSentService claim/release (H3 primitive)', () => {
  it('claims a recipient once, rejects the duplicate, and re-allows after release', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Claim Sub' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    const params = {
      marketingEmailId: 987_654,
      contactMethodId: cm.id,
      recipientEmail: cm.value,
      subscriberId: subscriber.id,
      subject: 'Hi'
    }

    expect(await marketingEmailSentService.claim(params)).toBe(true)
    expect(await marketingEmailSentService.claim(params)).toBe(false)

    await marketingEmailSentService.release(params.marketingEmailId, params.recipientEmail)
    expect(await marketingEmailSentService.claim(params)).toBe(true)
  })

  it('is keyed per campaign and per recipient, case-insensitively', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Claim Indep' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    const base = { contactMethodId: cm.id, subscriberId: subscriber.id, subject: 'A' }

    expect(await marketingEmailSentService.claim({ ...base, marketingEmailId: 1, recipientEmail: cm.value })).toBe(true)
    // Different campaign, same recipient → independent claim.
    expect(await marketingEmailSentService.claim({ ...base, marketingEmailId: 2, recipientEmail: cm.value })).toBe(true)
    // Same campaign, same address in a different case → already claimed.
    expect(await marketingEmailSentService.claim({ ...base, marketingEmailId: 1, recipientEmail: cm.value.toUpperCase() })).toBe(false)
  })

  it('writes a subscriber-scoped timeline row carrying the email subject', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Claim Timeline' })
    const cm = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })

    await marketingEmailSentService.claim({
      marketingEmailId: 555,
      contactMethodId: cm.id,
      recipientEmail: cm.value,
      subscriberId: subscriber.id,
      subject: 'Our Spring Update'
    })

    const [row] = await sql`
      SELECT event_type, table_name, record_id, metadata FROM activity_logs
      WHERE event_type = 'MARKETING_EMAIL_SENT' AND metadata->>'recipient_email' = ${cm.value}
    `
    expect(row).toBeDefined()
    expect(row.table_name).toBe('subscribers')
    expect(row.record_id).toBe(String(subscriber.id))
    expect((row.metadata as any).message).toBe('Our Spring Update')
  })
})

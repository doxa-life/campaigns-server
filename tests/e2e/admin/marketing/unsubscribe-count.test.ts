import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber,
  createTestContactMethod
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'

const contentJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }

// A marketing email's unsubscribe_count is tallied when a recipient actually
// opts out via a link carrying `me=<emailId>` — through either the one-click
// List-Unsubscribe endpoint or the human-confirm profile PUT. The consent
// flip-guard means it only counts a real on→off flip, so it never double-counts.
describe('Marketing email unsubscribe_count', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  async function createEmail() {
    const created = await $fetch('/api/admin/marketing/emails', {
      method: 'POST',
      body: { subject: 'Unsub Count Email', content_json: contentJson, audience_type: 'doxa' },
      ...adminAuth
    })
    return created.email.id as number
  }

  async function unsubscribeCount(id: number) {
    const detail = await $fetch(`/api/admin/marketing/emails/${id}`, adminAuth)
    return detail.email.unsubscribe_count as number
  }

  // Subscriber with a verified email that has opted in to Doxa general updates.
  async function makeDoxaConsentedSubscriber() {
    const subscriber = await createTestSubscriber(sql, { name: 'Unsub Tester' })
    const contact = await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
    await sql`UPDATE contact_methods SET consent_doxa_general = true WHERE id = ${contact.id}`
    return subscriber
  }

  it('one-click opt-out increments the count once and is idempotent on re-POST', async () => {
    const emailId = await createEmail()
    const subscriber = await makeDoxaConsentedSubscriber()

    expect(await unsubscribeCount(emailId)).toBe(0)

    await $fetch('/api/marketing/unsubscribe', {
      method: 'POST',
      query: { id: subscriber.profile_id, type: 'doxa', me: emailId }
    })

    expect(await unsubscribeCount(emailId)).toBe(1)

    // Consent is now off; re-POSTing the same one-click link must not count again.
    await $fetch('/api/marketing/unsubscribe', {
      method: 'POST',
      query: { id: subscriber.profile_id, type: 'doxa', me: emailId }
    })

    expect(await unsubscribeCount(emailId)).toBe(1)
  })

  it('human-confirm opt-out (profile PUT) increments the count', async () => {
    const emailId = await createEmail()
    const subscriber = await makeDoxaConsentedSubscriber()

    await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { consent_doxa_general: false, marketing_email_id: emailId }
    })

    expect(await unsubscribeCount(emailId)).toBe(1)
  })

  it('does not count a profile consent change that carries no marketing_email_id', async () => {
    const emailId = await createEmail()
    const subscriber = await makeDoxaConsentedSubscriber()

    // In-page preference toggle: same endpoint, but no email attribution.
    await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { consent_doxa_general: false }
    })

    expect(await unsubscribeCount(emailId)).toBe(0)
  })
})

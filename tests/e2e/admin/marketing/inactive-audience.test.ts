import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroupSubscription
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'

describe('Marketing inactive-subscribers audience (doxa_inactive_pg)', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let peopleGroup: { id: number; slug: string }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
    peopleGroup = await createTestPeopleGroup(sql) as any
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  async function getCount(): Promise<number> {
    const response = await $fetch<{ count: number }>('/api/admin/marketing/audience/doxa-inactive-pg', adminAuth)
    return response.count
  }

  async function createConsentedContact(subscriberId: number, consent = true) {
    const contact = await createTestContactMethod(sql, subscriberId, { verified: true })
    if (consent) {
      await sql`UPDATE contact_methods SET consent_doxa_general = true WHERE id = ${contact.id}`
    }
    return contact
  }

  it('counts a consented contact whose email subscription lapsed to inactive', async () => {
    const baseline = await getCount()

    const subscriber = await createTestSubscriber(sql, { name: 'Test Inactive Lapsed' })
    await createConsentedContact(subscriber.id)
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, { status: 'inactive' })

    expect(await getCount()).toBe(baseline + 1)

    // Still holding an active subscription elsewhere disqualifies the contact —
    // they belong in the active audience, not the re-engagement one.
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      status: 'active',
      time_preference: '20:00'
    })

    expect(await getCount()).toBe(baseline)
  })

  it('excludes deliberate unsubscribes, app-only inactivity, and non-consented contacts', async () => {
    const baseline = await getCount()

    // Unsubscribed is an explicit opt-out, not a lapse.
    const unsubscribed = await createTestSubscriber(sql, { name: 'Test Inactive Unsubscribed' })
    await createConsentedContact(unsubscribed.id)
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, unsubscribed.id, { status: 'unsubscribed' })

    // App-delivery lapses are out of scope for an email re-engagement audience.
    const appOnly = await createTestSubscriber(sql, { name: 'Test Inactive App Only' })
    await createConsentedContact(appOnly.id)
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, appOnly.id, {
      status: 'inactive',
      delivery_method: 'app'
    })

    // Without Doxa marketing consent the contact may not receive this audience.
    const noConsent = await createTestSubscriber(sql, { name: 'Test Inactive No Consent' })
    await createConsentedContact(noConsent.id, false)
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, noConsent.id, { status: 'inactive' })

    expect(await getCount()).toBe(baseline)
  })

  it('accepts doxa_inactive_pg as an audience and renders the resubscribe button in preview', async () => {
    const created = await $fetch<{ email: { id: number } }>('/api/admin/marketing/emails', {
      method: 'POST',
      body: {
        subject: 'Test Inactive Newsletter',
        audience_type: 'doxa_inactive_pg',
        content_json: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'We miss you!' }] },
            { type: 'resubscribeButton', content: [{ type: 'text', text: 'Restart my prayer reminders' }] }
          ]
        }
      },
      ...adminAuth
    })

    expect(created.email.id).toBeDefined()

    const preview = await $fetch<{ html: string; text: string }>(
      `/api/admin/marketing/emails/${created.email.id}/preview`,
      adminAuth
    )

    expect(preview.html).toContain('Restart my prayer reminders')
    expect(preview.html).toContain('/subscriber?id=preview&amp;resume=1')
    expect(preview.text).toContain('Restart my prayer reminders: ')
    expect(preview.text).toContain('/subscriber?id=preview&resume=1')
  })
})

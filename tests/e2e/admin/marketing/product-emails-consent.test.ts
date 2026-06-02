import { describe, it, expect, afterAll, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroup,
  createTestPeopleGroupSubscription
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'

const sql = getTestDatabase()

async function activePgCount(auth: { headers: { cookie: string } }) {
  const res = await $fetch<{ count: number }>('/api/admin/marketing/audience/active-pg', auth)
  return res.count
}

// An "active subscriber": verified email + an active people-group subscription.
async function makeActiveSubscriber() {
  const subscriber = await createTestSubscriber(sql, { name: 'Test Product Consent' })
  await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })
  const pg = await createTestPeopleGroup(sql)
  await createTestPeopleGroupSubscription(sql, (pg as any).id, subscriber.id, { status: 'active' })
  return subscriber
}

afterEach(async () => {
  await cleanupTestData(sql)
})

afterAll(async () => {
  await closeTestDatabase()
})

describe('Product-emails consent', () => {
  it('defaults to opted-in and round-trips through the profile API', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Product Profile' })
    await createTestContactMethod(sql, subscriber.id, { type: 'email', verified: true })

    const before = await $fetch<{ consents: { product_emails: boolean } }>(`/api/profile/${subscriber.profile_id}`)
    expect(before.consents.product_emails).toBe(true)

    await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { consent_product_emails: false }
    })

    const after = await $fetch<{ consents: { product_emails: boolean } }>(`/api/profile/${subscriber.profile_id}`)
    expect(after.consents.product_emails).toBe(false)
  })

  it('excludes opted-out contacts from the active_pg audience', async () => {
    const { auth } = await createAdminUser(sql)
    const subscriber = await makeActiveSubscriber()

    const withConsent = await activePgCount(auth)

    // Opt out of product emails (e.g. via the survey email's one-click link).
    await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { consent_product_emails: false }
    })

    const afterOptOut = await activePgCount(auth)
    expect(afterOptOut).toBe(withConsent - 1)

    // Opting back in restores them.
    await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { consent_product_emails: true }
    })
    expect(await activePgCount(auth)).toBe(withConsent)
  })
})

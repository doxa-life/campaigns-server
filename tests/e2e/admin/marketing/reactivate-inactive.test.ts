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
import { createAdminUser, createEditorUser } from '../../../helpers/auth'

describe('Reactivate inactive subscribers', async () => {
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

  async function createSubscriberWithSubscription(name: string, status: 'inactive' | 'unsubscribed', consent = true) {
    const subscriber = await createTestSubscriber(sql, { name })
    const contact = await createTestContactMethod(sql, subscriber.id, { verified: true })
    if (consent) {
      await sql`UPDATE contact_methods SET consent_doxa_general = true WHERE id = ${contact.id}`
    }
    const subscription = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, { status })
    return { subscriber, subscription }
  }

  async function statusOf(id: number): Promise<string> {
    const [row] = await sql`SELECT status FROM campaign_subscriptions WHERE id = ${id}`
    return row!.status
  }

  it('lists the inactive-with-consent audience and nobody who unsubscribed', async () => {
    const lapsed = await createSubscriberWithSubscription('Test Reactivate Lapsed', 'inactive')
    const unsubscribed = await createSubscriberWithSubscription('Test Reactivate Unsubscribed', 'unsubscribed')
    const noConsent = await createSubscriberWithSubscription('Test Reactivate No Consent', 'inactive', false)

    const res = await $fetch<{ subscriptions: Array<{ id: number }> }>('/api/admin/subscriptions/inactive', adminAuth)
    const ids = res.subscriptions.map(s => s.id)

    expect(ids).toContain(lapsed.subscription.id)
    expect(ids).not.toContain(unsubscribed.subscription.id)
    expect(ids).not.toContain(noConsent.subscription.id)

    // The list matches the doxa_inactive_pg marketing audience it is built from.
    const audience = await $fetch<{ count: number }>('/api/admin/marketing/audience/doxa-inactive-pg', adminAuth)
    expect(new Set((res as any).subscriptions.map((s: any) => s.subscriber_id)).size).toBe(audience.count)
  })

  it('reactivates the requested rows and refuses unsubscribed ones', async () => {
    const lapsed = await createSubscriberWithSubscription('Test Reactivate Selected', 'inactive')
    const unsubscribed = await createSubscriberWithSubscription('Test Reactivate Opted Out', 'unsubscribed')

    const res = await $fetch<{ reactivated_count: number; subscription_ids: number[] }>('/api/admin/subscriptions/reactivate', {
      method: 'POST',
      body: { subscription_ids: [lapsed.subscription.id, unsubscribed.subscription.id] },
      ...adminAuth
    })

    expect(res.subscription_ids).toEqual([lapsed.subscription.id])
    expect(await statusOf(lapsed.subscription.id)).toBe('active')
    expect(await statusOf(unsubscribed.subscription.id)).toBe('unsubscribed')

    const [row] = await sql`SELECT next_reminder_utc FROM campaign_subscriptions WHERE id = ${lapsed.subscription.id}`
    expect(row!.next_reminder_utc).not.toBeNull()
  })

  it('reactivates every one of a subscriber\'s inactive prayer times together', async () => {
    const { subscriber, subscription: first } = await createSubscriberWithSubscription('Test Reactivate Two Times', 'inactive')
    const second = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      status: 'inactive',
      time_preference: '20:00'
    })

    await $fetch('/api/admin/subscriptions/reactivate', { method: 'POST', body: {}, ...adminAuth })

    expect(await statusOf(first.id)).toBe('active')
    expect(await statusOf(second.id)).toBe('active')
  })

  it('requires subscribers.edit', async () => {
    const editor = await createEditorUser(sql)
    await expect(
      $fetch('/api/admin/subscriptions/reactivate', { method: 'POST', body: {}, ...editor.auth })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestPeopleGroupSubscription,
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'

describe('GET /api/admin/subscriptions/utm-sources', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('requires authentication', async () => {
    const error = await $fetch('/api/admin/subscriptions/utm-sources').catch(e => e)
    expect(error.statusCode).toBe(401)
  })

  it('lists each source with its signup count, most common first', async () => {
    const stamp = Date.now()
    const popular = `site-${stamp}`
    const rare = `flyer-${stamp}`
    const pg = await createTestPeopleGroup(sql)

    const subscribers = await Promise.all([
      createTestSubscriber(sql, { name: 'Source A' }),
      createTestSubscriber(sql, { name: 'Source B' }),
      createTestSubscriber(sql, { name: 'Source C' }),
      createTestSubscriber(sql, { name: 'Source D' }),
    ])
    for (const s of subscribers) {
      await createTestPeopleGroupSubscription(sql, pg.id, s.id)
    }
    await sql`UPDATE campaign_subscriptions SET utm_source = ${popular} WHERE subscriber_id IN ${sql([subscribers[0]!.id, subscribers[1]!.id])}`
    await sql`UPDATE campaign_subscriptions SET utm_source = ${rare}, status = 'unsubscribed' WHERE subscriber_id = ${subscribers[2]!.id}`

    const res = await $fetch<{ sources: { utm_source: string; signup_count: number }[] }>(
      '/api/admin/subscriptions/utm-sources',
      adminAuth
    )
    const mine = res.sources.filter(s => s.utm_source === popular || s.utm_source === rare)
    expect(mine).toEqual([
      { utm_source: popular, signup_count: 2 },
      { utm_source: rare, signup_count: 1 },
    ])
  })
})

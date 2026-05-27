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

describe('Subscribers cursor pagination', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let pg: { id: number; slug: string }
  const trackedIds: number[] = []
  const TOTAL = 12
  // Unique prefix so this test never collides with leftover test data.
  const prefix = `PagSub${Date.now()}`

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
    pg = await createTestPeopleGroup(sql, { title: 'Pagination PG' })

    for (let i = 0; i < TOTAL; i++) {
      const s = await createTestSubscriber(sql, { name: `${prefix}-${String(i).padStart(2, '0')}` })
      await createTestPeopleGroupSubscription(sql, pg.id, s.id)
      trackedIds.push(s.id)
      // small delay so created_at differs and ordering is deterministic
      await new Promise(r => setTimeout(r, 5))
    }
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('returns first page with nextCursor when more rows remain', async () => {
    const res = await $fetch<any>(`/api/admin/subscribers?limit=5&q=${prefix}`, adminAuth)
    expect(res.subscribers.length).toBe(5)
    expect(res.nextCursor).toBeTruthy()
  })

  it('walks all rows via the cursor without duplicates', async () => {
    const seen = new Set<number>()
    let cursor: string | null = null
    let pages = 0

    while (pages < 10) {
      const url = `/api/admin/subscribers?limit=5&q=${prefix}${cursor ? '&cursor=' + cursor : ''}`
      const res: any = await $fetch(url, adminAuth)
      for (const s of res.subscribers) {
        expect(seen.has(s.id)).toBe(false)
        seen.add(s.id)
      }
      cursor = res.nextCursor
      pages++
      if (!cursor) break
    }

    expect(seen.size).toBe(TOTAL)
  })

  it('orders by created_at DESC, id DESC', async () => {
    const res = await $fetch<any>(`/api/admin/subscribers?limit=50&q=${prefix}`, adminAuth)
    // Names are zero-padded; newest (highest index) should come first
    expect(res.subscribers[0].name).toBe(`${prefix}-11`)
    expect(res.subscribers[res.subscribers.length - 1].name).toBe(`${prefix}-00`)
  })
})

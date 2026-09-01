import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroupSubscription,
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'
import { encodeFilter, decodeFilter } from '#shared/crm/filter-codec'

describe('Subscribers filter builder', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let pg1: { id: number; slug: string }
  let pg2: { id: number; slug: string }
  let pg3: { id: number; slug: string }
  const created: number[] = []

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
    pg1 = await createTestPeopleGroup(sql, { title: 'PG One' })
    pg2 = await createTestPeopleGroup(sql, { title: 'PG Two' })
    pg3 = await createTestPeopleGroup(sql, { title: 'PG Three' })

    // Subscriber A: name "Filter Alice", verified email, doxa consent, sub to pg1
    const a = await createTestSubscriber(sql, { name: 'Filter Alice' })
    await sql`UPDATE subscribers SET country = 'NP', preferred_language = 'en', sources = ARRAY['contact'] WHERE id = ${a.id}`
    await createTestContactMethod(sql, a.id, { value: `a-${Date.now()}@x.test`, verified: true })
    await sql`UPDATE contact_methods SET consent_doxa_general = TRUE WHERE subscriber_id = ${a.id}`
    await createTestPeopleGroupSubscription(sql, pg1.id, a.id)
    created.push(a.id)

    // Subscriber B: name "Filter Bob", unverified email, no consent, sub to pg2
    const b = await createTestSubscriber(sql, { name: 'Filter Bob' })
    await sql`UPDATE subscribers SET country = 'IN', preferred_language = 'es', sources = ARRAY['adoption','signup'] WHERE id = ${b.id}`
    await createTestContactMethod(sql, b.id, { value: `b-${Date.now()}@x.test`, verified: false })
    await createTestPeopleGroupSubscription(sql, pg2.id, b.id)
    created.push(b.id)

    // Subscriber C: name "Other Carol", no contact methods, no subs (orphan)
    const c = await createTestSubscriber(sql, { name: 'Other Carol' })
    await sql`UPDATE subscribers SET country = 'NP' WHERE id = ${c.id}`
    created.push(c.id)

    // Subscriber D: only an inactive (auto-lapsed) sub
    const d = await createTestSubscriber(sql, { name: 'Filter Dana' })
    await createTestPeopleGroupSubscription(sql, pg3.id, d.id, { status: 'inactive' })
    created.push(d.id)

    // Subscriber E: unsubscribed + inactive subs — unsubscribed takes precedence
    const e = await createTestSubscriber(sql, { name: 'Filter Evan' })
    await createTestPeopleGroupSubscription(sql, pg3.id, e.id, { status: 'unsubscribed' })
    await createTestPeopleGroupSubscription(sql, pg3.id, e.id, { status: 'inactive' })
    created.push(e.id)

    // Subscriber F: pending + unsubscribed subs — pending takes precedence
    const f = await createTestSubscriber(sql, { name: 'Filter Fran' })
    await createTestPeopleGroupSubscription(sql, pg3.id, f.id, { status: 'pending' })
    await createTestPeopleGroupSubscription(sql, pg3.id, f.id, { status: 'unsubscribed' })
    created.push(f.id)
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  async function fetchWithFilter(rows: any[]) {
    const filter = encodeFilter({ v: 1, rows })
    const res = await $fetch<any>(`/api/admin/subscribers?filter=${filter}`, adminAuth)
    return res.subscribers
      .filter((s: any) => created.includes(s.id))
      .map((s: any) => s.name)
  }

  describe('codec round-trip', () => {
    it('encodes and decodes a non-trivial filter state', () => {
      const original = {
        v: 1 as const,
        rows: [
          { field: 'country', op: 'is' as const, value: 'NP' },
          { field: 'created_at', op: 'after' as const, value: '2026-01-01' },
        ],
      }
      const encoded = encodeFilter(original)
      const decoded = decodeFilter(encoded)
      expect(decoded).toEqual(original)
    })

    it('returns empty filter for invalid/empty input', () => {
      expect(decodeFilter('')).toEqual({ v: 1, rows: [] })
      expect(decodeFilter('not-base64')).toEqual({ v: 1, rows: [] })
    })
  })

  describe('text field operators', () => {
    it('contains matches partial name', async () => {
      const names = await fetchWithFilter([
        { field: 'name', op: 'contains', value: 'Filter' },
      ])
      expect(names).toContain('Filter Alice')
      expect(names).toContain('Filter Bob')
      expect(names).not.toContain('Other Carol')
    })

    it('eq matches exactly (case-insensitive)', async () => {
      const names = await fetchWithFilter([
        { field: 'name', op: 'eq', value: 'filter alice' },
      ])
      expect(names).toEqual(['Filter Alice'])
    })

    it('starts_with anchors at the beginning', async () => {
      const names = await fetchWithFilter([
        { field: 'name', op: 'starts_with', value: 'Other' },
      ])
      expect(names).toContain('Other Carol')
      expect(names).not.toContain('Filter Alice')
    })
  })

  describe('enum / enum-multi operators', () => {
    it('enum is filters by country', async () => {
      const names = await fetchWithFilter([
        { field: 'country', op: 'is', value: 'IN' },
      ])
      expect(names).toEqual(['Filter Bob'])
    })

    it('enum is_not excludes the value', async () => {
      const names = await fetchWithFilter([
        { field: 'country', op: 'is_not', value: 'IN' },
      ])
      expect(names).toContain('Filter Alice')
      expect(names).toContain('Other Carol')
      expect(names).not.toContain('Filter Bob')
    })

    it('enum-multi includes_any matches subscribers with any of the sources', async () => {
      const names = await fetchWithFilter([
        { field: 'sources', op: 'includes_any', value: ['adoption'] },
      ])
      expect(names).toEqual(['Filter Bob'])
    })

    it('enum-multi includes_all requires every value', async () => {
      const names = await fetchWithFilter([
        { field: 'sources', op: 'includes_all', value: ['adoption', 'signup'] },
      ])
      expect(names).toEqual(['Filter Bob'])
    })
  })

  describe('boolean operators (joined)', () => {
    it('email_verified is_true matches A', async () => {
      const names = await fetchWithFilter([
        { field: 'email_verified', op: 'is_true', value: null },
      ])
      expect(names).toContain('Filter Alice')
      expect(names).not.toContain('Filter Bob')
    })

    it('email_verified is_false matches B and C', async () => {
      const names = await fetchWithFilter([
        { field: 'email_verified', op: 'is_false', value: null },
      ])
      expect(names).toContain('Filter Bob')
      expect(names).toContain('Other Carol')
      expect(names).not.toContain('Filter Alice')
    })

    it('doxa_general_consent is_true matches A only', async () => {
      const names = await fetchWithFilter([
        { field: 'doxa_general_consent', op: 'is_true', value: null },
      ])
      expect(names).toEqual(['Filter Alice'])
    })
  })

  describe('derived subscriber status', () => {
    it('is active matches subscribers with any active sub', async () => {
      const names = await fetchWithFilter([
        { field: 'status', op: 'is', value: 'active' },
      ])
      expect(names).toContain('Filter Alice')
      expect(names).toContain('Filter Bob')
      expect(names).not.toContain('Filter Dana')
      expect(names).not.toContain('Filter Evan')
      expect(names).not.toContain('Filter Fran')
      expect(names).not.toContain('Other Carol')
    })

    it('is inactive matches only lapsed subscribers without an unsubscribed sub', async () => {
      const names = await fetchWithFilter([
        { field: 'status', op: 'is', value: 'inactive' },
      ])
      expect(names).toEqual(['Filter Dana'])
    })

    it('is unsubscribed — unsubscribed wins over inactive', async () => {
      const names = await fetchWithFilter([
        { field: 'status', op: 'is', value: 'unsubscribed' },
      ])
      expect(names).toEqual(['Filter Evan'])
    })

    it('is pending — pending wins over unsubscribed', async () => {
      const names = await fetchWithFilter([
        { field: 'status', op: 'is', value: 'pending' },
      ])
      expect(names).toEqual(['Filter Fran'])
    })

    it('is none matches subscribers with no subscriptions', async () => {
      const names = await fetchWithFilter([
        { field: 'status', op: 'is', value: 'none' },
      ])
      expect(names).toEqual(['Other Carol'])
    })

    it('is_not inactive excludes only the lapsed subscriber', async () => {
      const names = await fetchWithFilter([
        { field: 'status', op: 'is_not', value: 'inactive' },
      ])
      expect(names).not.toContain('Filter Dana')
      expect(names).toContain('Filter Alice')
      expect(names).toContain('Filter Evan')
      expect(names).toContain('Other Carol')
    })

    it('drops an invalid status value instead of erroring', async () => {
      const names = await fetchWithFilter([
        { field: 'status', op: 'is', value: 'bogus' },
        { field: 'name', op: 'eq', value: 'Filter Dana' },
      ])
      expect(names).toEqual(['Filter Dana'])
    })
  })

  describe('foreign-key operator', () => {
    it('subscribed_to_people_group is matches subs of that PG', async () => {
      const names = await fetchWithFilter([
        { field: 'subscribed_to_people_group', op: 'is', value: pg1.id },
      ])
      expect(names).toEqual(['Filter Alice'])
    })
  })

  describe('AND-joined rows', () => {
    it('combines multiple rows with AND', async () => {
      const names = await fetchWithFilter([
        { field: 'country', op: 'is', value: 'NP' },
        { field: 'email_verified', op: 'is_true', value: null },
      ])
      expect(names).toEqual(['Filter Alice'])
    })
  })

  describe('unknown fields are silently dropped', () => {
    it('does not crash on unknown field', async () => {
      const names = await fetchWithFilter([
        { field: 'definitely_not_a_field', op: 'is', value: 'x' },
        { field: 'country', op: 'is', value: 'IN' },
      ])
      expect(names).toEqual(['Filter Bob'])
    })
  })
})

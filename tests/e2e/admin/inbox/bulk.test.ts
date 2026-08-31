import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createTestUser, getAuthHeaders, type TestUser, type AuthHeaders } from '../../../helpers/auth'

describe('Inbox bulk actions', () => {
  const sql = getTestDatabase()
  let agent: TestUser
  let agentAuth: AuthHeaders

  const createdSubscriberIds: number[] = []
  const createdTagSlugs: string[] = []

  async function makeSubscriber(email: string): Promise<number> {
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, ${'Test Bulk ' + email})
      RETURNING id
    `
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${sub!.id}, 'email', ${email}, false)
    `
    createdSubscriberIds.push(sub!.id)
    return sub!.id as number
  }

  async function makeConversation(
    subscriberId: number,
    opts: { status?: string; needsReview?: boolean; tags?: string[] } = {},
  ) {
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [c] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject, needs_review, tags)
      VALUES (${subscriberId}, ${opts.status || 'open'}, ${token}, 'Bulk thread',
        ${opts.needsReview ?? false}, ${sql.json(opts.tags || [])})
      RETURNING *
    `
    return c as any
  }

  async function bulk(body: any, auth: AuthHeaders = agentAuth): Promise<{ updated: number }> {
    return $fetch('/api/admin/inbox/conversations/bulk', { method: 'POST', body, ...auth })
  }

  async function bulkStatusOf(ids: number[]): Promise<Record<number, any>> {
    const rows = await sql`SELECT id, status, assigned_user_id, needs_review, tags FROM conversations WHERE id = ANY(${ids})`
    const out: Record<number, any> = {}
    for (const r of rows) out[r.id] = r
    return out
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    agent = await createTestUser(sql, { email: `test-bulk-agent-${uuidv4().slice(0, 8)}@example.com` })
    await sql`UPDATE users SET roles = ARRAY['inbox_agent'] WHERE id = ${agent.id}`
    agentAuth = getAuthHeaders(agent)
  })

  afterAll(async () => {
    if (createdSubscriberIds.length) {
      await sql`DELETE FROM subscribers WHERE id = ANY(${createdSubscriberIds})`
    }
    for (const slug of createdTagSlugs) {
      await $fetch(`/api/admin/inbox/tags/${slug}`, { method: 'DELETE', ...agentAuth }).catch(() => {})
    }
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('closes several conversations at once and clears their review flags', async () => {
    const subId = await makeSubscriber(`bulk-close-${uuidv4().slice(0, 8)}@example.com`)
    const a = await makeConversation(subId, { status: 'open', needsReview: true })
    const b = await makeConversation(subId, { status: 'pending' })
    const c = await makeConversation(subId, { status: 'open' })

    const res = await bulk({ ids: [a.id, b.id, c.id], status: 'closed' })
    expect(res.updated).toBe(3)

    const rows = await bulkStatusOf([a.id, b.id, c.id])
    for (const id of [a.id, b.id, c.id]) {
      expect(rows[id].status).toBe('closed')
      expect(rows[id].needs_review).toBe(false)
    }
  })

  it('assigns and unassigns in bulk', async () => {
    const subId = await makeSubscriber(`bulk-assign-${uuidv4().slice(0, 8)}@example.com`)
    const a = await makeConversation(subId)
    const b = await makeConversation(subId)

    const res = await bulk({ ids: [a.id, b.id], assigned_user_id: agent.id })
    expect(res.updated).toBe(2)
    let rows = await bulkStatusOf([a.id, b.id])
    expect(rows[a.id].assigned_user_id).toBe(agent.id)
    expect(rows[b.id].assigned_user_id).toBe(agent.id)

    await bulk({ ids: [a.id, b.id], assigned_user_id: null })
    rows = await bulkStatusOf([a.id, b.id])
    expect(rows[a.id].assigned_user_id).toBeNull()
    expect(rows[b.id].assigned_user_id).toBeNull()
  })

  it('rejects an assignee without inbox access', async () => {
    const outsider = await createTestUser(sql, { email: `test-bulk-norole-${uuidv4().slice(0, 8)}@example.com` })
    const subId = await makeSubscriber(`bulk-badassign-${uuidv4().slice(0, 8)}@example.com`)
    const a = await makeConversation(subId)

    let status = 0
    try {
      await bulk({ ids: [a.id], assigned_user_id: outsider.id })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(400)
  })

  it('adds tags without duplicating or removing existing ones', async () => {
    const { tag } = await $fetch<{ tag: { slug: string } }>(
      '/api/admin/inbox/tags', { method: 'POST', body: { name: `Bulk ${uuidv4().slice(0, 6)}` }, ...agentAuth },
    )
    createdTagSlugs.push(tag.slug)

    const subId = await makeSubscriber(`bulk-tags-${uuidv4().slice(0, 8)}@example.com`)
    const bare = await makeConversation(subId)
    const tagged = await makeConversation(subId, { tags: ['keep-me'] })
    const already = await makeConversation(subId, { tags: [tag.slug] })

    const res = await bulk({ ids: [bare.id, tagged.id, already.id], add_tags: [tag.slug] })
    expect(res.updated).toBe(3)

    const rows = await bulkStatusOf([bare.id, tagged.id, already.id])
    expect(rows[bare.id].tags).toEqual([tag.slug])
    expect(rows[tagged.id].tags).toEqual(['keep-me', tag.slug])
    expect(rows[already.id].tags).toEqual([tag.slug])
  })

  it('rejects spam as a bulk status', async () => {
    const subId = await makeSubscriber(`bulk-spam-${uuidv4().slice(0, 8)}@example.com`)
    const a = await makeConversation(subId)

    let status = 0
    try {
      await bulk({ ids: [a.id], status: 'spam' })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(400)
  })

  it('requires ids and at least one action', async () => {
    const subId = await makeSubscriber(`bulk-empty-${uuidv4().slice(0, 8)}@example.com`)
    const a = await makeConversation(subId)

    for (const body of [{ status: 'closed' }, { ids: [], status: 'closed' }, { ids: [a.id] }]) {
      let status = 0
      try {
        await bulk(body)
      } catch (err: any) {
        status = err?.statusCode || err?.response?.status || 0
      }
      expect(status).toBe(400)
    }
  })

  it('skips ids that do not exist', async () => {
    const subId = await makeSubscriber(`bulk-missing-${uuidv4().slice(0, 8)}@example.com`)
    const a = await makeConversation(subId)

    const res = await bulk({ ids: [a.id, 99999999], status: 'pending' })
    expect(res.updated).toBe(1)
    const rows = await bulkStatusOf([a.id])
    expect(rows[a.id].status).toBe('pending')
  })

  it('caps the batch size', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    let status = 0
    try {
      await bulk({ ids, status: 'closed' })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(400)
  })

  it('rejects users without inbox.view', async () => {
    const noRole = await createTestUser(sql, { email: `test-bulk-view-${uuidv4().slice(0, 8)}@example.com` })
    let status = 0
    try {
      await bulk({ ids: [1], status: 'closed' }, getAuthHeaders(noRole))
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(403)
  })
})

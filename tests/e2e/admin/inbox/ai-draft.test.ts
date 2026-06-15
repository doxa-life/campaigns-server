import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createTestUser, getAuthHeaders, type TestUser, type AuthHeaders } from '../../../helpers/auth'

// AI drafting + knowledge capture. The drafting/extraction model calls are stubbed
// under VITEST (see ai-draft.ts / ai-knowledge-extract.ts), so these run offline.
describe('Inbox AI drafting', async () => {
  const sql = getTestDatabase()
  let agent: TestUser
  let agentAuth: AuthHeaders
  const createdSubscriberIds: number[] = []
  const createdEntryIds: number[] = []

  async function makeConversationWithInbound(): Promise<{ conversationId: number; subscriberId: number }> {
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, 'AI Draft Tester')
      RETURNING id
    `
    const subscriberId = sub!.id as number
    createdSubscriberIds.push(subscriberId)
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${subscriberId}, 'email', ${`ai-${uuidv4().slice(0, 8)}@example.com`}, true)
    `
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [c] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${subscriberId}, 'open', ${token}, 'How do I adopt?')
      RETURNING id
    `
    const conversationId = c!.id as number
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, body_text, body_html)
      VALUES (${conversationId}, 'inbound', 'received', 'tester@example.com',
              'Can a small church adopt a people group?', '<p>Can a small church adopt a people group?</p>')
    `
    return { conversationId, subscriberId }
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    agent = await createTestUser(sql, { email: `ai-agent-${uuidv4().slice(0, 8)}@example.com`, display_name: 'Grace' })
    await sql`UPDATE users SET roles = ARRAY['inbox_agent'], email_alias = ${'grace-' + uuidv4().slice(0, 6)} WHERE id = ${agent.id}`
    agentAuth = getAuthHeaders(agent)
  })

  afterAll(async () => {
    if (createdEntryIds.length) await sql`DELETE FROM inbox_knowledge_entries WHERE id = ANY(${createdEntryIds})`
    if (createdSubscriberIds.length) await sql`DELETE FROM subscribers WHERE id = ANY(${createdSubscriberIds})`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('generates an AI draft saved as an ai_generated draft message', async () => {
    const { conversationId } = await makeConversationWithInbound()
    const res = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}/draft-reply`, {
      method: 'POST', body: { direction: 'Ask them to sign up for a people group in their country.' }, ...agentAuth,
    })
    expect(res.draft).toBe(true)
    expect(res.message.ai_generated).toBe(true)
    expect(res.message.status).toBe('draft')
    expect(res.message.direction).toBe('outbound')
    expect(res.message.ai_metadata).toBeTruthy()
    expect(typeof res.message.ai_metadata.gloss).toBe('string')

    const detail = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}`, { ...agentAuth })
    expect(detail.drafts.some((d: any) => d.id === res.message.id && d.ai_generated)).toBe(true)
  })

  it('preview mode returns a draft without persisting a message', async () => {
    const { conversationId } = await makeConversationWithInbound()
    const before = await sql`SELECT count(*)::int AS n FROM conversation_messages WHERE conversation_id = ${conversationId} AND status = 'draft'`
    const res = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}/draft-reply`, {
      method: 'POST', body: { preview: true, direction: 'Keep it short.', base_draft: '<p>earlier attempt</p>' }, ...agentAuth,
    })
    expect(res.preview).toBe(true)
    expect(typeof res.draft_html).toBe('string')
    expect(res.draft_html.length).toBeGreaterThan(0)
    expect(typeof res.english_gloss).toBe('string')
    const after = await sql`SELECT count(*)::int AS n FROM conversation_messages WHERE conversation_id = ${conversationId} AND status = 'draft'`
    expect(after[0]!.n).toBe(before[0]!.n)
  })

  it('regenerate reuses the same draft slot (no orphans)', async () => {
    const { conversationId } = await makeConversationWithInbound()
    const first = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}/draft-reply`, {
      method: 'POST', body: {}, ...agentAuth,
    })
    const second = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}/draft-reply`, {
      method: 'POST', body: { draft_id: first.message.id }, ...agentAuth,
    })
    expect(second.message.id).toBe(first.message.id)
    expect(second.message.ai_generated).toBe(true)
    expect(typeof second.message.ai_metadata?.gloss).toBe('string')
    expect(second.message.from_email).toContain('grace-')
    const drafts = await sql`SELECT id FROM conversation_messages WHERE conversation_id = ${conversationId} AND status = 'draft'`
    expect(drafts.length).toBe(1)
  })

  it('never overwrites a human-written draft — its draft_id yields a new draft instead', async () => {
    const { conversationId } = await makeConversationWithInbound()
    const [human] = await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, body_html, body_text)
      VALUES (${conversationId}, 'outbound', 'draft', 'contact@doxa.life', '<p>Human words</p>', 'Human words')
      RETURNING id
    `
    const res = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}/draft-reply`, {
      method: 'POST', body: { draft_id: human!.id }, ...agentAuth,
    })
    expect(res.message.id).not.toBe(human!.id)
    expect(res.message.ai_generated).toBe(true)
    const [row] = await sql`SELECT body_text, ai_generated FROM conversation_messages WHERE id = ${human!.id}`
    expect(row!.body_text).toBe('Human words')
    expect(row!.ai_generated).toBe(false)
  })

  it('suggests, saves, lists, archives and deletes a knowledge entry', async () => {
    const { conversationId } = await makeConversationWithInbound()
    const suggestion = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}/knowledge-entry/suggest`, {
      method: 'POST', body: {}, ...agentAuth,
    })
    expect(typeof suggestion.question).toBe('string')
    expect(typeof suggestion.answer).toBe('string')
    expect(Array.isArray(suggestion.removed)).toBe(true)

    const created = await $fetch<any>('/api/admin/inbox/knowledge-entries', {
      method: 'POST',
      body: { question: suggestion.question, answer: suggestion.answer, language: suggestion.language, source_conversation_id: conversationId },
      ...agentAuth,
    })
    expect(created.entry.id).toBeTruthy()
    createdEntryIds.push(created.entry.id)

    const active = await $fetch<any>('/api/admin/inbox/knowledge-entries?status=active', { ...agentAuth })
    expect(active.entries.some((e: any) => e.id === created.entry.id)).toBe(true)

    await $fetch(`/api/admin/inbox/knowledge-entries/${created.entry.id}`, {
      method: 'PUT', body: { status: 'archived' }, ...agentAuth,
    })
    const afterArchive = await $fetch<any>('/api/admin/inbox/knowledge-entries?status=active', { ...agentAuth })
    expect(afterArchive.entries.some((e: any) => e.id === created.entry.id)).toBe(false)

    await $fetch(`/api/admin/inbox/knowledge-entries/${created.entry.id}`, { method: 'DELETE', ...agentAuth })
    const gone = await sql`SELECT id FROM inbox_knowledge_entries WHERE id = ${created.entry.id}`
    expect(gone.length).toBe(0)
  })

  it('rejects knowledge-entry updates that blank fields or carry an invalid status', async () => {
    const created = await $fetch<any>('/api/admin/inbox/knowledge-entries', {
      method: 'POST', body: { question: 'How long is an adoption?', answer: 'It is a long-term commitment.' }, ...agentAuth,
    })
    createdEntryIds.push(created.entry.id)

    for (const bad of [{ question: '  ' }, { answer: '' }, { status: 'deleted' }, { language: 'much-too-long' }]) {
      let status = 0
      try {
        await $fetch(`/api/admin/inbox/knowledge-entries/${created.entry.id}`, { method: 'PUT', body: bad, ...agentAuth })
      } catch (e: any) {
        status = e?.statusCode || e?.response?.status || 0
      }
      expect(status, `expected 400 for ${JSON.stringify(bad)}`).toBe(400)
    }

    const [row] = await sql`SELECT question, status FROM inbox_knowledge_entries WHERE id = ${created.entry.id}`
    expect(row!.question).toBe('How long is an adoption?')
    expect(row!.status).toBe('active')
  })

  it('refresh snapshots site pages (stubbed) and prunes de-listed ones', async () => {
    await sql`
      INSERT INTO grounding_documents (source, doc_key, title, body_text)
      VALUES ('doxa_page', 'removed-page', 'Old', 'Stale content')
      ON CONFLICT (source, doc_key) DO UPDATE SET body_text = 'Stale content'
    `
    const res = await $fetch<any>('/api/admin/inbox/grounding/refresh', { method: 'POST', ...agentAuth })
    expect(res.failed.length).toBe(0)
    expect(res.synced.length).toBeGreaterThan(0)
    expect(res.pruned).toBeGreaterThanOrEqual(1)

    const stale = await sql`SELECT id FROM grounding_documents WHERE source = 'doxa_page' AND doc_key = 'removed-page'`
    expect(stale.length).toBe(0)
    const [faq] = await sql`SELECT body_text FROM grounding_documents WHERE source = 'doxa_page' AND doc_key = 'about/faq'`
    expect(faq!.body_text).toContain('Stubbed marketing content')

    const [countries] = await sql`SELECT body_text FROM grounding_documents WHERE source = 'doxa_page' AND doc_key = 'countries'`
    expect(countries!.body_text).toContain('/countries/india')
  })

  it('blocks users without permission on every knowledge-base and grounding endpoint', async () => {
    const { conversationId } = await makeConversationWithInbound()
    const created = await $fetch<any>('/api/admin/inbox/knowledge-entries', {
      method: 'POST', body: { question: 'Perm Q', answer: 'Perm A' }, ...agentAuth,
    })
    createdEntryIds.push(created.entry.id)

    const outsider = await createTestUser(sql, { email: `test-outsider-${uuidv4().slice(0, 8)}@example.com` })
    const outsiderAuth = getAuthHeaders(outsider)

    const calls: [string, string, object?][] = [
      ['GET', '/api/admin/inbox/knowledge-entries'],
      ['POST', '/api/admin/inbox/knowledge-entries', { question: 'q', answer: 'a' }],
      ['PUT', `/api/admin/inbox/knowledge-entries/${created.entry.id}`, { question: 'x' }],
      ['DELETE', `/api/admin/inbox/knowledge-entries/${created.entry.id}`],
      ['POST', `/api/admin/inbox/conversations/${conversationId}/knowledge-entry/suggest`, {}],
      ['POST', '/api/admin/inbox/grounding/refresh'],
    ]
    for (const [method, url, body] of calls) {
      let status = 0
      try {
        await $fetch(url, { method: method as any, body, ...outsiderAuth })
      } catch (e: any) {
        status = e?.statusCode || e?.response?.status || 0
      }
      expect(status, `${method} ${url}`).toBe(403)
    }

    const [still] = await sql`SELECT id FROM inbox_knowledge_entries WHERE id = ${created.entry.id}`
    expect(still).toBeTruthy()
  })

  it('returns 404 for missing resources and 400 for an incomplete create', async () => {
    const cases: [string, string, object | undefined, number][] = [
      ['POST', '/api/admin/inbox/conversations/999999/draft-reply', {}, 404],
      ['PUT', '/api/admin/inbox/knowledge-entries/999999', { question: 'x' }, 404],
      ['DELETE', '/api/admin/inbox/knowledge-entries/999999', undefined, 404],
      ['POST', '/api/admin/inbox/knowledge-entries', { question: 'only a question' }, 400],
    ]
    for (const [method, url, body, expected] of cases) {
      let status = 0
      try {
        await $fetch(url, { method: method as any, body, ...agentAuth })
      } catch (e: any) {
        status = e?.statusCode || e?.response?.status || 0
      }
      expect(status, `${method} ${url}`).toBe(expected)
    }
  })

  it('blocks a user without inbox.send from drafting', async () => {
    const { conversationId } = await makeConversationWithInbound()
    const outsider = await createTestUser(sql, { email: `outsider-${uuidv4().slice(0, 8)}@example.com`, display_name: 'No Access' })
    const outsiderAuth = getAuthHeaders(outsider)
    let status = 0
    try {
      await $fetch(`/api/admin/inbox/conversations/${conversationId}/draft-reply`, { method: 'POST', body: {}, ...outsiderAuth })
    } catch (e: any) {
      status = e?.statusCode || e?.response?.status || 0
    }
    expect(status).toBe(403)
  })
})

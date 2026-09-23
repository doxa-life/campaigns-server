import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createTestUser, getAuthHeaders, type TestUser, type AuthHeaders } from '../../../helpers/auth'

// The translation model call is stubbed under VITEST (see translate-message.ts), so these run offline.
describe('Inbox message translation', async () => {
  const sql = getTestDatabase()
  let agent: TestUser
  let agentAuth: AuthHeaders
  const createdSubscriberIds: number[] = []

  async function makeConversation(): Promise<{ conversationId: number; messageId: number }> {
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, 'Translate Tester')
      RETURNING id
    `
    createdSubscriberIds.push(sub!.id as number)
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [c] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${sub!.id}, 'open', ${token}, 'Pregunta')
      RETURNING id
    `
    const [m] = await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, body_text, body_html, body_stripped_html)
      VALUES (${c!.id}, 'inbound', 'received', 'tester@example.com',
              'Hola, ¿puedo adoptar un grupo?\n\n> quoted history',
              '<p>Hola, ¿puedo adoptar un grupo?</p><blockquote>quoted history</blockquote>',
              '<p>Hola, ¿puedo adoptar un grupo?</p>')
      RETURNING id
    `
    return { conversationId: c!.id as number, messageId: m!.id as number }
  }

  function translateUrl(conversationId: number, messageId: number) {
    return `/api/admin/inbox/conversations/${conversationId}/messages/${messageId}/translate`
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    agent = await createTestUser(sql, { email: `tr-agent-${uuidv4().slice(0, 8)}@example.com`, display_name: 'Lydia' })
    await sql`UPDATE users SET roles = ARRAY['inbox_agent'] WHERE id = ${agent.id}`
    agentAuth = getAuthHeaders(agent)
  })

  afterAll(async () => {
    if (createdSubscriberIds.length) await sql`DELETE FROM subscribers WHERE id = ANY(${createdSubscriberIds})`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('translates the visible text without quoted history and saves it on the message', async () => {
    const { conversationId, messageId } = await makeConversation()
    const res = await $fetch<any>(translateUrl(conversationId, messageId), {
      method: 'POST', body: { language_code: 'en' }, ...agentAuth,
    })
    const saved = res.message.translations.en
    expect(saved.text).toBe('[en] Hola, ¿puedo adoptar un grupo?')
    expect(saved.source_language).toBeTruthy()
    expect(saved.created_by).toBe(agent.id)

    const detail = await $fetch<any>(`/api/admin/inbox/conversations/${conversationId}`, { ...agentAuth })
    const msg = detail.messages.find((m: any) => m.id === messageId)
    expect(msg.translations.en.text).toBe(saved.text)
  })

  it('reuses a saved translation unless forced, and keeps other languages when adding one', async () => {
    const { conversationId, messageId } = await makeConversation()
    const first = await $fetch<any>(translateUrl(conversationId, messageId), {
      method: 'POST', body: { language_code: 'en' }, ...agentAuth,
    })
    const again = await $fetch<any>(translateUrl(conversationId, messageId), {
      method: 'POST', body: { language_code: 'en' }, ...agentAuth,
    })
    expect(again.message.translations.en.created_at).toBe(first.message.translations.en.created_at)

    await new Promise(resolve => setTimeout(resolve, 5))
    const forced = await $fetch<any>(translateUrl(conversationId, messageId), {
      method: 'POST', body: { language_code: 'en', force: true }, ...agentAuth,
    })
    expect(forced.message.translations.en.created_at).not.toBe(first.message.translations.en.created_at)

    const withFrench = await $fetch<any>(translateUrl(conversationId, messageId), {
      method: 'POST', body: { language_code: 'fr' }, ...agentAuth,
    })
    expect(Object.keys(withFrench.message.translations).sort()).toEqual(['en', 'fr'])
  })

  it('rejects an unsupported language', async () => {
    const { conversationId, messageId } = await makeConversation()
    await expect($fetch(translateUrl(conversationId, messageId), {
      method: 'POST', body: { language_code: 'xx' }, ...agentAuth,
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('404s for a message that belongs to another conversation', async () => {
    const a = await makeConversation()
    const b = await makeConversation()
    await expect($fetch(translateUrl(a.conversationId, b.messageId), {
      method: 'POST', body: { language_code: 'en' }, ...agentAuth,
    })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('requires inbox access', async () => {
    const { conversationId, messageId } = await makeConversation()
    await expect($fetch(translateUrl(conversationId, messageId), {
      method: 'POST', body: { language_code: 'en' },
    })).rejects.toMatchObject({ statusCode: 401 })
  })
})

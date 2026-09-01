import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, type AuthHeaders } from '../../../helpers/auth'

// Deliverability visibility on the conversation detail: reply_email_status describes the
// address a reply will actually go to (last received inbound, else primary email), and the
// conversation row carries the displayed subscriber_email's own verified/suppression state.
describe('Inbox reply email status', async () => {
  const sql = getTestDatabase()
  let adminAuth: AuthHeaders

  const createdSubscriberIds: number[] = []
  const createdConversationIds: number[] = []

  async function makeSubscriber(email: string, opts: { verified?: boolean } = {}) {
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, ${'Test ReplyStatus ' + email})
      RETURNING id
    `
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${sub!.id}, 'email', ${email}, ${opts.verified ?? false})
    `
    createdSubscriberIds.push(sub!.id)
    return sub!.id as number
  }

  async function makeConversation(subscriberId: number | null) {
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [c] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${subscriberId}, 'open', ${token}, 'Reply status thread')
      RETURNING *
    `
    createdConversationIds.push(c!.id)
    return c as any
  }

  async function addInbound(conversationId: number, fromEmail: string, status: 'received' | 'held' = 'received') {
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, body_text)
      VALUES (${conversationId}, 'inbound', ${status}, ${fromEmail}, 'hello')
    `
  }

  function getDetail(id: number): Promise<any> {
    return $fetch(`/api/admin/inbox/conversations/${id}`, { ...adminAuth })
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
  })

  afterAll(async () => {
    if (createdConversationIds.length) {
      await sql`DELETE FROM conversations WHERE id = ANY(${createdConversationIds})`
    }
    if (createdSubscriberIds.length) {
      await sql`DELETE FROM subscribers WHERE id = ANY(${createdSubscriberIds})`
    }
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('reports an unverified sender with no suppression', async () => {
    const email = `reply-status-unv-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId)
    await addInbound(convo.id, email)

    const res = await getDetail(convo.id)
    expect(res.reply_email_status).toMatchObject({
      email,
      verified: false,
      suppressed_at: null,
      suppression_reason: null,
      bounce_count: 0,
    })
    expect(res.conversation.subscriber_email).toBe(email)
    expect(res.conversation.subscriber_email_verified).toBe(false)
  })

  it('reports suppression of the address that wrote in, while the header shows the verified primary', async () => {
    const primary = `reply-status-prim-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(primary, { verified: true })
    const suppressed = `reply-status-supp-${uuidv4().slice(0, 8)}@example.com`
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified, suppressed_at, suppression_reason, bounce_count)
      VALUES (${subId}, 'email', ${suppressed}, false, NOW(), 'hard_bounce', 2)
    `
    const convo = await makeConversation(subId)
    await addInbound(convo.id, suppressed)

    const res = await getDetail(convo.id)
    // The reply target is the suppressed address that last wrote in…
    expect(res.reply_email_status.email).toBe(suppressed)
    expect(res.reply_email_status.verified).toBe(false)
    expect(res.reply_email_status.suppressed_at).toBeTruthy()
    expect(res.reply_email_status.suppression_reason).toBe('hard_bounce')
    expect(res.reply_email_status.bounce_count).toBe(2)
    // …while the header still shows the subscriber's verified primary, with its own state.
    expect(res.conversation.subscriber_email).toBe(primary)
    expect(res.conversation.subscriber_email_verified).toBe(true)
    expect(res.conversation.subscriber_email_suppressed_at).toBeNull()
  })

  it('never treats a held (wrong-From) message as the reply target', async () => {
    const primary = `reply-status-real-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(primary, { verified: true })
    const convo = await makeConversation(subId)
    const attacker = `attacker-${uuidv4().slice(0, 6)}@evil.com`
    await addInbound(convo.id, attacker, 'held')

    const res = await getDetail(convo.id)
    expect(res.reply_email_status.email).toBe(primary)
    expect(res.reply_email_status.verified).toBe(true)
  })

  it('reports no deliverable address for a subscriber-less conversation', async () => {
    const convo = await makeConversation(null)
    await addInbound(convo.id, `orphan-${uuidv4().slice(0, 8)}@example.com`)

    const res = await getDetail(convo.id)
    expect(res.reply_email_status.email).toBeNull()
    expect(res.reply_email_status.verified).toBe(false)
  })
})

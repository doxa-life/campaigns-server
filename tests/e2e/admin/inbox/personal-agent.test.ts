import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, createTestUser, getAuthHeaders, type TestUser, type AuthHeaders } from '../../../helpers/auth'

const INBOX_DOMAIN = process.env.INBOX_DOMAIN || 'doxa.life'
const CONTACT_ADDRESS = process.env.INBOX_CONTACT_ADDRESS || `contact@${INBOX_DOMAIN}`

// A Personal Inbox Agent holds inbox.view / inbox.send in the assigned-only form: they see
// and act on conversations assigned to them (mail to their alias lands there), send only
// from that alias, and use but never manage the shared inbox resources.
describe('Personal inbox agent', async () => {
  const sql = getTestDatabase()
  let admin: TestUser
  let adminAuth: AuthHeaders
  let fullAgent: TestUser
  let fullAuth: AuthHeaders
  let agent: TestUser
  let agentAuth: AuthHeaders
  let agentAlias: string
  let noAlias: TestUser
  let noAliasAuth: AuthHeaders

  const createdSubscriberIds: number[] = []
  const createdTagSlugs: string[] = []

  // Conversations: one assigned to the personal agent, one to the full agent, one unassigned.
  let mine: any
  let theirs: any
  let unassigned: any

  function form(fields: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(fields)) params.append(k, v)
    return params
  }
  function headerJson(pairs: [string, string][]): string {
    return JSON.stringify(pairs)
  }
  async function postInbound(fields: Record<string, string>): Promise<any> {
    return $fetch('/api/webhooks/mailgun/inbound', { method: 'POST', body: form(fields) })
  }
  async function clearRecordedEmails(): Promise<void> {
    await $fetch('/api/test/recorded-emails', { method: 'DELETE' })
  }
  // Run the queued staff-notification jobs for one conversation and return what was "sent".
  async function drainNotifications(conversationId: number): Promise<{ processed: number; emails: any[] }> {
    return $fetch('/api/test/process-jobs', { method: 'POST', body: { conversation_id: conversationId, type: 'inbox_email' } })
  }

  async function makeSubscriber(email: string) {
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, ${'Test Personal ' + email})
      RETURNING id
    `
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${sub!.id}, 'email', ${email}, true)
    `
    createdSubscriberIds.push(sub!.id)
    return sub!.id as number
  }

  async function makeConversation(subscriberId: number, assignedUserId: string | null, subject = 'Scoped thread') {
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [c] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject, assigned_user_id)
      VALUES (${subscriberId}, 'open', ${token}, ${subject}, ${assignedUserId})
      RETURNING *
    `
    return c as any
  }

  async function makePersonalAgent(displayName: string, alias: string | null): Promise<TestUser> {
    const user = await createTestUser(sql, { email: `test-pia-${uuidv4().slice(0, 8)}@example.com`, display_name: displayName })
    await sql`UPDATE users SET roles = ARRAY['personal_inbox_agent'], email_alias = ${alias} WHERE id = ${user.id}`
    return user
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const adminResult = await createAdminUser(sql)
    admin = adminResult.user
    adminAuth = adminResult.auth

    fullAgent = await createTestUser(sql, { email: `test-full-${uuidv4().slice(0, 8)}@example.com`, display_name: 'Full Agent' })
    await sql`UPDATE users SET roles = ARRAY['inbox_agent'], email_alias = ${'full-' + uuidv4().slice(0, 6)} WHERE id = ${fullAgent.id}`
    fullAuth = getAuthHeaders(fullAgent)

    agentAlias = 'pia-' + uuidv4().slice(0, 6)
    agent = await makePersonalAgent('Priya Agent', agentAlias)
    agentAuth = getAuthHeaders(agent)

    noAlias = await makePersonalAgent('No Alias', null)
    noAliasAuth = getAuthHeaders(noAlias)

    const subMine = await makeSubscriber(`pia-mine-${uuidv4().slice(0, 8)}@example.com`)
    const subTheirs = await makeSubscriber(`pia-theirs-${uuidv4().slice(0, 8)}@example.com`)
    const subNobody = await makeSubscriber(`pia-nobody-${uuidv4().slice(0, 8)}@example.com`)
    mine = await makeConversation(subMine, agent.id, 'Mine')
    theirs = await makeConversation(subTheirs, fullAgent.id, 'Theirs')
    unassigned = await makeConversation(subNobody, null, 'Nobody')
  })

  afterAll(async () => {
    if (createdSubscriberIds.length) {
      await sql`DELETE FROM subscribers WHERE id = ANY(${createdSubscriberIds})`
    }
    for (const slug of createdTagSlugs) {
      await $fetch(`/api/admin/inbox/tags/${slug}`, { method: 'DELETE', ...adminAuth }).catch(() => {})
    }
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('is listed as a role', async () => {
    const res = await $fetch<{ roles: { name: string }[] }>('/api/admin/roles', adminAuth)
    expect(res.roles.map(r => r.name)).toContain('personal_inbox_agent')
  })

  it('lists only the conversations assigned to the agent, whatever scope filters are sent', async () => {
    const all = await $fetch<{ conversations: any[]; total: number }>('/api/admin/inbox/conversations', agentAuth)
    expect(all.conversations.map(c => c.id)).toEqual([mine.id])
    expect(all.total).toBe(1)

    const unassignedView = await $fetch<{ conversations: any[] }>('/api/admin/inbox/conversations', { params: { unassigned: 'true' }, ...agentAuth })
    expect(unassignedView.conversations).toEqual([])

    const someoneElse = await $fetch<{ conversations: any[] }>('/api/admin/inbox/conversations', { params: { assigned_user_id: fullAgent.id }, ...agentAuth })
    expect(someoneElse.conversations).toEqual([])

    // A full agent still sees the whole inbox.
    const full = await $fetch<{ conversations: any[] }>('/api/admin/inbox/conversations', fullAuth)
    const ids = full.conversations.map(c => c.id)
    expect(ids).toEqual(expect.arrayContaining([mine.id, theirs.id, unassigned.id]))
  })

  it('counts every folder within the agent\'s own conversations', async () => {
    const counts = await $fetch<any>('/api/admin/inbox/conversations/counts', { params: { mine: agent.id, scope: 'all' }, ...agentAuth })
    expect(counts.all).toBe(1)
    expect(counts.mine).toBe(1)
    expect(counts.unassigned).toBe(0)
    expect(counts.open).toBe(1)
  })

  it('treats a conversation assigned to someone else as missing', async () => {
    const own = await $fetch<any>(`/api/admin/inbox/conversations/${mine.id}`, agentAuth)
    expect(own.conversation.id).toBe(mine.id)

    for (const path of [
      `/api/admin/inbox/conversations/${theirs.id}`,
      `/api/admin/inbox/conversations/${theirs.id}/messages`,
      `/api/admin/inbox/conversations/${unassigned.id}`,
    ]) {
      const err = await $fetch(path, agentAuth).catch(e => e)
      expect(err.statusCode).toBe(404)
    }

    const put = await $fetch(`/api/admin/inbox/conversations/${theirs.id}`, { method: 'PUT', body: { status: 'closed' }, ...agentAuth }).catch(e => e)
    expect(put.statusCode).toBe(404)
    const tags = await $fetch(`/api/admin/inbox/conversations/${theirs.id}/tags`, { method: 'PUT', body: { tags: [] }, ...agentAuth }).catch(e => e)
    expect(tags.statusCode).toBe(404)
    const spam = await $fetch(`/api/admin/inbox/conversations/${theirs.id}/spam`, { method: 'POST', body: { spam: true }, ...agentAuth }).catch(e => e)
    expect(spam.statusCode).toBe(404)
    const reply = await $fetch(`/api/admin/inbox/conversations/${theirs.id}/messages`, { method: 'POST', body: { body_html: '<p>hi</p>', saveDraft: true }, ...agentAuth }).catch(e => e)
    expect(reply.statusCode).toBe(404)

    const [row] = await sql`SELECT status FROM conversations WHERE id = ${theirs.id}`
    expect(row!.status).toBe('open')
  })

  it('applies bulk actions only to the agent\'s own conversations', async () => {
    const res = await $fetch<{ updated: number }>('/api/admin/inbox/conversations/bulk', {
      method: 'POST', body: { ids: [mine.id, theirs.id, unassigned.id], status: 'pending' }, ...agentAuth,
    })
    expect(res.updated).toBe(1)
    const rows = await sql`SELECT id, status FROM conversations WHERE id IN ${sql([mine.id, theirs.id, unassigned.id])}`
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r.status]))
    expect(byId[mine.id]).toBe('pending')
    expect(byId[theirs.id]).toBe('open')
    expect(byId[unassigned.id]).toBe('open')
    await sql`UPDATE conversations SET status = 'open' WHERE id = ${mine.id}`
  })

  it('always sends from the alias, even when the general address is requested', async () => {
    const res = await $fetch<{ message: any; draft: boolean }>(`/api/admin/inbox/conversations/${mine.id}/messages`, {
      method: 'POST', body: { body_html: '<p>Hello</p>', from_identity: 'contact', saveDraft: true }, ...agentAuth,
    })
    expect(res.draft).toBe(true)
    expect(res.message.from_email).toBe(`${agentAlias}@${INBOX_DOMAIN}`)
    await sql`DELETE FROM conversation_messages WHERE id = ${res.message.id}`
  })

  it('refuses to send until an alias is set', async () => {
    const subId = await makeSubscriber(`pia-noalias-${uuidv4().slice(0, 8)}@example.com`)
    const convo = await makeConversation(subId, noAlias.id, 'No alias yet')

    // Reading still works.
    const detail = await $fetch<any>(`/api/admin/inbox/conversations/${convo.id}`, noAliasAuth)
    expect(detail.conversation.id).toBe(convo.id)

    const reply = await $fetch(`/api/admin/inbox/conversations/${convo.id}/messages`, {
      method: 'POST', body: { body_html: '<p>Hello</p>', saveDraft: true }, ...noAliasAuth,
    }).catch(e => e)
    expect(reply.statusCode).toBe(403)

    const compose = await $fetch('/api/admin/inbox/conversations', {
      method: 'POST', body: { to_email: `pia-new-${uuidv4().slice(0, 8)}@example.com`, subject: 'Hi', body_html: '<p>Hi</p>' }, ...noAliasAuth,
    }).catch(e => e)
    expect(compose.statusCode).toBe(403)
  })

  it('starts a new conversation assigned to the agent, sent from the alias', async () => {
    const toEmail = `pia-compose-${uuidv4().slice(0, 8)}@example.com`
    const res = await $fetch<{ conversation: any; message: any }>('/api/admin/inbox/conversations', {
      method: 'POST', body: { to_email: toEmail, subject: 'From me', body_html: '<p>Hello</p>', from_identity: 'contact' }, ...agentAuth,
    })
    createdSubscriberIds.push(res.conversation.subscriber_id)
    expect(res.conversation.assigned_user_id).toBe(agent.id)
    expect(res.message.from_email).toBe(`${agentAlias}@${INBOX_DOMAIN}`)

    const list = await $fetch<{ conversations: any[] }>('/api/admin/inbox/conversations', { params: { status: 'pending' }, ...agentAuth })
    expect(list.conversations.map(c => c.id)).toContain(res.conversation.id)
  })

  it('can hand a conversation to another inbox user, after which it is gone', async () => {
    const res = await $fetch<{ conversation: any }>(`/api/admin/inbox/conversations/${mine.id}`, {
      method: 'PUT', body: { assigned_user_id: fullAgent.id }, ...agentAuth,
    })
    expect(res.conversation.assigned_user_id).toBe(fullAgent.id)

    const gone = await $fetch(`/api/admin/inbox/conversations/${mine.id}`, agentAuth).catch(e => e)
    expect(gone.statusCode).toBe(404)

    // An admin hands it back.
    await $fetch(`/api/admin/inbox/conversations/${mine.id}`, { method: 'PUT', body: { assigned_user_id: agent.id }, ...adminAuth })
    const back = await $fetch<any>(`/api/admin/inbox/conversations/${mine.id}`, agentAuth)
    expect(back.conversation.assigned_user_id).toBe(agent.id)
  })

  it('uses shared inbox resources but cannot manage them', async () => {
    const tagName = `test-pia-${uuidv4().slice(0, 6)}`
    const created = await $fetch<{ tag: { slug: string } }>('/api/admin/inbox/tags', { method: 'POST', body: { name: tagName, color: 'info' }, ...adminAuth })
    createdTagSlugs.push(created.tag.slug)

    // Reading and applying is fine.
    const tags = await $fetch<{ tags: any[] }>('/api/admin/inbox/tags', agentAuth)
    expect(tags.tags.map(t => t.slug)).toContain(created.tag.slug)
    const applied = await $fetch<{ conversation: any }>(`/api/admin/inbox/conversations/${mine.id}/tags`, {
      method: 'PUT', body: { tags: [created.tag.slug] }, ...agentAuth,
    })
    expect(applied.conversation.tags).toEqual([created.tag.slug])
    const tagCounts = await $fetch<{ counts: Record<string, number> }>('/api/admin/inbox/conversations/tag-counts', agentAuth)
    expect(tagCounts.counts[created.tag.slug]).toBe(1)
    await $fetch<any>('/api/admin/inbox/canned-responses', agentAuth)
    await $fetch<any>('/api/admin/inbox/knowledge-entries', agentAuth)

    // Changing the shared palette, canned responses, or knowledge base is not.
    const forbidden = [
      $fetch('/api/admin/inbox/tags', { method: 'POST', body: { name: `test-pia-${uuidv4().slice(0, 6)}`, color: 'info' }, ...agentAuth }),
      $fetch(`/api/admin/inbox/tags/${created.tag.slug}`, { method: 'DELETE', ...agentAuth }),
      $fetch('/api/admin/inbox/canned-responses', { method: 'POST', body: { title: 'Nope', translations: [] }, ...agentAuth }),
      $fetch('/api/admin/inbox/knowledge-entries', { method: 'POST', body: { question: 'Q?', answer: 'A.' }, ...agentAuth }),
      $fetch('/api/admin/inbox/grounding/refresh', { method: 'POST', ...agentAuth }),
      $fetch(`/api/admin/inbox/conversations/${mine.id}/knowledge-entry/suggest`, { method: 'POST', ...agentAuth }),
    ]
    for (const call of forbidden) {
      const err = await call.catch(e => e)
      expect(err.statusCode).toBe(403)
    }

    // The tag survived the forbidden delete.
    const after = await $fetch<{ tags: any[] }>('/api/admin/inbox/tags', adminAuth)
    expect(after.tags.map(t => t.slug)).toContain(created.tag.slug)
  })

  it('scopes notes and activity to the agent\'s own conversations', async () => {
    const ownNotes = await $fetch<{ comments: any[] }>('/api/admin/comments', { params: { record_type: 'conversation', record_id: mine.id }, ...agentAuth })
    expect(Array.isArray(ownNotes.comments)).toBe(true)
    const ownActivity = await $fetch<{ activities: any[] }>(`/api/admin/activity/conversations/${mine.id}`, agentAuth)
    expect(Array.isArray(ownActivity.activities)).toBe(true)

    const notes = await $fetch('/api/admin/comments', { params: { record_type: 'conversation', record_id: theirs.id }, ...agentAuth }).catch(e => e)
    expect(notes.statusCode).toBe(404)
    const post = await $fetch('/api/admin/comments', {
      method: 'POST',
      body: { record_type: 'conversation', record_id: theirs.id, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] } },
      ...agentAuth,
    }).catch(e => e)
    expect(post.statusCode).toBe(404)
    const activity = await $fetch(`/api/admin/activity/conversations/${theirs.id}`, agentAuth).catch(e => e)
    expect(activity.statusCode).toBe(404)
  })

  it('filters a contact\'s conversation list to the agent\'s own', async () => {
    const subId = await makeSubscriber(`pia-shared-${uuidv4().slice(0, 8)}@example.com`)
    const own = await makeConversation(subId, agent.id, 'Shared contact, mine')
    await makeConversation(subId, fullAgent.id, 'Shared contact, theirs')

    const res = await $fetch<{ conversations: any[] }>(`/api/admin/subscribers/${subId}/conversations`, agentAuth)
    expect(res.conversations.map(c => c.id)).toEqual([own.id])
    const full = await $fetch<{ conversations: any[] }>(`/api/admin/subscribers/${subId}/conversations`, fullAuth)
    expect(full.conversations.length).toBe(2)
  })

  it('files mail sent to the alias into the agent\'s inbox', async () => {
    const senderEmail = `pia-sender-${uuidv4().slice(0, 8)}@example.com`
    const res = await postInbound({
      recipient: `${agentAlias}@${INBOX_DOMAIN}`,
      from: `Sender <${senderEmail}>`,
      sender: senderEmail,
      subject: 'Direct to alias',
      'body-html': '<p>Hi Priya</p>',
      'message-headers': headerJson([['Message-Id', `<alias-${uuidv4()}@example.com>`]]),
    })
    expect(res.status).toBe('contact')
    const [row] = await sql`SELECT subscriber_id, assigned_user_id FROM conversations WHERE id = ${res.conversation_id}`
    createdSubscriberIds.push(row!.subscriber_id)
    expect(row!.assigned_user_id).toBe(agent.id)

    const list = await $fetch<{ conversations: any[] }>('/api/admin/inbox/conversations', agentAuth)
    expect(list.conversations.map(c => c.id)).toContain(res.conversation_id)
  })

  it('notifies the assignee about a held message on their conversation', async () => {
    await clearRecordedEmails()
    // The admin is opted into the contact-us broadcast; the personal agent is the assignee.
    await sql`UPDATE users SET notification_preferences = ${sql.json({ contact_us: true })} WHERE id = ${admin.id}`

    const res = await postInbound({
      recipient: `contact+${mine.reply_token}@${INBOX_DOMAIN}`,
      from: `Stranger <stranger-${uuidv4().slice(0, 6)}@elsewhere.com>`,
      sender: 'stranger@elsewhere.com',
      subject: 'Re: Mine',
      'body-html': '<p>who am I</p>',
      'message-headers': headerJson([['Message-Id', `<held-${uuidv4()}@elsewhere.com>`]]),
    })
    expect(res.status).toBe('held')

    const drained = await drainNotifications(mine.id)
    const review = drained.emails.filter(e => String(e.subject).startsWith('[Review]'))
    expect(review.map(e => e.to)).toEqual(expect.arrayContaining([admin.email, agent.email]))

    await sql`UPDATE conversations SET needs_review = false WHERE id = ${mine.id}`
    await sql`UPDATE users SET notification_preferences = NULL WHERE id = ${admin.id}`
  })

  it('leaves personal agents out of the new-conversation broadcast even when opted in', async () => {
    await clearRecordedEmails()
    await sql`UPDATE users SET notification_preferences = ${sql.json({ contact_us: true })} WHERE id IN ${sql([admin.id, noAlias.id])}`

    const senderEmail = `pia-broadcast-${uuidv4().slice(0, 8)}@example.com`
    const res = await postInbound({
      recipient: CONTACT_ADDRESS,
      from: `Newcomer <${senderEmail}>`,
      sender: senderEmail,
      subject: 'Hello inbox',
      'body-html': '<p>Hello</p>',
      'message-headers': headerJson([['Message-Id', `<bcast-${uuidv4()}@example.com>`]]),
    })
    expect(res.status).toBe('contact')
    const [row] = await sql`SELECT subscriber_id FROM conversations WHERE id = ${res.conversation_id}`
    createdSubscriberIds.push(row!.subscriber_id)

    const drained = await drainNotifications(res.conversation_id)
    const recipients = drained.emails.filter(e => String(e.subject).startsWith('New message')).map(e => e.to)
    expect(recipients).toContain(admin.email)
    expect(recipients).not.toContain(noAlias.email)

    await sql`UPDATE users SET notification_preferences = NULL WHERE id IN ${sql([admin.id, noAlias.id])}`
  })
})

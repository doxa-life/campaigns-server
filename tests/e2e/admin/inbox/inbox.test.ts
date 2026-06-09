import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, createTestUser, getAuthHeaders, type TestUser, type AuthHeaders } from '../../../helpers/auth'
import { buildSignedReplyAddress } from '../../../../server/utils/inbox-addressing'

const INBOX_DOMAIN = process.env.INBOX_DOMAIN || 'doxa.life'
const CONTACT_ADDRESS = process.env.INBOX_CONTACT_ADDRESS || `contact@${INBOX_DOMAIN}`
const REPLY_SECRET = process.env.INBOX_REPLY_SECRET || process.env.JWT_SECRET || ''

describe('Shared inbox', async () => {
  const sql = getTestDatabase()
  let adminAuth: AuthHeaders
  let agent: TestUser
  let agentAuth: AuthHeaders

  const createdSubscriberIds: number[] = []
  const createdSpamEmails: string[] = []

  // Mailgun posts simple inbound messages as application/x-www-form-urlencoded.
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

  async function makeSubscriber(email: string, opts: { verified?: boolean } = {}) {
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, ${'Test Inbox ' + email})
      RETURNING id
    `
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${sub!.id}, 'email', ${email}, ${opts.verified ?? false})
    `
    createdSubscriberIds.push(sub!.id)
    return sub!.id as number
  }

  async function makeConversation(subscriberId: number, opts: { status?: string } = {}) {
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [c] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${subscriberId}, ${opts.status || 'open'}, ${token}, 'Existing thread')
      RETURNING *
    `
    return c as any
  }

  const authedHeaders = (auth: AuthHeaders, fromDomain: string) =>
    headerJson([['Authentication-Results', `mx.${INBOX_DOMAIN}; dkim=pass header.d=${fromDomain}; spf=pass`]])

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
    agent = await createTestUser(sql, { email: `test-agent-${uuidv4().slice(0, 8)}@example.com`, display_name: 'George' })
    await sql`UPDATE users SET roles = ARRAY['inbox_agent'], email_alias = ${'george-' + uuidv4().slice(0, 6)} WHERE id = ${agent.id}`
    agentAuth = getAuthHeaders(agent)
  })

  afterAll(async () => {
    if (createdSubscriberIds.length) {
      await sql`DELETE FROM subscribers WHERE id = ANY(${createdSubscriberIds})`
    }
    if (createdSpamEmails.length) {
      await sql`DELETE FROM spam_senders WHERE email = ANY(${createdSpamEmails})`
    }
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  // 1. Inbound creates a conversation + message; duplicate Message-Id is idempotent
  it('creates a conversation and inbound message, and dedupes by Message-Id', async () => {
    const email = `inbox-a-${uuidv4().slice(0, 8)}@example.com`
    const messageId = `<msg-${uuidv4()}@example.com>`
    const res = await postInbound({
      recipient: CONTACT_ADDRESS,
      from: `Tester <${email}>`,
      sender: email,
      subject: 'Hello there',
      'body-html': '<p>Hi team</p>',
      'stripped-html': '<p>Hi team</p>',
      'body-plain': 'Hi team',
      'message-headers': headerJson([['Message-Id', messageId]]),
    })
    expect(res.status).toBe('contact')
    const convoId = res.conversation_id
    const [{ subscriber_id }] = await sql`SELECT subscriber_id FROM conversations WHERE id = ${convoId}`
    createdSubscriberIds.push(subscriber_id)

    const msgs = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${convoId}`
    expect(msgs.length).toBe(1)
    expect(msgs[0]!.direction).toBe('inbound')

    const dup = await postInbound({
      recipient: CONTACT_ADDRESS,
      from: `Tester <${email}>`,
      sender: email,
      subject: 'Hello there',
      'body-html': '<p>Hi team</p>',
      'message-headers': headerJson([['Message-Id', messageId]]),
    })
    expect(dup.status).toBe('duplicate')
    const after = await sql`SELECT * FROM conversation_messages WHERE email_message_id = ${messageId}`
    expect(after.length).toBe(1)
  })

  // 1b. Invalid signature → 406 (signature enforcement explicitly exercised)
  it('rejects an invalid Mailgun signature with 406', async () => {
    let status = 0
    try {
      await postInbound({
        'x-test-verify-sig': '1',
        timestamp: String(Math.floor(Date.now() / 1000)),
        token: uuidv4(),
        signature: 'bogus-signature',
        recipient: CONTACT_ADDRESS,
        from: 'a@example.com',
        sender: 'a@example.com',
      })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(406)
  })

  // 2. Reply to a token reopens a Closed conversation
  it('reopens a closed conversation when the contact replies to the token', async () => {
    const email = `inbox-reopen-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'closed' })

    const res = await postInbound({
      recipient: `contact+${convo.reply_token}@${INBOX_DOMAIN}`,
      from: `Tester <${email}>`,
      sender: email,
      subject: 'Re: Existing thread',
      'body-html': '<p>Following up</p>',
      'message-headers': headerJson([['Message-Id', `<reopen-${uuidv4()}@example.com>`]]),
    })
    expect(res.status).toBe('contact')
    expect(res.conversation_id).toBe(convo.id)
    const [updated] = await sql`SELECT status FROM conversations WHERE id = ${convo.id}`
    expect(updated!.status).toBe('open')
  })

  // 3. Reply-by-email: valid signed token + authenticated → outbound; spoofed/unsigned → held
  it('treats a valid signed authenticated reply as a staff send', async () => {
    const email = `inbox-staff-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'open' })

    const signedAddress = buildSignedReplyAddress({
      token: convo.reply_token,
      userId: agent.id,
      conversationId: convo.id,
      secret: REPLY_SECRET,
      contactAddress: CONTACT_ADDRESS,
    })
    const agentDomain = agent.email.split('@')[1]!

    const res = await postInbound({
      recipient: signedAddress,
      from: `George <${agent.email}>`,
      sender: agent.email,
      subject: 'Re: Existing thread',
      'body-html': '<p>Thanks for reaching out!</p>',
      'message-headers': headerJson([
        ['Message-Id', `<staff-${uuidv4()}@example.com>`],
        ['Authentication-Results', `mx.${INBOX_DOMAIN}; dkim=pass header.d=${agentDomain}; spf=pass`],
      ]),
    })
    expect(res.status).toBe('staff')

    const out = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${convo.id} AND direction = 'outbound'`
    expect(out.length).toBe(1)
    expect(out[0]!.sender_user_id).toBe(agent.id)

    const [c] = await sql`SELECT status, assigned_user_id FROM conversations WHERE id = ${convo.id}`
    expect(c!.status).toBe('pending')
    expect(c!.assigned_user_id).toBe(agent.id)
  })

  it('staff reply-by-email targets the address that last wrote in', async () => {
    const primaryEmail = `inbox-primary-${uuidv4().slice(0, 8)}@example.com`
    const replyEmail = `inbox-reply-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(primaryEmail, { verified: true })
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${subId}, 'email', ${replyEmail}, true)
    `
    const convo = await makeConversation(subId, { status: 'open' })
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, email_message_id)
      VALUES (${convo.id}, 'inbound', 'received', ${replyEmail}, ${`<last-${uuidv4()}@example.com>`})
    `

    const signedAddress = buildSignedReplyAddress({
      token: convo.reply_token,
      userId: agent.id,
      conversationId: convo.id,
      secret: REPLY_SECRET,
      contactAddress: CONTACT_ADDRESS,
    })
    const agentDomain = agent.email.split('@')[1]!

    const res = await postInbound({
      recipient: signedAddress,
      from: `George <${agent.email}>`,
      sender: agent.email,
      subject: 'Re: Existing thread',
      'body-html': '<p>Replying to the active address</p>',
      'message-headers': headerJson([
        ['Message-Id', `<staff-last-address-${uuidv4()}@example.com>`],
        ['Authentication-Results', `mx.${INBOX_DOMAIN}; dkim=pass header.d=${agentDomain}; spf=pass`],
      ]),
    })
    expect(res.status).toBe('staff')

    const [out] = await sql`
      SELECT status, to_email
      FROM conversation_messages
      WHERE conversation_id = ${convo.id} AND direction = 'outbound'
      ORDER BY id DESC
      LIMIT 1
    `
    expect(out!.status).toBe('sent')
    expect(out!.to_email).toBe(replyEmail)
  })

  it('staff reply-by-email does not send to a suppressed contact address', async () => {
    const primaryEmail = `inbox-supp-primary-${uuidv4().slice(0, 8)}@example.com`
    const replyEmail = `inbox-supp-reply-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(primaryEmail, { verified: true })
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified, suppressed_at, suppression_reason)
      VALUES (${subId}, 'email', ${replyEmail}, true, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'hard_bounce')
    `
    const convo = await makeConversation(subId, { status: 'open' })
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email, email_message_id)
      VALUES (${convo.id}, 'inbound', 'received', ${replyEmail}, ${`<supp-last-${uuidv4()}@example.com>`})
    `

    const signedAddress = buildSignedReplyAddress({
      token: convo.reply_token,
      userId: agent.id,
      conversationId: convo.id,
      secret: REPLY_SECRET,
      contactAddress: CONTACT_ADDRESS,
    })
    const agentDomain = agent.email.split('@')[1]!

    const res = await postInbound({
      recipient: signedAddress,
      from: `George <${agent.email}>`,
      sender: agent.email,
      subject: 'Re: Existing thread',
      'body-html': '<p>This should not leave the system</p>',
      'message-headers': headerJson([
        ['Message-Id', `<staff-suppressed-${uuidv4()}@example.com>`],
        ['Authentication-Results', `mx.${INBOX_DOMAIN}; dkim=pass header.d=${agentDomain}; spf=pass`],
      ]),
    })
    expect(res.status).toBe('staff')

    const [out] = await sql`
      SELECT status, to_email, failed_reason
      FROM conversation_messages
      WHERE conversation_id = ${convo.id} AND direction = 'outbound'
      ORDER BY id DESC
      LIMIT 1
    `
    expect(out!.status).toBe('failed')
    expect(out!.to_email).toBe(replyEmail)
    expect(out!.failed_reason).toBe('Recipient suppressed')

    const [c] = await sql`SELECT status, needs_review FROM conversations WHERE id = ${convo.id}`
    expect(c!.status).toBe('open')
    expect(c!.needs_review).toBe(true)
  })

  // A Google Workspace domain without custom DKIM signs d=*.gappssmtp.com, which
  // never aligns with the From domain — but DMARC still passes (via SPF). Accept it.
  it('treats a signed reply as staff when DMARC passes even though DKIM is misaligned', async () => {
    const email = `inbox-dmarc-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'open' })

    const signedAddress = buildSignedReplyAddress({
      token: convo.reply_token,
      userId: agent.id,
      conversationId: convo.id,
      secret: REPLY_SECRET,
      contactAddress: CONTACT_ADDRESS,
    })

    const res = await postInbound({
      recipient: signedAddress,
      from: `George <${agent.email}>`,
      sender: agent.email,
      subject: 'Re: Existing thread',
      'body-html': '<p>Replying from a Workspace domain</p>',
      'message-headers': headerJson([
        ['Message-Id', `<staff-dmarc-${uuidv4()}@example.com>`],
        // header.d (gappssmtp) does NOT align with the From domain (example.com),
        // so the DKIM-alignment fallback fails — only dmarc=pass authenticates this.
        ['Authentication-Results', `mxa.mailgun.org; dkim=pass header.d=example-com.20251104.gappssmtp.com; spf=pass; dmarc=pass header.from=example.com`],
      ]),
    })
    expect(res.status).toBe('staff')

    const out = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${convo.id} AND direction = 'outbound'`
    expect(out.length).toBe(1)
    expect(out[0]!.sender_user_id).toBe(agent.id)
  })

  // Same misaligned DKIM but no DMARC vouch → still held (security boundary intact).
  it('holds a signed staff reply when neither DKIM alignment nor DMARC authenticates it', async () => {
    const email = `inbox-noauth-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'open' })

    const signedAddress = buildSignedReplyAddress({
      token: convo.reply_token,
      userId: agent.id,
      conversationId: convo.id,
      secret: REPLY_SECRET,
      contactAddress: CONTACT_ADDRESS,
    })

    const res = await postInbound({
      recipient: signedAddress,
      from: `George <${agent.email}>`,
      sender: agent.email,
      subject: 'Re: Existing thread',
      'body-html': '<p>Unauthenticated attempt</p>',
      'message-headers': headerJson([
        ['Message-Id', `<staff-noauth-${uuidv4()}@example.com>`],
        ['Authentication-Results', `mxa.mailgun.org; dkim=pass header.d=example-com.20251104.gappssmtp.com; spf=fail; dmarc=fail header.from=example.com`],
      ]),
    })
    expect(res.status).toBe('held')

    const held = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${convo.id} AND status = 'held'`
    expect(held.length).toBe(1)
    expect(held[0]!.hold_reason).toBe('Unauthenticated staff reply')
  })

  it('holds a reply from an unknown sender on the token address', async () => {
    const email = `inbox-owner-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'open' })

    const res = await postInbound({
      recipient: `contact+${convo.reply_token}@${INBOX_DOMAIN}`,
      from: `Stranger <stranger-${uuidv4().slice(0, 6)}@elsewhere.com>`,
      sender: `stranger@elsewhere.com`,
      subject: 'Re: Existing thread',
      'body-html': '<p>who am I</p>',
      'message-headers': headerJson([['Message-Id', `<held-${uuidv4()}@elsewhere.com>`]]),
    })
    expect(res.status).toBe('held')
    const held = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${convo.id} AND status = 'held'`
    expect(held.length).toBe(1)
    const [c] = await sql`SELECT needs_review FROM conversations WHERE id = ${convo.id}`
    expect(c!.needs_review).toBe(true)
  })

  // 5b. Forged In-Reply-To must not graft onto a victim's conversation (header threading
  // is honored only when the From belongs to that thread's subscriber).
  it('does not thread forged In-Reply-To mail onto a victim conversation', async () => {
    const ownerEmail = `inbox-victim-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(ownerEmail)
    const victimConvo = await makeConversation(subId, { status: 'open' })
    const knownMsgId = `<thread-${uuidv4()}@${INBOX_DOMAIN}>`
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, email_message_id, to_email)
      VALUES (${victimConvo.id}, 'outbound', 'sent', ${knownMsgId}, ${ownerEmail})
    `
    const res = await postInbound({
      recipient: CONTACT_ADDRESS, // bare contact address, no token
      from: `Attacker <attacker-${uuidv4().slice(0, 6)}@evil.com>`,
      sender: 'attacker@evil.com',
      subject: 'Re: your thread',
      'body-html': '<p>graft</p>',
      'message-headers': headerJson([
        ['Message-Id', `<forge-${uuidv4()}@evil.com>`],
        ['In-Reply-To', knownMsgId],
      ]),
    })
    expect(res.conversation_id).not.toBe(victimConvo.id)
    const [{ subscriber_id }] = await sql`SELECT subscriber_id FROM conversations WHERE id = ${res.conversation_id}`
    createdSubscriberIds.push(subscriber_id)
    const victimMsgs = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${victimConvo.id}`
    expect(victimMsgs.length).toBe(1) // only the seeded outbound — nothing grafted
  })

  // 5c. A real contact's header-referenced reply (no token) threads when the From matches.
  it('threads a header-referenced reply when the From matches the subscriber', async () => {
    const ownerEmail = `inbox-thread-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(ownerEmail)
    const convo = await makeConversation(subId, { status: 'pending' })
    const knownMsgId = `<thread-ok-${uuidv4()}@${INBOX_DOMAIN}>`
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, email_message_id, to_email)
      VALUES (${convo.id}, 'outbound', 'sent', ${knownMsgId}, ${ownerEmail})
    `
    const res = await postInbound({
      recipient: CONTACT_ADDRESS, // no token — resolved via the In-Reply-To header
      from: `Owner <${ownerEmail}>`,
      sender: ownerEmail,
      subject: 'Re: thread',
      'body-html': '<p>my reply</p>',
      'message-headers': headerJson([
        ['Message-Id', `<reply-${uuidv4()}@example.com>`],
        ['In-Reply-To', knownMsgId],
      ]),
    })
    expect(res.status).toBe('contact')
    expect(res.conversation_id).toBe(convo.id)
  })

  // 5d. A vacation / out-of-office auto-reply auto-closes the thread and doesn't notify staff.
  it('auto-closes a vacation auto-reply and skips staff notification', async () => {
    const email = `inbox-ooo-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'pending' })
    const res = await postInbound({
      recipient: `contact+${convo.reply_token}@${INBOX_DOMAIN}`,
      from: `Owner <${email}>`,
      sender: email,
      subject: 'Out of office',
      'body-html': '<p>I am away until Monday.</p>',
      'message-headers': headerJson([
        ['Message-Id', `<ooo-${uuidv4()}@example.com>`],
        ['Auto-Submitted', 'auto-replied'],
      ]),
    })
    expect(res.status).toBe('contact')
    const [c] = await sql`SELECT status FROM conversations WHERE id = ${convo.id}`
    expect(c!.status).toBe('closed') // closed, not re-opened
    const msgs = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${convo.id} AND status = 'received'`
    expect(msgs.length).toBe(1) // message still stored
    const jobs = await sql`SELECT payload FROM jobs WHERE type = 'inbox_email' AND reference_id = ${convo.id}`
    const kinds = jobs.map((j: any) => j.payload.kind)
    expect(kinds).not.toContain('assignee')
    expect(kinds).not.toContain('new_conversation')
  })

  // 6. verified semantics on authenticated vs unauthenticated inbound
  it('verifies the contact method on authenticated inbound only', async () => {
    const emailAuthed = `inbox-verify-${uuidv4().slice(0, 8)}@example.com`
    const subA = await makeSubscriber(emailAuthed, { verified: false })
    const convoA = await makeConversation(subA, { status: 'open' })
    await postInbound({
      recipient: `contact+${convoA.reply_token}@${INBOX_DOMAIN}`,
      from: `Tester <${emailAuthed}>`,
      sender: emailAuthed,
      'body-html': '<p>hello</p>',
      'message-headers': headerJson([
        ['Message-Id', `<verify-${uuidv4()}@example.com>`],
        ['Authentication-Results', `mx.${INBOX_DOMAIN}; dkim=pass header.d=example.com`],
      ]),
    })
    const [cmA] = await sql`SELECT verified FROM contact_methods WHERE LOWER(value) = LOWER(${emailAuthed})`
    expect(cmA!.verified).toBe(true)

    const emailUnauth = `inbox-noverify-${uuidv4().slice(0, 8)}@example.com`
    const subB = await makeSubscriber(emailUnauth, { verified: false })
    const convoB = await makeConversation(subB, { status: 'open' })
    await postInbound({
      recipient: `contact+${convoB.reply_token}@${INBOX_DOMAIN}`,
      from: `Tester <${emailUnauth}>`,
      sender: emailUnauth,
      'body-html': '<p>hello</p>',
      'message-headers': headerJson([['Message-Id', `<noverify-${uuidv4()}@example.com>`]]),
    })
    const [cmB] = await sql`SELECT verified FROM contact_methods WHERE LOWER(value) = LOWER(${emailUnauth})`
    expect(cmB!.verified).toBe(false)
  })

  // 4 (delivery). delivery webhook sets delivered_at, leaves verified untouched
  it('updates outbound delivery state from the delivery webhook', async () => {
    const email = `inbox-deliver-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email, { verified: false })
    const convo = await makeConversation(subId, { status: 'pending' })
    const providerId = `<prov-${uuidv4()}@${INBOX_DOMAIN}>`
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, provider_message_id, to_email)
      VALUES (${convo.id}, 'outbound', 'sent', ${providerId}, ${email})
    `

    const res = await $fetch('/api/webhooks/mailgun/delivery', {
      method: 'POST',
      body: {
        signature: { timestamp: '1', token: 't', signature: 's' },
        'event-data': { event: 'delivered', message: { headers: { 'message-id': providerId.replace(/^<|>$/g, '') } } },
      },
    })
    expect(res.status).toBe('delivered')

    const [msg] = await sql`SELECT status, delivered_at FROM conversation_messages WHERE provider_message_id = ${providerId}`
    expect(msg!.status).toBe('delivered')
    expect(msg!.delivered_at).not.toBeNull()

    const [cm] = await sql`SELECT verified FROM contact_methods WHERE LOWER(value) = LOWER(${email})`
    expect(cm!.verified).toBe(false) // delivery never touches verified
  })

  // 7. Durable ack
  it('returns a retryable 503 on transient persistence failure', async () => {
    let status = 0
    try {
      await postInbound({
        'x-test-fail': 'db',
        recipient: CONTACT_ADDRESS,
        from: `t-${uuidv4().slice(0, 6)}@example.com`,
        sender: `t@example.com`,
        'body-html': '<p>x</p>',
        'message-headers': headerJson([['Message-Id', `<fail-${uuidv4()}@example.com>`]]),
      })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(503)
  })

  it('returns 400 on a malformed payload', async () => {
    let status = 0
    try {
      await postInbound({ subject: 'no recipient or sender' })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(400)
  })

  // 5. Mark spam blocklists the sender and auto-closes future inbound
  it('marks spam, blocklists the sender, and auto-closes future inbound', async () => {
    const email = `inbox-spam-${uuidv4().slice(0, 8)}@example.com`
    createdSpamEmails.push(email)
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'open' })

    await $fetch(`/api/admin/inbox/conversations/${convo.id}/spam`, {
      method: 'POST',
      body: { spam: true },
      ...adminAuth,
    })
    const [c] = await sql`SELECT status FROM conversations WHERE id = ${convo.id}`
    expect(c!.status).toBe('spam')
    const blocked = await sql`SELECT 1 FROM spam_senders WHERE LOWER(email) = LOWER(${email})`
    expect(blocked.length).toBe(1)

    const res = await postInbound({
      recipient: CONTACT_ADDRESS,
      from: `Spammer <${email}>`,
      sender: email,
      subject: 'buy now',
      'body-html': '<p>spam</p>',
      'message-headers': headerJson([['Message-Id', `<spam-${uuidv4()}@example.com>`]]),
    })
    expect(res.status).toBe('spam')
    const [newConvo] = await sql`SELECT status FROM conversations WHERE id = ${res.conversation_id}`
    expect(newConvo!.status).toBe('spam')
  })

  // 9. Permissions
  it('rejects inbox endpoints for users without inbox.view', async () => {
    const noRole = await createTestUser(sql, { email: `test-norole-${uuidv4().slice(0, 8)}@example.com` })
    const noRoleAuth = getAuthHeaders(noRole)
    let status = 0
    try {
      await $fetch('/api/admin/inbox/conversations', { ...noRoleAuth })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(403)

    const ok = await $fetch<{ conversations: any[] }>('/api/admin/inbox/conversations', { ...agentAuth })
    expect(Array.isArray(ok.conversations)).toBe(true)
  })

  // In-app send queues an outbound message + a job
  it('queues an outbound message when an agent replies in-app', async () => {
    const email = `inbox-send-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email, { verified: true })
    const convo = await makeConversation(subId, { status: 'open' })

    const res = await $fetch<{ message: any; queued: boolean }>(
      `/api/admin/inbox/conversations/${convo.id}/messages`,
      { method: 'POST', body: { body_html: '<p>On it!</p>', body_text: 'On it!' }, ...agentAuth }
    )
    expect(res.queued).toBe(true)
    expect(res.message.status).toBe('queued')

    const [c] = await sql`SELECT status, assigned_user_id FROM conversations WHERE id = ${convo.id}`
    expect(c!.status).toBe('pending')
    expect(c!.assigned_user_id).toBe(agent.id)

    const jobs = await sql`SELECT * FROM jobs WHERE type = 'outbound_email' AND reference_id = ${convo.id}`
    expect(jobs.length).toBe(1)
  })

  // Regression: the auto-ack + staff notification are durable queued jobs, not
  // fire-and-forget — so a transient send failure is retried, not silently lost.
  // The auto-ack only fires for an *authenticated* inbound (a forged From must not
  // trigger an ack to the victim), so this cold conversation passes DKIM/DMARC.
  it('enqueues durable auto-ack and notification jobs for a new cold conversation', async () => {
    const email = `inbox-ack-${uuidv4().slice(0, 8)}@example.com`
    const res = await postInbound({
      recipient: CONTACT_ADDRESS,
      from: `Asker <${email}>`,
      sender: email,
      subject: 'Question',
      'body-html': '<p>Can you help?</p>',
      'stripped-html': '<p>Can you help?</p>',
      'body-plain': 'Can you help?',
      'message-headers': headerJson([
        ['Message-Id', `<ack-${uuidv4()}@example.com>`],
        ['Authentication-Results', `mx.${INBOX_DOMAIN}; dkim=pass header.d=example.com`],
      ]),
    })
    expect(res.status).toBe('contact')
    const convoId = res.conversation_id
    const [{ subscriber_id }] = await sql`SELECT subscriber_id FROM conversations WHERE id = ${convoId}`
    createdSubscriberIds.push(subscriber_id)

    const jobs = await sql`SELECT payload FROM jobs WHERE type = 'inbox_email' AND reference_id = ${convoId}`
    const kinds = jobs.map((j: any) => j.payload.kind)
    expect(kinds).toContain('auto_ack')
    expect(kinds).toContain('new_conversation')
    const ack = jobs.find((j: any) => j.payload.kind === 'auto_ack')
    expect(ack!.payload.to).toBe(email)
    expect(ack!.payload.language).toBeDefined()
  })

  // 10. Subscriber delete cascades conversations + messages
  it('cascades conversations and messages when a subscriber is deleted', async () => {
    const email = `inbox-cascade-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)
    const convo = await makeConversation(subId, { status: 'open' })
    await sql`
      INSERT INTO conversation_messages (conversation_id, direction, status, from_email)
      VALUES (${convo.id}, 'inbound', 'received', ${email})
    `

    await $fetch(`/api/admin/subscribers/${subId}`, { method: 'DELETE', ...adminAuth })

    const convos = await sql`SELECT * FROM conversations WHERE id = ${convo.id}`
    expect(convos.length).toBe(0)
    const msgs = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${convo.id}`
    expect(msgs.length).toBe(0)
  })

  // --- Compose: start a new conversation (no prior inbound) ---

  // Composing to a new address creates the subscriber + contact method, a pending
  // conversation assigned to the sender, and a queued outbound message + job.
  it('starts a conversation and queues an outbound email to a new address', async () => {
    const email = `inbox-compose-new-${uuidv4().slice(0, 8)}@example.com`
    const res = await $fetch<{ conversation: any; message: any; queued: boolean }>(
      '/api/admin/inbox/conversations',
      { method: 'POST', body: { to_email: email, to_name: 'Newcomer', subject: 'Hello', body_html: '<p>Hi there</p>', body_text: 'Hi there' }, ...agentAuth }
    )
    expect(res.queued).toBe(true)
    expect(res.message.status).toBe('queued')
    expect(res.message.direction).toBe('outbound')
    expect(res.message.to_email).toBe(email)

    const [c] = await sql`SELECT status, assigned_user_id, subject, subscriber_id FROM conversations WHERE id = ${res.conversation.id}`
    expect(c!.status).toBe('pending')
    expect(c!.assigned_user_id).toBe(agent.id)
    expect(c!.subject).toBe('Hello')
    createdSubscriberIds.push(c!.subscriber_id)

    const cm = await sql`SELECT * FROM contact_methods WHERE type = 'email' AND LOWER(value) = LOWER(${email})`
    expect(cm.length).toBe(1)
    expect(cm[0]!.subscriber_id).toBe(c!.subscriber_id)

    const jobs = await sql`SELECT * FROM jobs WHERE type = 'outbound_email' AND reference_id = ${res.conversation.id}`
    expect(jobs.length).toBe(1)
  })

  // Composing by subscriber_id targets that contact's primary email.
  it('emails an existing contact by subscriber_id', async () => {
    const email = `inbox-compose-contact-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email, { verified: true })

    const res = await $fetch<{ conversation: any; message: any; queued: boolean }>(
      '/api/admin/inbox/conversations',
      { method: 'POST', body: { subscriber_id: subId, subject: 'Checking in', body_html: '<p>How are you?</p>' }, ...agentAuth }
    )
    expect(res.queued).toBe(true)
    expect(res.message.to_email).toBe(email)

    const [c] = await sql`SELECT subscriber_id FROM conversations WHERE id = ${res.conversation.id}`
    expect(c!.subscriber_id).toBe(subId)
  })

  it('emails an existing contact by subscriber_id using a non-suppressed primary email', async () => {
    const suppressedEmail = `inbox-compose-suppressed-${uuidv4().slice(0, 8)}@example.com`
    const deliverableEmail = `inbox-compose-deliverable-${uuidv4().slice(0, 8)}@example.com`
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, 'Test Inbox Suppressed Primary')
      RETURNING id
    `
    createdSubscriberIds.push(sub!.id)
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified, suppressed_at, suppression_reason, created_at)
      VALUES (${sub!.id}, 'email', ${suppressedEmail}, true, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'hard_bounce', CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '1 minute')
    `
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${sub!.id}, 'email', ${deliverableEmail}, true)
    `

    const res = await $fetch<{ message: any; queued: boolean }>(
      '/api/admin/inbox/conversations',
      { method: 'POST', body: { subscriber_id: sub!.id, subject: 'Checking in', body_html: '<p>Still there?</p>' }, ...agentAuth }
    )
    expect(res.queued).toBe(true)
    expect(res.message.to_email).toBe(deliverableEmail)
  })

  // Composing to a known contact's email reuses the existing subscriber (no duplicate).
  it('reuses an existing subscriber when composing to a known email', async () => {
    const email = `inbox-compose-dedupe-${uuidv4().slice(0, 8)}@example.com`
    const subId = await makeSubscriber(email)

    const res = await $fetch<{ conversation: any }>(
      '/api/admin/inbox/conversations',
      { method: 'POST', body: { to_email: email, subject: 'Re-contact', body_html: '<p>Hi again</p>' }, ...agentAuth }
    )
    const [c] = await sql`SELECT subscriber_id FROM conversations WHERE id = ${res.conversation.id}`
    expect(c!.subscriber_id).toBe(subId)

    const cm = await sql`SELECT * FROM contact_methods WHERE type = 'email' AND LOWER(value) = LOWER(${email})`
    expect(cm.length).toBe(1)
  })

  it('rejects compose with missing/invalid fields', async () => {
    const valid = { to_email: `inbox-bad-${uuidv4().slice(0, 8)}@example.com`, subject: 'S', body_html: '<p>B</p>' }
    const cases = [
      { ...valid, to_email: undefined },               // no recipient
      { ...valid, subject: '   ' },                    // empty subject
      { ...valid, body_html: '' },                     // empty body
      { ...valid, to_email: 'not-an-email' },          // malformed email
    ]
    for (const body of cases) {
      let status = 0
      try {
        await $fetch('/api/admin/inbox/conversations', { method: 'POST', body, ...agentAuth })
      } catch (err: any) {
        status = err?.statusCode || err?.response?.status || 0
      }
      expect(status).toBe(400)
    }
  })

  it('rejects compose to a contact with no email', async () => {
    const [sub] = await sql`INSERT INTO subscribers (tracking_id, profile_id, name) VALUES (${uuidv4()}, ${uuidv4()}, 'No Email') RETURNING id`
    createdSubscriberIds.push(sub!.id)
    let status = 0
    try {
      await $fetch('/api/admin/inbox/conversations', { method: 'POST', body: { subscriber_id: sub!.id, subject: 'S', body_html: '<p>B</p>' }, ...agentAuth })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(400)
  })

  it('rejects conversation-less inline-image upload without inbox.send', async () => {
    const noRole = await createTestUser(sql, { email: `test-noimg-${uuidv4().slice(0, 8)}@example.com` })
    const noRoleAuth = getAuthHeaders(noRole)
    let status = 0
    try {
      await $fetch('/api/admin/inbox/inline-images', { method: 'POST', body: new FormData(), ...noRoleAuth })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(403)
  })

  it('rejects compose for users without inbox.send', async () => {
    const noRole = await createTestUser(sql, { email: `test-nosend-${uuidv4().slice(0, 8)}@example.com` })
    const noRoleAuth = getAuthHeaders(noRole)
    let status = 0
    try {
      await $fetch('/api/admin/inbox/conversations', { method: 'POST', body: { to_email: `x-${uuidv4().slice(0, 8)}@example.com`, subject: 'S', body_html: '<p>B</p>' }, ...noRoleAuth })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(403)
  })
})

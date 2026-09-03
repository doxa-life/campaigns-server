import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'

const INBOX_DOMAIN = process.env.INBOX_DOMAIN || 'doxa.life'
const CONTACT_ADDRESS = process.env.INBOX_CONTACT_ADDRESS || `contact@${INBOX_DOMAIN}`

describe('SendGrid inbound webhook', async () => {
  const sql = getTestDatabase()
  const createdSubscriberIds: number[] = []

  // A minimal multipart/alternative raw email — what Inbound Parse posts in
  // raw MIME mode via the `email` field.
  function buildMime(opts: {
    from: string
    fromName?: string
    to: string
    subject: string
    html?: string
    text?: string
    messageId?: string
  }): string {
    const boundary = `b-${uuidv4().slice(0, 8)}`
    return [
      `Message-ID: ${opts.messageId || `<sg-mime-${uuidv4()}@example.com>`}`,
      `From: ${opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      opts.text || '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      opts.html || '',
      `--${boundary}--`,
      '',
    ].join('\r\n')
  }

  // The Inbound Parse form for a raw-mode POST. No signing exists for Inbound
  // Parse; the token gate is inactive in tests (SENDGRID_INBOUND_TOKEN unset).
  function parseForm(
    rawMime: string,
    recipient: string,
    sender: string,
    opts: { dkim?: string; spf?: string; spamScore?: string; envelopeTo?: string[] } = {}
  ): URLSearchParams {
    const params = new URLSearchParams()
    params.append('email', rawMime)
    params.append('envelope', JSON.stringify({ to: opts.envelopeTo || [recipient], from: sender }))
    params.append('to', recipient)
    params.append('from', sender)
    params.append('dkim', opts.dkim ?? 'none')
    params.append('SPF', opts.spf ?? 'none')
    if (opts.spamScore !== undefined) params.append('spam_score', opts.spamScore)
    return params
  }

  async function postInbound(params: URLSearchParams): Promise<any> {
    return $fetch('/api/webhooks/sendgrid/inbound', { method: 'POST', body: params })
  }

  async function trackSubscriberOf(conversationId: number) {
    const [row] = await sql`SELECT subscriber_id FROM conversations WHERE id = ${conversationId}`
    if (row?.subscriber_id) createdSubscriberIds.push(row.subscriber_id)
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    if (createdSubscriberIds.length) {
      await sql`DELETE FROM subscribers WHERE id = ANY(${createdSubscriberIds})`
    }
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('parses raw MIME into a conversation + inbound message, and dedupes on redelivery', async () => {
    const email = `sg-inbox-a-${uuidv4().slice(0, 8)}@example.com`
    const messageId = `<sg-msg-${uuidv4()}@example.com>`
    const mime = buildMime({
      from: email,
      fromName: 'SendGrid Tester',
      to: CONTACT_ADDRESS,
      subject: 'Hello from SendGrid',
      html: '<p>Hi team</p>',
      text: 'Hi team',
      messageId,
    })

    const res = await postInbound(parseForm(mime, CONTACT_ADDRESS, email, { spamScore: '1.3' }))
    expect(res.status).toBe('contact')
    await trackSubscriberOf(res.conversation_id)

    const msgs = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${res.conversation_id}`
    expect(msgs.length).toBe(1)
    const msg = msgs[0]! as any
    expect(msg.direction).toBe('inbound')
    expect(msg.from_email).toBe(email)
    expect(msg.from_name).toBe('SendGrid Tester')
    expect(msg.subject).toBe('Hello from SendGrid')
    expect(msg.body_html).toContain('Hi team')
    expect(msg.email_message_id).toBe(messageId)
    expect(Number(msg.spam_score)).toBeCloseTo(1.3)

    const dup = await postInbound(parseForm(mime, CONTACT_ADDRESS, email))
    expect(dup.status).toBe('duplicate')
    const after = await sql`SELECT id FROM conversation_messages WHERE email_message_id = ${messageId}`
    expect(after.length).toBe(1)
  })

  it('threads a reply-token recipient into the existing conversation and reopens it', async () => {
    const email = `sg-reopen-${uuidv4().slice(0, 8)}@example.com`
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, ${'Test SendGrid ' + email})
      RETURNING id
    `
    createdSubscriberIds.push(sub!.id)
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${sub!.id}, 'email', ${email}, false)
    `
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [convo] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${sub!.id}, 'closed', ${token}, 'Existing thread')
      RETURNING id
    `

    const recipient = `contact+${token}@${INBOX_DOMAIN}`
    const mime = buildMime({ from: email, to: recipient, subject: 'Re: Existing thread', html: '<p>Following up</p>', text: 'Following up' })
    const res = await postInbound(parseForm(mime, recipient, email))
    expect(res.status).toBe('contact')
    expect(res.conversation_id).toBe(convo!.id)
    const [updated] = await sql`SELECT status FROM conversations WHERE id = ${convo!.id}`
    expect((updated as any).status).toBe('open')
  })

  it('routes on the inbox-domain envelope recipient when others are listed first', async () => {
    const email = `sg-multi-${uuidv4().slice(0, 8)}@example.com`
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, ${'Test SendGrid ' + email})
      RETURNING id
    `
    createdSubscriberIds.push(sub!.id)
    await sql`
      INSERT INTO contact_methods (subscriber_id, type, value, verified)
      VALUES (${sub!.id}, 'email', ${email}, false)
    `
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const [convo] = await sql`
      INSERT INTO conversations (subscriber_id, status, reply_token, subject)
      VALUES (${sub!.id}, 'open', ${token}, 'Multi-recipient thread')
      RETURNING id
    `

    const inboxRecipient = `contact+${token}@${INBOX_DOMAIN}`
    const mime = buildMime({ from: email, to: inboxRecipient, subject: 'Re: Multi-recipient thread', html: '<p>hi</p>', text: 'hi' })
    const res = await postInbound(
      parseForm(mime, inboxRecipient, email, { envelopeTo: ['cc@example.org', inboxRecipient] })
    )
    expect(res.status).toBe('contact')
    expect(res.conversation_id).toBe(convo!.id)
  })

  it('derives stripped body variants from quoted-reply content', async () => {
    const email = `sg-strip-${uuidv4().slice(0, 8)}@example.com`
    const html =
      '<div dir="ltr"><p>Just the new part</p></div>' +
      '<div class="gmail_quote">On Tue, Sep 1, 2026 at 3:12 PM Doxa wrote:<blockquote>the old thread</blockquote></div>'
    const text = 'Just the new part\r\n\r\nOn Tue, Sep 1, 2026 at 3:12 PM Doxa wrote:\r\n> the old thread'
    const mime = buildMime({ from: email, to: CONTACT_ADDRESS, subject: 'Stripping', html, text })

    const res = await postInbound(parseForm(mime, CONTACT_ADDRESS, email))
    expect(res.status).toBe('contact')
    await trackSubscriberOf(res.conversation_id)

    const [msg] = await sql`SELECT body_html, body_stripped_html, body_text FROM conversation_messages WHERE conversation_id = ${res.conversation_id}`
    const row = msg as any
    expect(row.body_html).toContain('gmail_quote')
    expect(row.body_stripped_html).toContain('Just the new part')
    expect(row.body_stripped_html).not.toContain('gmail_quote')
    expect(row.body_text).toContain('Just the new part')
    expect(row.body_text).not.toContain('the old thread')
  })

  it('marks the inbound authenticated on an aligned DKIM pass', async () => {
    const email = `sg-auth-${uuidv4().slice(0, 8)}@example.com`
    const mime = buildMime({ from: email, to: CONTACT_ADDRESS, subject: 'Auth check', html: '<p>hi</p>', text: 'hi' })

    const res = await postInbound(parseForm(mime, CONTACT_ADDRESS, email, { dkim: '{@example.com : pass}', spf: 'pass' }))
    expect(res.status).toBe('contact')
    await trackSubscriberOf(res.conversation_id)

    const [msg] = await sql`SELECT authenticated, auth_result FROM conversation_messages WHERE conversation_id = ${res.conversation_id}`
    expect((msg as any).authenticated).toBe(true)
    expect((msg as any).auth_result).toContain('dkim=')
  })

  it('stays unauthenticated on a failing DKIM with unaligned SPF', async () => {
    const email = `sg-noauth-${uuidv4().slice(0, 8)}@example.com`
    const mime = buildMime({ from: email, to: CONTACT_ADDRESS, subject: 'No auth', html: '<p>hi</p>', text: 'hi' })

    const res = await postInbound(
      parseForm(mime, CONTACT_ADDRESS, 'bounce@other-domain.com', { dkim: '{@example.com : fail}', spf: 'pass' })
    )
    expect(res.status).toBe('contact')
    await trackSubscriberOf(res.conversation_id)

    const [msg] = await sql`SELECT authenticated FROM conversation_messages WHERE conversation_id = ${res.conversation_id}`
    expect((msg as any).authenticated).toBe(false)
  })

  it('enforces the URL token when one is expected', async () => {
    const email = `sg-token-${uuidv4().slice(0, 8)}@example.com`
    const mime = buildMime({ from: email, to: CONTACT_ADDRESS, subject: 'Token check', html: '<p>hi</p>', text: 'hi' })
    const expected = `tok-${uuidv4().replace(/-/g, '')}`
    const post = (query: string) =>
      $fetch(`/api/webhooks/sendgrid/inbound${query}`, {
        method: 'POST',
        body: parseForm(mime, CONTACT_ADDRESS, email),
        headers: { 'x-test-inbound-token': expected },
      })

    for (const query of ['', `?token=wrong-${expected}`]) {
      let status = 0
      try {
        await post(query)
      } catch (err: any) {
        status = err?.statusCode || err?.response?.status || 0
      }
      expect(status).toBe(401)
    }

    const ok: any = await post(`?token=${expected}`)
    expect(ok.status).toBe('contact')
    await trackSubscriberOf(ok.conversation_id)
  })

  it('drops mail addressed to the bounce return-path', async () => {
    const email = `sg-ooo-${uuidv4().slice(0, 8)}@example.com`
    const bounceAddress = `bounce+abc123@${INBOX_DOMAIN}`
    const mime = buildMime({ from: email, to: bounceAddress, subject: 'Out of Office', html: '<p>away</p>', text: 'away' })

    const res = await postInbound(parseForm(mime, bounceAddress, email))
    expect(res.status).toBe('ignored')
    expect(res.reason).toBe('bounce_address')
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'

const INBOX_DOMAIN = process.env.INBOX_DOMAIN || 'doxa.life'
const CONTACT_ADDRESS = process.env.INBOX_CONTACT_ADDRESS || `contact@${INBOX_DOMAIN}`

describe('SES inbound webhook', async () => {
  const sql = getTestDatabase()
  const createdSubscriberIds: number[] = []

  // A minimal multipart/alternative raw email, the shape SES stores in S3 /
  // inlines in an SNS-action notification.
  function buildMime(opts: {
    from: string
    fromName?: string
    to: string
    subject: string
    html?: string
    text?: string
    messageId?: string
    extraHeaders?: string[]
  }): string {
    const boundary = `b-${uuidv4().slice(0, 8)}`
    return [
      `Message-ID: ${opts.messageId || `<ses-mime-${uuidv4()}@example.com>`}`,
      `From: ${opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      `Date: ${new Date().toUTCString()}`,
      ...(opts.extraHeaders || []),
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

  // A Received notification with the raw email inline (SNS-action shape), wrapped
  // in an SNS envelope. Signature validation is skipped under VITEST.
  function receivedNotification(
    rawMime: string,
    recipient: string,
    opts: { dmarc?: string; virus?: string } = {}
  ) {
    return {
      Type: 'Notification',
      MessageId: uuidv4(),
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-inbound-notify',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1',
      Signature: 'test-signature',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem',
      Message: JSON.stringify({
        notificationType: 'Received',
        receipt: {
          recipients: [recipient],
          action: { type: 'SNS', encoding: 'BASE64' },
          spamVerdict: { status: 'PASS' },
          virusVerdict: { status: opts.virus || 'PASS' },
          spfVerdict: { status: 'PASS' },
          dkimVerdict: { status: 'PASS' },
          dmarcVerdict: { status: opts.dmarc || 'NONE' },
        },
        mail: { messageId: uuidv4().replace(/-/g, '') },
        content: Buffer.from(rawMime, 'utf-8').toString('base64'),
      }),
    }
  }

  async function postSesInbound(notification: Record<string, any>): Promise<any> {
    return $fetch('/api/webhooks/ses/inbound', { method: 'POST', body: notification })
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
    const email = `ses-inbox-a-${uuidv4().slice(0, 8)}@example.com`
    const messageId = `<ses-msg-${uuidv4()}@example.com>`
    const mime = buildMime({
      from: email,
      fromName: 'SES Tester',
      to: CONTACT_ADDRESS,
      subject: 'Hello from SES',
      html: '<p>Hi team</p>',
      text: 'Hi team',
      messageId,
    })

    const res = await postSesInbound(receivedNotification(mime, CONTACT_ADDRESS))
    expect(res.status).toBe('contact')
    await trackSubscriberOf(res.conversation_id)

    const msgs = await sql`SELECT * FROM conversation_messages WHERE conversation_id = ${res.conversation_id}`
    expect(msgs.length).toBe(1)
    const msg = msgs[0]! as any
    expect(msg.direction).toBe('inbound')
    expect(msg.from_email).toBe(email)
    expect(msg.from_name).toBe('SES Tester')
    expect(msg.subject).toBe('Hello from SES')
    expect(msg.body_html).toContain('Hi team')
    expect(msg.body_text).toContain('Hi team')
    expect(msg.email_message_id).toBe(messageId)

    // Same MIME redelivered under a new SNS MessageId → dedupes by email Message-ID.
    const dup = await postSesInbound(receivedNotification(mime, CONTACT_ADDRESS))
    expect(dup.status).toBe('duplicate')
    const after = await sql`SELECT id FROM conversation_messages WHERE email_message_id = ${messageId}`
    expect(after.length).toBe(1)
  })

  it('threads a reply-token recipient into the existing conversation and reopens it', async () => {
    const email = `ses-reopen-${uuidv4().slice(0, 8)}@example.com`
    const [sub] = await sql`
      INSERT INTO subscribers (tracking_id, profile_id, name)
      VALUES (${uuidv4()}, ${uuidv4()}, ${'Test SES ' + email})
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

    const mime = buildMime({
      from: email,
      to: `contact+${token}@${INBOX_DOMAIN}`,
      subject: 'Re: Existing thread',
      html: '<p>Following up</p>',
      text: 'Following up',
    })
    const res = await postSesInbound(receivedNotification(mime, `contact+${token}@${INBOX_DOMAIN}`))
    expect(res.status).toBe('contact')
    expect(res.conversation_id).toBe(convo!.id)
    const [updated] = await sql`SELECT status FROM conversations WHERE id = ${convo!.id}`
    expect((updated as any).status).toBe('open')
  })

  it('derives stripped body variants from quoted-reply content', async () => {
    const email = `ses-strip-${uuidv4().slice(0, 8)}@example.com`
    const html =
      '<div dir="ltr"><p>Just the new part</p></div>' +
      '<div class="gmail_quote">On Mon, Aug 31, 2026 at 3:12 PM Doxa wrote:<blockquote>the old thread</blockquote></div>'
    const text = 'Just the new part\r\n\r\nOn Mon, Aug 31, 2026 at 3:12 PM Doxa wrote:\r\n> the old thread'
    const mime = buildMime({ from: email, to: CONTACT_ADDRESS, subject: 'Stripping', html, text })

    const res = await postSesInbound(receivedNotification(mime, CONTACT_ADDRESS))
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

  it('marks the inbound authenticated when the SES DMARC verdict passes', async () => {
    const email = `ses-auth-${uuidv4().slice(0, 8)}@example.com`
    const mime = buildMime({ from: email, to: CONTACT_ADDRESS, subject: 'Auth check', html: '<p>hi</p>', text: 'hi' })

    const res = await postSesInbound(receivedNotification(mime, CONTACT_ADDRESS, { dmarc: 'PASS' }))
    expect(res.status).toBe('contact')
    await trackSubscriberOf(res.conversation_id)

    const [msg] = await sql`SELECT authenticated, auth_result FROM conversation_messages WHERE conversation_id = ${res.conversation_id}`
    expect((msg as any).authenticated).toBe(true)
    expect((msg as any).auth_result).toContain('dmarc=PASS')
  })

  it('ignores a message SES flagged as a virus', async () => {
    const email = `ses-virus-${uuidv4().slice(0, 8)}@example.com`
    const mime = buildMime({ from: email, to: CONTACT_ADDRESS, subject: 'Bad', html: '<p>x</p>', text: 'x' })

    const res = await postSesInbound(receivedNotification(mime, CONTACT_ADDRESS, { virus: 'FAIL' }))
    expect(res.status).toBe('ignored')
    expect(res.reason).toBe('virus')
  })

  it('drops mail addressed to the bounce return-path', async () => {
    const email = `ses-ooo-${uuidv4().slice(0, 8)}@example.com`
    const bounceAddress = `bounce+abc123@${INBOX_DOMAIN}`
    const mime = buildMime({ from: email, to: bounceAddress, subject: 'Out of Office', html: '<p>away</p>', text: 'away' })

    const res = await postSesInbound(receivedNotification(mime, bounceAddress))
    expect(res.status).toBe('ignored')
    expect(res.reason).toBe('bounce_address')
  })

  it('rejects an invalid SNS signature with 406 when verification is exercised', async () => {
    const mime = buildMime({ from: 'a@example.com', to: CONTACT_ADDRESS, subject: 'x', text: 'x' })
    const bad = receivedNotification(mime, CONTACT_ADDRESS)
    bad.SigningCertURL = 'http://evil.example.com/cert.pem'
    let status = 0
    try {
      await $fetch('/api/webhooks/ses/inbound', {
        method: 'POST',
        body: bad,
        headers: { 'x-test-verify-sig': '1' },
      })
    } catch (err: any) {
      status = err?.statusCode || err?.response?.status || 0
    }
    expect(status).toBe(406)
  })
})

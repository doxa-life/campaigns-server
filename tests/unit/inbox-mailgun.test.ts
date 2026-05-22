import { describe, expect, it } from 'vitest'
import { createHmac } from 'crypto'
import {
  createSignedReplyAddress,
  parseInboundAuthentication,
  parseReplyAddress,
  verifyMailgunSignature,
  verifyStaffReplySignature
} from '../../server/utils/inbox-mailgun'

describe('inbox mailgun helpers', () => {
  it('verifies Mailgun webhook signatures and rejects replays', () => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const token = `token-${Math.random()}`
    const signingKey = 'secret'
    const signature = createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest('hex')

    expect(verifyMailgunSignature({ timestamp, token, signature, signingKey })).toBe(true)
    expect(verifyMailgunSignature({ timestamp, token, signature, signingKey })).toBe(false)
  })

  it('parses and verifies signed staff reply addresses', () => {
    const address = createSignedReplyAddress({
      baseToken: 'conversation-token',
      userId: 'be456cf0-8312-4334-9857-a4be2f541513',
      conversationId: 42,
      inboxDomain: 'doxa.life',
      secret: 'secret',
      expiresAt: Date.now() + 60_000
    })

    const parsed = parseReplyAddress(address, 'doxa.life')
    expect(parsed?.token).toBe('conversation-token')
    expect(verifyStaffReplySignature(parsed?.signedPart || null, 42, 'secret')?.userId).toBe('be456cf0-8312-4334-9857-a4be2f541513')
    expect(verifyStaffReplySignature(parsed?.signedPart || null, 41, 'secret')).toBeNull()
  })

  it('requires aligned DKIM authentication', () => {
    expect(parseInboundAuthentication('Authentication-Results: mx; dkim=pass header.d=example.com', 'person@example.com').authenticated).toBe(true)
    expect(parseInboundAuthentication('Authentication-Results: mx; dkim=pass header.d=other.com', 'person@example.com').authenticated).toBe(false)
    expect(parseInboundAuthentication('Authentication-Results: mx; spf=pass smtp.mailfrom=example.com', 'person@example.com').authenticated).toBe(false)
  })
})

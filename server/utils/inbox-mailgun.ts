import { createHmac, timingSafeEqual } from 'crypto'

const seenTokens = new Map<string, number>()
const TEN_MINUTES = 10 * 60 * 1000

export interface ParsedAddress {
  email: string
  name: string | null
  localPart: string
  domain: string
}

export interface ReplyAddressToken {
  token: string
  signedPart: string | null
}

export function parseAddress(value?: string | null): ParsedAddress | null {
  if (!value) return null
  const match = value.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/)
  const rawEmail = (match?.[2] || value).trim().toLowerCase()
  const [localPart, domain] = rawEmail.split('@')
  if (!localPart || !domain) return null
  const name = match?.[1]?.trim() || null
  return { email: rawEmail, name, localPart, domain }
}

export function parseReplyAddress(value: string, inboxDomain: string): ReplyAddressToken | null {
  const parsed = parseAddress(value)
  if (!parsed || parsed.domain !== inboxDomain.toLowerCase()) return null
  const plusIndex = parsed.localPart.indexOf('+')
  if (plusIndex === -1) return null
  const suffix = parsed.localPart.slice(plusIndex + 1)
  const dotIndex = suffix.indexOf('.')
  const token = dotIndex === -1 ? suffix : suffix.slice(0, dotIndex)
  const signedPart = dotIndex === -1 ? null : suffix.slice(dotIndex + 1)
  if (!token) return null
  return { token, signedPart: signedPart || null }
}

export function extractMessageIds(value?: string | null): string[] {
  if (!value) return []
  const bracketed = [...value.matchAll(/<[^>]+>/g)].map(m => m[0])
  if (bracketed.length) return bracketed
  return value.split(/\s+/).map(v => v.trim()).filter(Boolean)
}

export function verifyMailgunSignature(data: {
  timestamp?: string
  token?: string
  signature?: string
  signingKey?: string
}): boolean {
  if (!data.timestamp || !data.token || !data.signature || !data.signingKey) return false
  const timestampMs = Number(data.timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > TEN_MINUTES) return false

  for (const [token, expiresAt] of seenTokens) {
    if (expiresAt < Date.now()) seenTokens.delete(token)
  }
  if (seenTokens.has(data.token)) return false

  const digest = createHmac('sha256', data.signingKey)
    .update(`${data.timestamp}${data.token}`)
    .digest('hex')

  const expected = Buffer.from(digest)
  const actual = Buffer.from(data.signature)
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual)
  if (ok) seenTokens.set(data.token, Date.now() + TEN_MINUTES)
  return ok
}

export function createStaffReplySignature(data: {
  userId: string
  conversationId: number
  expiresAt: number
  secret: string
}) {
  return createHmac('sha256', data.secret)
    .update(`${data.userId}:${data.conversationId}:${data.expiresAt}`)
    .digest('hex')
}

export function createSignedReplyAddress(data: {
  baseToken: string
  userId: string
  conversationId: number
  inboxDomain: string
  secret: string
  expiresAt?: number
}) {
  const expiresAt = data.expiresAt || Date.now() + 14 * 24 * 60 * 60 * 1000
  const sig = createStaffReplySignature({ userId: data.userId, conversationId: data.conversationId, expiresAt, secret: data.secret })
  return `contact+${data.baseToken}.${data.userId}~${expiresAt}~${sig}@${data.inboxDomain}`
}

export function verifyStaffReplySignature(signedPart: string | null, conversationId: number, secret: string): { userId: string } | null {
  if (!signedPart) return null
  const [userId, expiresAtRaw, sig] = signedPart.split('~')
  const expiresAt = Number(expiresAtRaw)
  if (!userId || !sig || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null
  const expected = createStaffReplySignature({ userId, conversationId, expiresAt, secret })
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(sig)
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null
  return { userId }
}

export function parseInboundAuthentication(headers: string, fromEmail: string): { authenticated: boolean; authResult: string } {
  const fromDomain = fromEmail.split('@')[1]?.toLowerCase() || ''
  const haystack = headers.toLowerCase()
  const dkimPass = /dkim=(pass|ok)/.test(haystack)
  const dkimDomainMatches = new RegExp(`(header\\.d|d)=\\s*${fromDomain.replace(/\./g, '\\.')}`).test(haystack)
  const authResult = headers || 'No authentication headers provided'
  return { authenticated: dkimPass && dkimDomainMatches, authResult }
}

export function isAutoResponder(data: { fromEmail: string; headers?: string | null }) {
  const from = data.fromEmail.toLowerCase()
  const headers = (data.headers || '').toLowerCase()
  return from.includes('mailer-daemon')
    || from.includes('postmaster')
    || from.includes('no-reply')
    || from.includes('noreply')
    || headers.includes('auto-submitted:')
    || headers.includes('precedence: bulk')
}

export function stripQuotedHtml(html?: string | null) {
  if (!html) return null
  return (html
    .split(/<blockquote[\s>]/i)[0]
    ?.split(/<div[^>]+class=["'][^"']*gmail_quote/i)[0] || null)
}

export function htmlToText(html?: string | null) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

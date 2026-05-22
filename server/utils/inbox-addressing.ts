import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Inbox email addressing + reply-by-email signing.
 *
 * Contacts reply to a plain per-conversation address: `contact+<token>@<domain>`.
 * Staff notifications carry a *signed* Reply-To: `contact+<token>.<exp36>.<sig>@<domain>`,
 * where `sig = HMAC(secret, "{user_id}:{conversation_id}:{exp}")`. The signature lets us
 * authenticate the staff sender on inbound without trusting the `From` header. We never
 * embed the user id in the address — on inbound we recompute the sig for each user with
 * `inbox.send` (a tiny set) and match.
 *
 * Everything is lowercase hex/base36 and compared case-insensitively, so MTAs that
 * case-fold the local part don't break matching.
 */

const SIG_LENGTH = 20 // hex chars (80-bit truncation — gates a convenience path that also requires DKIM)
const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60 // 14 days

export interface ParsedRecipient {
  localPart: string // full local part, lowercased (e.g. 'contact+abc123.k3.f00d')
  domain: string // lowercased
  base: string // local part before '+' (e.g. 'contact')
  token: string | null // conversation reply token
  exp: number | null // unix seconds, if a signed address
  sig: string | null // signature, if a signed address
}

function getLocalAndDomain(address: string): { local: string; domain: string } | null {
  // Strip any display name: "Name" <a@b> → a@b
  const match = address.match(/<([^>]+)>/)
  const bare = (match ? match[1]! : address).trim().toLowerCase()
  const at = bare.lastIndexOf('@')
  if (at === -1) return null
  return { local: bare.slice(0, at), domain: bare.slice(at + 1) }
}

/** Parse an inbound recipient into its routing parts. Returns null if it isn't an email. */
export function parseInboxRecipient(address: string): ParsedRecipient | null {
  const parts = getLocalAndDomain(address)
  if (!parts) return null

  const { local, domain } = parts
  const plus = local.indexOf('+')
  const base = plus === -1 ? local : local.slice(0, plus)
  const tag = plus === -1 ? '' : local.slice(plus + 1)

  let token: string | null = null
  let exp: number | null = null
  let sig: string | null = null

  if (tag) {
    const segments = tag.split('.')
    token = segments[0] || null
    if (segments.length >= 3) {
      const parsedExp = parseInt(segments[1]!, 36)
      exp = Number.isNaN(parsedExp) ? null : parsedExp
      sig = segments[2] || null
    }
  }

  return { localPart: local, domain, base, token, exp, sig }
}

/** The plain reply address a contact uses. */
export function buildContactReplyAddress(token: string, contactAddress: string): string {
  const parts = getLocalAndDomain(contactAddress)
  if (!parts) return contactAddress
  return `${parts.local}+${token}@${parts.domain}`
}

export function computeReplySig(secret: string, userId: string, conversationId: number, exp: number): string {
  return createHmac('sha256', secret)
    .update(`${userId}:${conversationId}:${exp}`)
    .digest('hex')
    .slice(0, SIG_LENGTH)
}

/** A signed Reply-To for a staff notification, authenticating that user as the sender. */
export function buildSignedReplyAddress(opts: {
  token: string
  userId: string
  conversationId: number
  secret: string
  contactAddress: string
  ttlSeconds?: number
}): string {
  const parts = getLocalAndDomain(opts.contactAddress)
  if (!parts) return opts.contactAddress
  const exp = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS)
  const sig = computeReplySig(opts.secret, opts.userId, opts.conversationId, exp)
  return `${parts.local}+${opts.token}.${exp.toString(36)}.${sig}@${parts.domain}`
}

/** Constant-time check that `candidateSig` is the signature for this user/conversation/exp and is unexpired. */
export function verifyReplySig(opts: {
  secret: string
  userId: string
  conversationId: number
  exp: number
  candidateSig: string
}): boolean {
  if (!opts.candidateSig) return false
  if (opts.exp * 1000 < Date.now()) return false
  const expected = computeReplySig(opts.secret, opts.userId, opts.conversationId, opts.exp)
  const a = Buffer.from(expected)
  const b = Buffer.from(opts.candidateSig.toLowerCase())
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Outbound From: personal alias when set, otherwise the system contact identity. */
export function buildFromAddress(opts: {
  firstName?: string | null
  alias?: string | null
  domain: string
  contactAddress: string
}): string {
  if (opts.alias) {
    const first = (opts.firstName || '').trim().split(/\s+/)[0] || 'Doxa'
    return `"${first} with Doxa" <${opts.alias}@${opts.domain}>`
  }
  return `"Doxa Prayer" <${opts.contactAddress}>`
}

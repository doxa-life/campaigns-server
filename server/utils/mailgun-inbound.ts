/**
 * Parsing helpers for Mailgun inbound (route store/forward) payloads.
 *
 * The `From` header is never trusted on its own — we parse the forwarded
 * Authentication-Results to decide whether a message is authenticated (DMARC passes,
 * or DKIM passes and aligns with the From domain), which gates reply-by-email trust
 * and ownership verification (see plan Cross-cutting).
 */

export interface InboundHeaders {
  get(name: string): string | null
  getAll(name: string): string[]
}

/** Parse Mailgun's `message-headers` (a JSON array of [name, value] pairs). */
export function parseMessageHeaders(raw: unknown): InboundHeaders {
  const map = new Map<string, string[]>()
  let pairs: [string, string][] = []

  if (typeof raw === 'string' && raw.trim()) {
    try {
      pairs = JSON.parse(raw)
    } catch {
      pairs = []
    }
  } else if (Array.isArray(raw)) {
    pairs = raw as [string, string][]
  }

  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    const key = String(pair[0]).toLowerCase()
    const existing = map.get(key) || []
    existing.push(String(pair[1]))
    map.set(key, existing)
  }

  return {
    get: (name: string) => map.get(name.toLowerCase())?.[0] ?? null,
    getAll: (name: string) => map.get(name.toLowerCase()) ?? [],
  }
}

/** Extract the bare email address from a `From`-style header value. */
export function extractEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null
  const angle = value.match(/<([^>]+)>/)
  const bare = (angle ? angle[1]! : value).trim().toLowerCase()
  const match = bare.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/)
  return match ? match[0] : null
}

/** Extract a display name from a `From`-style header value (everything before the angle brackets). */
export function extractDisplayName(value: string | null | undefined): string | null {
  if (!value) return null
  const angle = value.match(/^\s*"?([^"<]*?)"?\s*</)
  const name = angle?.[1]?.trim()
  return name || null
}

function domainOf(email: string | null): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  return at === -1 ? null : email.slice(at + 1).toLowerCase()
}

function domainsAlign(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // Relaxed alignment: organizational-domain match either direction
  return a.endsWith('.' + b) || b.endsWith('.' + a)
}

/**
 * Determine inbound authentication from forwarded headers.
 * Authenticated when DMARC passes, or (as a fallback) DKIM passes AND aligns with
 * the From domain.
 */
export function parseAuthentication(headers: InboundHeaders, fromEmail: string | null): { authenticated: boolean; authResult: string | null } {
  const authResults = headers.getAll('authentication-results').join('; ') || null
  const fromDomain = domainOf(fromEmail)

  if (!authResults) {
    return { authenticated: false, authResult: null }
  }

  const lower = authResults.toLowerCase()
  const dkimPass = /dkim=pass/.test(lower)
  const dmarcPass = /dmarc=pass/.test(lower)

  // Pull the signing domain from `header.d=` or `header.i=@domain`
  let dkimDomain: string | null = null
  const dMatch = lower.match(/header\.d=([a-z0-9.-]+)/)
  if (dMatch) dkimDomain = dMatch[1]!
  if (!dkimDomain) {
    const iMatch = lower.match(/header\.i=@([a-z0-9.-]+)/)
    if (iMatch) dkimDomain = iMatch[1]!
  }

  // DMARC pass is the authoritative "sender controls the From domain" verdict —
  // it succeeds via aligned DKIM *or* aligned SPF, so it covers Google Workspace
  // domains without custom DKIM (signed d=*.gappssmtp.com, which never aligns).
  // Fall back to DKIM-alignment for senders that publish no DMARC policy but sign
  // with a key aligned to the From domain.
  const authenticated = dmarcPass || (dkimPass && domainsAlign(dkimDomain, fromDomain))
  return { authenticated, authResult: authResults }
}

/** Detect auto-responders / bounces so we don't ping-pong with bots (suppresses auto-ack). */
export function isAutoResponderOrBounce(headers: InboundHeaders, fromEmail: string | null): boolean {
  const autoSubmitted = headers.get('auto-submitted')
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') return true

  const precedence = (headers.get('precedence') || '').toLowerCase()
  if (precedence === 'bulk' || precedence === 'auto_reply' || precedence === 'list') return true

  if (headers.get('x-autoreply') || headers.get('x-autorespond')) return true

  const local = (fromEmail || '').split('@')[0]?.toLowerCase() || ''
  if (['mailer-daemon', 'no-reply', 'noreply', 'postmaster'].includes(local)) return true

  return false
}

/**
 * Detect a vacation / out-of-office auto-reply specifically — a strict subset of
 * isAutoResponderOrBounce that EXCLUDES bounces and bulk/list mail. Used to auto-close
 * the conversation so an OOO reply doesn't re-open it or ping staff. Bounces are
 * deliberately not matched (they signal a delivery failure worth surfacing, and normally
 * arrive via the delivery webhook → suppression, not the inbound route).
 */
export function isVacationAutoReply(headers: InboundHeaders, fromEmail: string | null): boolean {
  // System / bounce senders are never treated as a vacation reply.
  const local = (fromEmail || '').split('@')[0]?.toLowerCase() || ''
  if (['mailer-daemon', 'no-reply', 'noreply', 'postmaster'].includes(local)) return false

  // RFC 3834: vacation responders mark themselves `auto-replied`.
  // Bounces / DSNs use `auto-generated`, which we deliberately do NOT match.
  const autoSubmitted = (headers.get('auto-submitted') || '').toLowerCase()
  if (autoSubmitted === 'auto-replied') return true

  // Non-standard but common auto-reply markers.
  const precedence = (headers.get('precedence') || '').toLowerCase()
  if (precedence === 'auto_reply') return true
  if (headers.get('x-autoreply') || headers.get('x-autorespond')) return true

  return false
}

export function parseSpamScore(headers: InboundHeaders, fields: Record<string, any>): number | null {
  const raw = headers.get('x-mailgun-sscore') || fields['X-Mailgun-Sscore'] || fields['spam-score']
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

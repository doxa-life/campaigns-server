// Browser tracking composable. Talks ONLY to Doxa's own /api/collect endpoint
// (same host as the page); the server forwards to Statinator. This keeps the
// upstream key off the client and makes the request invisible to ad-blockers
// (which match on third-party hostnames, not eTLD+1 / same-site).
//
// The composable is intentionally self-contained — no external script load,
// no window globals — so there's no async-load race and nothing for the
// blocker filter lists to match.

type TrackingOptions = {
  metadata?: Record<string, unknown> | null
  value?: number | null
  url?: string
  referrer?: string | null
  anonymous_hash?: string
  user_hash?: string
}

type PageviewOptions = Omit<TrackingOptions, 'value'>

const ANON_STORAGE_KEY = 'prayertools_anon_id'
const ANON_COOKIE_NAME = 'doxa_vid'
const COLLECT_PATH = '/api/collect'

function isFramedContext(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.top !== window.self) return true
  } catch {
    return true
  }
  return false
}

function localStorageUsable(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const k = '_doxa_probe'
    localStorage.setItem(k, '1')
    const ok = localStorage.getItem(k) === '1'
    localStorage.removeItem(k)
    return ok
  } catch {
    return false
  }
}

function readAnonCookie(): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null
  const prefix = `${ANON_COOKIE_NAME}=`
  for (const part of document.cookie.split('; ')) {
    if (part.indexOf(prefix) === 0) {
      try {
        return decodeURIComponent(part.substring(prefix.length))
      } catch {
        return null
      }
    }
  }
  return null
}

function writeAnonCookie(value: string, domain: string) {
  if (typeof document === 'undefined') return
  try {
    const domainPart = domain ? `; Domain=${domain}` : ''
    const securePart = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${ANON_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=63072000; SameSite=Lax${securePart}${domainPart}`
  } catch {
    // ignore — analytics is non-critical
  }
}

export function getVisitorId(): string {
  if (import.meta.server) return ''
  // Framed/sandboxed/partitioned contexts: return empty so the relay falls back
  // to IP+UA hashing at Statinator. Prevents minting per-partition UUIDs that
  // would fork visitor identity for the same real user.
  if (isFramedContext() || !localStorageUsable()) return ''

  const cookieDomain = String(useRuntimeConfig().public.statinatorCookieDomain || '')
  let fromLocal: string | null = null
  try {
    fromLocal = localStorage.getItem(ANON_STORAGE_KEY)
  } catch {
    return ''
  }
  const fromCookie = readAnonCookie()

  if (fromLocal) {
    if (fromCookie !== fromLocal) writeAnonCookie(fromLocal, cookieDomain)
    return fromLocal
  }
  if (fromCookie) {
    try { localStorage.setItem(ANON_STORAGE_KEY, fromCookie) } catch { /* ignore */ }
    return fromCookie
  }
  const id = crypto.randomUUID()
  try { localStorage.setItem(ANON_STORAGE_KEY, id) } catch { /* ignore */ }
  writeAnonCookie(id, cookieDomain)
  return id
}

function getScreenSize(): string | undefined {
  if (typeof window === 'undefined' || !window.screen) return undefined
  return `${window.screen.width}x${window.screen.height}`
}

function getLanguage(): string | undefined {
  if (typeof document === 'undefined') return undefined
  try {
    const match = document.cookie.match('(?:^|; )dt-magic-link-lang=([^;]*)')
    if (match && match[1] != null) return decodeURIComponent(match[1]).replace(/_.*$/, '')
  } catch {
    // ignore
  }
  const html = document.documentElement.lang
  if (html) return html.split('-')[0]
  return typeof navigator !== 'undefined' && navigator.language
    ? navigator.language.split('-')[0]
    : undefined
}

function getDefaultUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return window.location.pathname + window.location.search
}

function buildEventBody(eventType: string, options?: TrackingOptions) {
  const visitorId = options?.anonymous_hash ?? getVisitorId()
  return {
    event_type: eventType,
    url: options?.url ?? getDefaultUrl(),
    referrer: options?.referrer ?? (typeof document !== 'undefined' ? (document.referrer || null) : null),
    anonymous_hash: visitorId || undefined,
    user_hash: options?.user_hash,
    screen_size: getScreenSize(),
    language: getLanguage(),
    metadata: options?.metadata ?? null,
    value: options?.value ?? null
  }
}

function fireBeacon(body: unknown): boolean {
  if (typeof navigator === 'undefined') return false
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
      return navigator.sendBeacon(COLLECT_PATH, blob)
    }
  } catch {
    // fall through to fetch
  }
  return false
}

export function useTracking() {
  function trackEvent(eventType: string, options?: TrackingOptions) {
    if (import.meta.server) return
    const body = buildEventBody(eventType, options)
    // sendBeacon survives navigation/unload; fall back to fetch with keepalive.
    if (fireBeacon(body)) return
    try {
      void fetch(COLLECT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      })
    } catch {
      // analytics non-critical
    }
  }

  // Pageviews round-trip so the caller can seed a heartbeat loop with the id.
  async function trackPageview(options?: PageviewOptions): Promise<{ id: number | null }> {
    if (import.meta.server) return { id: null }
    const body = buildEventBody('pageview', options as TrackingOptions)
    try {
      const response = await fetch(COLLECT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      })
      if (!response.ok) return { id: null }
      const json = await response.json() as { id?: number | string | null }
      const raw = json?.id
      const id = typeof raw === 'string' ? Number(raw) : raw
      return { id: typeof id === 'number' && Number.isFinite(id) ? id : null }
    } catch {
      return { id: null }
    }
  }

  return {
    trackEvent,
    trackPageview
  }
}

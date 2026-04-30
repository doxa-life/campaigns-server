type TrackingOptions = {
  metadata?: Record<string, unknown> | null
  value?: number | null
  url?: string
  referrer?: string | null
  anonymous_hash?: string
  user_hash?: string
}

type PageviewOptions = Omit<TrackingOptions, 'value'>

declare global {
  interface Window {
    __doxaTrackQueue?: Array<
      | { type: 'event'; eventType: string; options?: TrackingOptions }
      | { type: 'pageview'; options?: PageviewOptions }
    >
    goStats?: {
      track: (eventType: string, options?: TrackingOptions) => void
      pageview: (options?: PageviewOptions, callback?: (response: { id?: string } | null) => void) => void
    }
  }
}

const ANON_STORAGE_KEY = 'prayertools_anon_id'
const ANON_COOKIE_NAME = 'doxa_vid'

function readAnonCookie(): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null
  const prefix = `${ANON_COOKIE_NAME}=`
  const parts = document.cookie.split('; ')
  for (const part of parts) {
    if (part.indexOf(prefix) === 0) return decodeURIComponent(part.substring(prefix.length))
  }
  return null
}

function writeAnonCookie(value: string, domain: string) {
  if (typeof document === 'undefined') return
  const domainPart = domain ? `; Domain=${domain}` : ''
  const securePart = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${ANON_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=63072000; SameSite=Lax${securePart}${domainPart}`
}

export function getVisitorId(): string {
  if (import.meta.server) return ''
  const cookieDomain = String(useRuntimeConfig().public.statinatorCookieDomain || '')
  const fromLocal = localStorage.getItem(ANON_STORAGE_KEY)
  const fromCookie = readAnonCookie()

  if (fromLocal) {
    if (fromCookie !== fromLocal) writeAnonCookie(fromLocal, cookieDomain)
    return fromLocal
  }
  if (fromCookie) {
    localStorage.setItem(ANON_STORAGE_KEY, fromCookie)
    return fromCookie
  }
  const id = crypto.randomUUID()
  localStorage.setItem(ANON_STORAGE_KEY, id)
  writeAnonCookie(id, cookieDomain)
  return id
}

export function useTracking() {
  function trackEvent(eventType: string, options?: TrackingOptions) {
    if (import.meta.server) return
    if (window.goStats) {
      window.goStats.track(eventType, options)
    } else {
      window.__doxaTrackQueue = window.__doxaTrackQueue || []
      window.__doxaTrackQueue.push({ type: 'event', eventType, options })
    }
  }

  function trackPageview(options?: PageviewOptions, callback?: (response: { id?: string } | null) => void) {
    if (import.meta.server) return
    if (window.goStats) {
      window.goStats.pageview(options, callback)
    } else {
      window.__doxaTrackQueue = window.__doxaTrackQueue || []
      window.__doxaTrackQueue.push({ type: 'pageview', options })
    }
  }

  return {
    trackEvent,
    trackPageview
  }
}

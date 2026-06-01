// First-party analytics client. The browser only posts to `/api/collect` on the
// same host as the page (no third-party script load, no third-party request).
// Doxa's server forwards each event to Statinator and returns the inserted
// event id, which seeds a per-page engagement heartbeat loop.
//
// Critical correctness rule: a SINGLE heartbeat interval at any time, with
// handoff across SPA navigations (flush the previous pageview's engagement,
// clear its timer, then start a new one keyed by the new event id). Spawning
// one loop per pageview would multiply engagement on every route change.

import type { RouteLocationNormalizedLoaded, RouteLocationNormalized } from 'vue-router'
import { LANGUAGE_CODES } from '../../config/languages'

const ANON_STORAGE_KEY = 'prayertools_anon_id'
const ANON_COOKIE_NAME = 'doxa_vid'
const SESSION_STARTED_KEY = '_doxa_session_started'
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_PATH = '/api/collect/heartbeat'

function writeAnonCookie(value: string, domain: string) {
  if (typeof document === 'undefined') return
  try {
    const domainPart = domain ? `; Domain=${domain}` : ''
    const securePart = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${ANON_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=63072000; SameSite=Lax${securePart}${domainPart}`
  } catch {
    // ignore
  }
}

function stripLocale(path: string): string {
  const segments = path.split('/')
  if (segments[1] && LANGUAGE_CODES.includes(segments[1])) {
    segments.splice(1, 1)
  }
  return segments.join('/') || '/'
}

function shouldTrackRoute(path: string): boolean {
  const normalized = stripLocale(path)
  return ![
    '/admin',
    '/superadmin',
    '/dashboard',
    '/accept-invitation',
    '/login',
    '/register',
    '/reset-password'
  ].some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

function currentDate(): string {
  return new Date().toISOString().split('T')[0]!
}

function routeMetadata(route: RouteLocationNormalizedLoaded | RouteLocationNormalized, language: string) {
  const path = stripLocale(route.path)
  const segments = path.split('/').filter(Boolean)
  const metadata: Record<string, unknown> = { language }

  if (path === '/') {
    metadata.route_type = 'home'
  } else if (path === '/subscriber') {
    metadata.route_type = 'subscriber_profile'
  } else if (path === '/unsubscribe') {
    metadata.route_type = 'unsubscribe'
  } else if (path === '/followup') {
    metadata.route_type = 'followup'
  } else if (segments[0] === 'adoption' && segments[1] === 'update') {
    metadata.route_type = 'adoption_update'
  } else if (segments[0] === 'adoption' && segments[1] === 'verify') {
    metadata.route_type = 'adoption_verify'
  } else if (segments.length >= 1 && segments[1] === 'prayer') {
    metadata.route_type = 'prayer_content'
    metadata.people_group_slug = segments[0]
    metadata.content_date = segments[2] || currentDate()
  } else if (segments.length >= 1 && segments[1] === 'verify') {
    metadata.route_type = 'subscriber_verify'
    metadata.people_group_slug = segments[0]
  } else if (segments.length === 1) {
    metadata.route_type = 'people_group'
    metadata.people_group_slug = segments[0]
  } else {
    metadata.route_type = 'other'
  }

  return metadata
}

function setRouteUid(route: RouteLocationNormalizedLoaded | RouteLocationNormalized, cookieDomain: string) {
  const uid = typeof route.query.uid === 'string' ? route.query.uid : null
  if (!uid) return
  try {
    localStorage.setItem(ANON_STORAGE_KEY, uid)
  } catch {
    // ignore
  }
  writeAnonCookie(uid, cookieDomain)
}

function getUtmParams(): Record<string, string> | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const val = params.get(key)
    if (val) utm[key] = val
  }
  return Object.keys(utm).length > 0 ? utm : null
}

function markSessionStartOnce(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_STARTED_KEY)) return false
    sessionStorage.setItem(SESSION_STARTED_KEY, '1')
    return true
  } catch {
    return false
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  if (!config.public.statinatorEnabled) return

  const cookieDomain = String(config.public.statinatorCookieDomain || '')
  const route = useRoute()
  const router = useRouter()
  const i18n = nuxtApp.$i18n as { locale: { value: string } }
  const { trackPageview } = useTracking()

  // Single heartbeat loop with handoff. One interval at a time, keyed by the
  // current pageview's event id. On each new pageview we flush the previous
  // pageview's accumulated engagement, clear the interval, then start fresh
  // with the new id. Per-pageview loops would multiply engagement across SPA
  // navigations — don't.
  let currentEventId: number | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  let engagedStart: number | null = null
  let totalEngaged = 0
  let isVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  // Dedupe pageviews by fullPath. Both app:mounted and router.afterEach can
  // fire for the initial route; the first wins.
  let lastSentPath = ''
  // Monotonic counter for pageview attempts. Each `sendPageview` captures its
  // generation; if a newer navigation has started by the time the await
  // resolves, we drop the stale result on the floor (else a late-arriving
  // response would bind the heartbeat loop to the wrong event id).
  let pageviewGen = 0

  function flushHeartbeat() {
    if (currentEventId == null) return
    // `value` is cumulative engaged seconds for this pageview. Statinator's
    // /api/heartbeat REPLACES the events row's value (not adds to it), so
    // sending growing totals is correct — don't switch to deltas.
    const now = Date.now()
    if (isVisible && engagedStart != null) {
      totalEngaged += (now - engagedStart) / 1000
      engagedStart = now
    }
    const value = Math.round(totalEngaged)
    if (value <= 0) return
    const body = JSON.stringify({ event_id: currentEventId, value })
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' })
        if (navigator.sendBeacon(HEARTBEAT_PATH, blob)) return
      }
    } catch {
      // fall through to fetch
    }
    try {
      void fetch(HEARTBEAT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true
      })
    } catch {
      // analytics non-critical
    }
  }

  function clearHeartbeat() {
    if (heartbeatInterval != null) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
  }

  function startHeartbeat(eventId: number) {
    clearHeartbeat()
    currentEventId = eventId
    totalEngaged = 0
    engagedStart = isVisible ? Date.now() : null
    heartbeatInterval = setInterval(flushHeartbeat, HEARTBEAT_INTERVAL_MS)
  }

  function startEngagement() {
    if (engagedStart == null) engagedStart = Date.now()
    isVisible = true
  }

  function pauseEngagement() {
    if (engagedStart != null) {
      totalEngaged += (Date.now() - engagedStart) / 1000
      engagedStart = null
    }
    isVisible = false
  }

  async function sendPageview(to: RouteLocationNormalizedLoaded | RouteLocationNormalized) {
    if (!shouldTrackRoute(to.path)) return
    if (to.fullPath === lastSentPath) return
    lastSentPath = to.fullPath
    const myGen = ++pageviewGen

    // Handoff: flush remaining engagement for the previous pageview and clear
    // its timer before we await the new pageview's id.
    flushHeartbeat()
    clearHeartbeat()
    currentEventId = null

    setRouteUid(to, cookieDomain)

    const metadata: Record<string, unknown> = { ...routeMetadata(to, i18n.locale.value) }
    const utm = getUtmParams()
    if (utm) Object.assign(metadata, utm)
    if (markSessionStartOnce()) metadata.session_start = true

    try {
      const { id } = await trackPageview({
        url: to.fullPath,
        metadata
      })
      // Rapid SPA navigations can leave older awaits resolving after newer
      // ones. If we're no longer the latest pageview attempt, drop the id —
      // its heartbeat would be attributed to a page the user has already left.
      if (myGen !== pageviewGen) return
      if (id != null) startHeartbeat(id)
    } catch {
      // Analytics is non-critical.
    }
  }

  nuxtApp.hook('app:mounted', () => {
    void sendPageview(route)
  })

  router.afterEach((to) => {
    void sendPageview(to)
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        pauseEngagement()
        flushHeartbeat()
      } else {
        startEngagement()
      }
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      pauseEngagement()
      flushHeartbeat()
      clearHeartbeat()
    })
  }
})

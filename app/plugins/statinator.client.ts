import type { RouteLocationNormalizedLoaded, RouteLocationNormalized } from 'vue-router'
import { LANGUAGE_CODES } from '../../config/languages'

const ANON_STORAGE_KEY = 'prayertools_anon_id'

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

function setRouteUid(route: RouteLocationNormalizedLoaded | RouteLocationNormalized) {
  const uid = typeof route.query.uid === 'string' ? route.query.uid : null
  if (uid) localStorage.setItem(ANON_STORAGE_KEY, uid)
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  if (!config.public.statinatorEnabled) return

  const projectId = String(config.public.statinatorProjectId || 'doxa')
  const statinatorUrl = String(config.public.statinatorUrl || '').replace(/\/$/, '')
  if (!statinatorUrl || !projectId) return

  const route = useRoute()
  const router = useRouter()
  const i18n = nuxtApp.$i18n as { locale: { value: string } }
  const { trackPageview } = useTracking()

  let scriptLoad: Promise<void> | null = null

  function loadScript() {
    if (window.goStats) return Promise.resolve()
    if (scriptLoad) return scriptLoad

    scriptLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.async = true
      script.src = `${statinatorUrl}/api/script.js`
      script.dataset.project = projectId
      script.dataset.storage = 'local'
      script.dataset.hashKey = ANON_STORAGE_KEY
      script.dataset.autoPageview = 'false'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Statinator script'))
      document.head.appendChild(script)
    })

    return scriptLoad
  }

  async function sendPageview(to: RouteLocationNormalizedLoaded | RouteLocationNormalized) {
    if (!shouldTrackRoute(to.path)) {
      window.__doxaTrackQueue = []
      return
    }

    setRouteUid(to)
    try {
      await loadScript()
      flushQueuedEvents()
      trackPageview({
        url: to.fullPath,
        metadata: routeMetadata(to, i18n.locale.value)
      })
    } catch {
      // Analytics is non-critical.
    }
  }

  function flushQueuedEvents() {
    if (!window.goStats || !window.__doxaTrackQueue?.length) return

    const queued = window.__doxaTrackQueue.splice(0)
    for (const item of queued) {
      if (item.type === 'event') {
        window.goStats.track(item.eventType, item.options)
      } else {
        window.goStats.pageview(item.options)
      }
    }
  }

  nuxtApp.hook('app:mounted', () => {
    void sendPageview(route)
  })

  router.afterEach((to) => {
    void sendPageview(to)
  })
})

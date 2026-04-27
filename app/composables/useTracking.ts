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

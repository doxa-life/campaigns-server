// Idle-loads the feedback web-component bundle from the configured feedback
// host (runtimeConfig `feedbackApiBase`), so the script and the widget's API
// calls always target the same server. It's a ~95 KB script not needed for
// first paint, so we defer it until the browser is idle to keep it off the
// initial load critical path. Call this from any layout that renders a
// <feedback-web-component>; the in-DOM guard means multiple callers still load
// the bundle only once.
export function useFeedbackScript() {
  const config = useRuntimeConfig()
  const apiBase = String(config.public.feedbackApiBase || '').replace(/\/$/, '')

  function loadFeedbackScript() {
    if (!apiBase) return
    const src = `${apiBase}/js/feedback-web-component.iife.js`
    if (document.querySelector(`script[src="${src}"]`)) return
    const script = document.createElement('script')
    script.src = src
    script.async = true
    document.head.appendChild(script)
  }

  onMounted(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadFeedbackScript, { timeout: 3000 })
    } else {
      setTimeout(loadFeedbackScript, 2000)
    }
  })
}

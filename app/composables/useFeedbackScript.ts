// Idle-loads the third-party feedback web-component bundle. It's a ~95 KB
// script not needed for first paint, so we defer it until the browser is idle
// to keep it off the initial load critical path. Call this from any layout
// that renders a <feedback-web-component>; the in-DOM guard means multiple
// callers still load the bundle only once.
const FEEDBACK_SCRIPT = 'https://support.gospelambition.org/js/feedback-web-component.iife.js'

function loadFeedbackScript() {
  if (document.querySelector(`script[src="${FEEDBACK_SCRIPT}"]`)) return
  const script = document.createElement('script')
  script.src = FEEDBACK_SCRIPT
  script.async = true
  document.head.appendChild(script)
}

export function useFeedbackScript() {
  onMounted(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadFeedbackScript, { timeout: 3000 })
    } else {
      setTimeout(loadFeedbackScript, 2000)
    }
  })
}

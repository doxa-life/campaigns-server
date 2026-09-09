// Idle-loads the Context chat web-component bundle from the configured Context
// host (runtimeConfig `contextApiBase`), so the script and the widget's API
// calls always target the same server. It isn't needed for first paint, so it
// waits for the browser to go idle. Call this from any layout that renders a
// <context-chat-web-component>; the in-DOM guard means multiple callers still
// load the bundle only once.
export function useContextChatScript() {
  const config = useRuntimeConfig()
  const apiBase = String(config.public.contextApiBase || '').replace(/\/$/, '')
  const clientId = String(config.public.contextWidgetClientId || '')

  function loadContextChatScript() {
    if (!apiBase || !clientId) return
    const src = `${apiBase}/js/context-chat-web-component.iife.js`
    if (document.querySelector(`script[src="${src}"]`)) return
    const script = document.createElement('script')
    script.src = src
    script.async = true
    document.head.appendChild(script)
  }

  onMounted(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadContextChatScript, { timeout: 3000 })
    } else {
      setTimeout(loadContextChatScript, 2000)
    }
  })
}

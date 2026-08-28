<template>
  <div v-if="siteKey" ref="container" />
</template>

<script setup lang="ts">
// Cloudflare Turnstile widget. Renders only when a site key is configured;
// without one (dev/test) the model stays null and the server skips
// verification. Tokens are single-use — call reset() after each submit.
const model = defineModel<string | null>({ default: null })

const config = useRuntimeConfig()
const siteKey = config.public.turnstileSiteKey as string
const container = ref<HTMLElement | null>(null)
let widgetId: string | null = null

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, any>) => string
      reset: (id?: string) => void
      remove: (id: string) => void
    }
  }
}

function renderWidget() {
  if (!container.value || !window.turnstile) return
  widgetId = window.turnstile.render(container.value, {
    sitekey: siteKey,
    callback: (token: string) => { model.value = token },
    'expired-callback': () => { model.value = null },
    'error-callback': () => { model.value = null }
  })
}

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile"]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      if (window.turnstile) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Turnstile'))
    document.head.appendChild(script)
  })
}

function reset() {
  model.value = null
  if (widgetId && window.turnstile) window.turnstile.reset(widgetId)
}

defineExpose({ reset })

onMounted(async () => {
  if (!siteKey) return
  try {
    await loadScript()
    renderWidget()
  } catch (error) {
    console.error('Turnstile failed to load:', error)
  }
})

onBeforeUnmount(() => {
  if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
})
</script>

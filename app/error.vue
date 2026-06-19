<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const route = useRoute()

// A chunk-load failure means this tab is holding a previous build whose
// content-hashed chunks no longer exist on the origin (a new version was deployed).
// It surfaces with one of these messages depending on browser/engine.
const chunkError = computed(() => {
  const text = `${props.error?.message ?? ''} ${props.error?.statusMessage ?? ''}`
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text)
})

// Throttle automatic reloads to at most one per tab every 10s, so a deploy that is
// still rolling out can't drive a tight reload loop. The tab self-heals on the
// reload that lands after the new build is fully live.
const RELOAD_KEY = 'doxa:chunk-error-reloaded-at'

function reloadApp() {
  reloadNuxtApp({ persistState: false })
}

onMounted(() => {
  if (!chunkError.value) return

  let last = 0
  try { last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0) } catch { /* sessionStorage unavailable */ }

  const now = Date.now()
  if (now - last > 10000) {
    try { window.sessionStorage.setItem(RELOAD_KEY, String(now)) } catch { /* sessionStorage unavailable */ }
    // Give a rolling deploy a moment to finish before re-fetching the shell.
    setTimeout(reloadApp, 2000)
  }
})

function handleRetry() {
  clearError({ redirect: route.fullPath })
}

function handleHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp>
    <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) p-4">
      <UCard class="w-full max-w-md" :ui="{ body: 'p-6 sm:p-8' }">
        <!-- Stale-chunk recovery: a new version is live, reload to pick it up -->
        <div v-if="chunkError" class="text-center space-y-4">
          <UIcon name="i-lucide-loader-circle" class="size-10 mx-auto text-primary animate-spin" />
          <h1 class="text-xl font-semibold text-(--ui-text)">
            Updating to the latest version…
          </h1>
          <p class="text-(--ui-text-muted)">
            A new version was just released. This will only take a moment.
          </p>
          <UButton color="primary" size="lg" block icon="i-lucide-rotate-cw" @click="reloadApp">
            Reload now
          </UButton>
        </div>

        <!-- Any other error -->
        <div v-else class="text-center space-y-4">
          <UIcon name="i-lucide-triangle-alert" class="size-10 mx-auto text-error" />
          <h1 class="text-xl font-semibold text-(--ui-text)">
            Something went wrong
          </h1>
          <p class="text-(--ui-text-muted)">
            {{ error?.statusCode ? `${error.statusCode} — ` : '' }}{{ error?.statusMessage || error?.message || 'An unexpected error occurred.' }}
          </p>
          <div class="flex flex-col sm:flex-row gap-3 pt-2">
            <UButton color="primary" size="lg" block icon="i-lucide-rotate-cw" @click="handleRetry">
              Try again
            </UButton>
            <UButton color="neutral" variant="subtle" size="lg" block icon="i-lucide-house" @click="handleHome">
              Go home
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UApp>
</template>

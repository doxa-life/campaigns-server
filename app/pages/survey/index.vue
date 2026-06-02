<template>
  <div class="flex items-center justify-center min-h-[50vh]">
    <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin" />
  </div>
</template>

<script setup lang="ts">
// Back-compat: emails sent before dynamic surveys link to /survey?id=... which
// always meant the May 2026 intercessor survey. Redirect to its keyed route,
// preserving the profile id and the current locale prefix.
const route = useRoute()
const localePath = useLocalePath()

await navigateTo(
  { path: localePath('/survey/may-2026-survey'), query: route.query },
  { redirectCode: 302 }
)
</script>

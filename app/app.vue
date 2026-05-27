<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ClientOnly>
      <div v-if="feedbackEnabled" class="site-feedback-widget">
        <feedback-web-component :profile-config="siteFeedbackConfig" />
      </div>
    </ClientOnly>
  </UApp>
</template>

<script setup>
const { initTheme } = useTheme()
const config = useRuntimeConfig()

useFeedbackScript()

const feedbackEnabled = computed(() => !!config.public.feedbackProjectId)

const siteFeedbackConfig = computed(() => JSON.stringify({
  profile: 'chat-bubble',
  apiBase: config.public.feedbackApiBase,
  enabled: true,
  showByDefault: false,
  instanceId: 'fb-campaigns-site',
  projectId: config.public.feedbackProjectId
}))

onMounted(() => {
  initTheme()
})
</script>

<style scoped>
.site-feedback-widget {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 40;
}
</style>

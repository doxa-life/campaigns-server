<template>
  <div class="min-h-[calc(100vh-200px)] flex items-center justify-center p-8">
    <div class="max-w-[500px] w-full">
      <UCard v-if="pending" class="text-center py-8">
        <div class="w-10 h-10 border-4 border-[var(--ui-border)] border-t-[var(--ui-text)] rounded-full animate-spin mx-auto mb-4" />
        <p>{{ $t('contact.verify.verifying') }}</p>
      </UCard>

      <UCard v-else-if="error" class="text-center py-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <UIcon name="i-lucide-x-circle" class="text-4xl text-[var(--ui-text)] shrink-0" />
          <h1 class="text-2xl font-bold m-0">{{ $t('contact.verify.error.title') }}</h1>
        </div>
        <p class="text-[var(--ui-text-muted)] mb-8 leading-relaxed">{{ $t('contact.verify.error.generic') }}</p>
      </UCard>

      <UCard v-else class="text-center py-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <UIcon name="i-lucide-check-circle" class="text-4xl text-[var(--ui-text)] shrink-0" />
          <h1 class="text-2xl font-bold m-0">{{ data?.already_verified ? $t('contact.verify.alreadyVerified.title') : $t('contact.verify.success.title') }}</h1>
        </div>
        <p class="text-[var(--ui-text-muted)] mb-8 leading-relaxed">{{ data?.already_verified ? $t('contact.verify.alreadyVerified.message') : $t('contact.verify.success.message') }}</p>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const { t } = useI18n()

const token = route.query.token as string

const { data, pending, error } = await useFetch('/api/contact/verify', {
  query: { token }
})

useHead(() => ({
  title: `${t('contact.verify.pageTitle')} - ${t('app.title')}`
}))
</script>

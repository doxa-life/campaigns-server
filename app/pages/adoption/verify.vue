<template>
  <div class="min-h-[calc(100vh-200px)] flex items-center justify-center p-8">
    <div class="max-w-[500px] w-full">
      <UCard v-if="pending" class="text-center py-8">
        <div class="w-10 h-10 border-4 border-[var(--ui-border)] border-t-[var(--ui-text)] rounded-full animate-spin mx-auto mb-4" />
        <p>{{ $t('adoption.verify.verifying') }}</p>
      </UCard>

      <UCard v-else-if="error" class="text-center py-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <UIcon name="i-lucide-x-circle" class="text-4xl text-[var(--ui-text)] shrink-0" />
          <h1 class="text-2xl font-bold m-0">{{ $t('adoption.verify.error.title') }}</h1>
        </div>
        <p class="text-[var(--ui-text-muted)] mb-8 leading-relaxed">{{ errorMessage }}</p>
      </UCard>

      <UCard v-else class="text-center py-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <UIcon name="i-lucide-check-circle" class="text-4xl text-[var(--ui-text)] shrink-0" />
          <h1 class="text-2xl font-bold m-0">{{ data?.already_verified ? $t('adoption.verify.alreadyVerified.title') : $t('adoption.verify.success.title') }}</h1>
        </div>
        <p class="text-[var(--ui-text-muted)] mb-8 leading-relaxed">{{ data?.already_verified ? $t('adoption.verify.alreadyVerified.message') : $t('adoption.verify.success.message', { peopleGroupName }) }}</p>
        <div v-if="data?.people_group_slug" class="flex flex-col gap-3 items-center">
          <UButton
            :to="`https://doxa.life/research/${data.people_group_slug}/resources/`"
            external
            color="neutral"
            variant="solid"
            size="lg"
            :label="$t('adoption.verify.viewResources')"
          />
          <UButton
            :to="localePath(`/${data.people_group_slug}`)"
            color="neutral"
            variant="outline"
            size="lg"
            :label="$t('adoption.verify.viewPeopleGroup')"
          />
        </div>
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
const localePath = useLocalePath()

const token = route.query.token as string

const { data, pending, error } = await useFetch('/api/adopt/verify', {
  query: { token }
})

const peopleGroupName = computed(() => data.value?.people_group_name || '')
const errorMessage = computed(() => {
  return t('adoption.verify.error.generic')
})

useHead(() => ({
  title: `${t('adoption.verify.pageTitle')} - ${t('app.title')}`
}))
</script>

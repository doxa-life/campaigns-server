<template>
  <div class="min-h-screen flex flex-col">
    <div v-if="pending" class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
      <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
      <p>{{ $t('prayerFuel.loading') }}</p>
    </div>

    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
      <h2 class="text-2xl font-bold mb-4">{{ $t('prayerFuel.error.title') }}</h2>
      <p class="text-muted mb-6">{{ error }}</p>
    </div>

    <div v-else-if="data" class="flex flex-col flex-1">
      <header class="border-b border-default py-8 px-4">
        <div class="max-w-4xl mx-auto">
          <div class="flex items-center justify-center gap-3">
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-chevron-left"
              :disabled="currentDay <= 1"
              @click="navigateToDay(currentDay - 1)"
            />
            <h1 class="text-3xl font-bold text-center">Day {{ currentDay }}</h1>
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-chevron-right"
              @click="navigateToDay(currentDay + 1)"
            />
          </div>
        </div>
      </header>

      <PrayerFuelDisplay
        :content="data.content"
        :has-content="data.hasContent"
        :prayed-marked="false"
        :submitting="false"
        :metadata="data.metadata"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const router = useRouter()
const { locale } = useI18n()
const localePath = useLocalePath()

const currentDay = computed(() => {
  const day = Number(route.params.day)
  return day > 0 ? day : 1
})

function navigateToDay(day: number) {
  if (day < 1) return
  router.push(localePath(`/library/demo/${day}`))
}

const globalStartDate = ref<string | null>(null)

const { data: peopleGroupData } = await useFetch('/api/people-groups/detail/zuara')

if (peopleGroupData.value) {
  globalStartDate.value = (peopleGroupData.value as any).global_start_date
}

const contentDate = computed(() => {
  if (!globalStartDate.value) return ''
  const start = new Date(globalStartDate.value)
  start.setDate(start.getDate() + currentDay.value - 1)
  return start.toISOString().split('T')[0]
})

interface ContentItem {
  id: number
  title?: string
  language_code: string
  content_json: Record<string, any> | string | null
  content_date: string
  content_type: string
  people_group_data?: any
}

interface PrayerContentResponse {
  people_group: { id: number; slug: string; title: string; default_language: string }
  date: string
  language: string
  availableLanguages: string[]
  content: ContentItem[]
  hasContent: boolean
  globalStartDate: string | null
  metadata: {
    copyright_notices: { id: string; notice: string }[] | null
  }
}

const { data, pending, error: fetchError, refresh } = await useFetch<PrayerContentResponse>(
  computed(() => `/api/people-groups/zuara/prayer-content/${contentDate.value}`),
  {
    query: computed(() => ({
      language: locale.value || undefined
    })),
    watch: [contentDate]
  }
)

const error = computed(() => fetchError.value?.message || null)

watch(locale, () => {
  refresh()
})

useHead({
  title: 'Library Demo'
})
</script>

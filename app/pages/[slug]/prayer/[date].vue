<template>
  <div class="min-h-screen flex flex-col">
    <div v-if="pending" class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
      <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
      <p>{{ $t('prayerFuel.loading') }}</p>
    </div>

    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
      <h2 class="text-2xl font-bold mb-4">{{ $t('prayerFuel.error.title') }}</h2>
      <p class="text-muted mb-6">{{ error }}</p>
      <UButton :to="localePath(`/${slug}`)">{{ $t('prayerFuel.error.backToCampaign') }}</UButton>
    </div>

    <div v-else-if="data" class="flex flex-col flex-1">
      <!-- People Group Header with Navigation -->
      <header class="border-b border-default py-8 px-4">
        <div class="max-w-4xl mx-auto">
          <div class="flex items-center justify-center gap-3">
            <UButton
              :to="localePath(`/${slug}/prayer/${previousDate}`)"
              variant="ghost"
              size="sm"
              icon="i-lucide-chevron-left"
            />
            <h1 class="text-3xl font-bold text-center">{{ formatDate(data.date, selectedLanguage) }}</h1>
            <UButton
              v-if="!isNextDateFuture"
              :to="localePath(`/${slug}/prayer/${nextDate}`)"
              variant="ghost"
              size="sm"
              icon="i-lucide-chevron-right"
            />
            <UButton
              v-else
              :to="localePath(`/${slug}/prayer`)"
              variant="ghost"
              size="sm"
              icon="i-lucide-chevron-right"
            />
          </div>
        </div>
      </header>

      <!-- Content Display -->
      <PrayerFuelDisplay
        :content="data.content"
        :has-content="data.hasContent"
        :prayed-marked="prayedMarked"
        :submitting="submitting"
        @pray="markAsPrayed"
      />

      <!-- Past Prayer Fuel -->
      <PastPrayerFuelGrid
        v-if="pastContent.length"
        :items="pastContent"
        :slug="slug"
        :language="selectedLanguage"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const { locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const slug = route.params.slug as string
const dateParam = route.params.date as string
const { setPeopleGroupTitle } = usePeopleGroup()
const { trackEvent } = useTracking()
const viewedTrackingKey = ref<string | null>(null)

// Content date from route param
const contentDate = computed(() => dateParam)

// Get language preference from global language selector or query param
const selectedLanguage = ref((route.query.language as string) || locale.value || '')

// People group ID for optimized session tracking
const peopleGroupId = computed(() => data.value?.people_group?.id)

// Use prayer session composable
const { prayedMarked, submitting, markAsPrayed, formatDate } = usePrayerSession(slug, contentDate, peopleGroupId)

// Fetch prayer content for specific date
const { data, pending, error: fetchError, refresh } = await useFetch(
  `/api/people-groups/${slug}/prayer-content/${dateParam}`,
  {
    query: computed(() => ({
      language: selectedLanguage.value || undefined
    }))
  }
)

const error = computed(() => fetchError.value?.message || null)

// Set selected language and people group title after data loads
watch(data, (newData) => {
  if (newData) {
    if (!selectedLanguage.value) {
      selectedLanguage.value = newData.language
    }
    if (newData.people_group?.title) {
      setPeopleGroupTitle(newData.people_group.title, newData.people_group.image_url)
    }
    const trackingKey = `${slug}:${newData.date}:${newData.language}`
    if (viewedTrackingKey.value !== trackingKey) {
      viewedTrackingKey.value = trackingKey
      trackEvent('prayer_content_viewed', {
        metadata: {
          people_group_slug: slug,
          content_date: newData.date
        }
      })
    }
  }
}, { immediate: true })

// Watch global language changes
watch(locale, async (newLang) => {
  if (newLang && newLang !== selectedLanguage.value) {
    selectedLanguage.value = newLang
    await refresh()
  }
})

// Generate past 7 days (yesterday through 7 days ago)
const pastContent = computed(() => {
  const items: Array<{ id: string; content_date: string }> = []
  const today = new Date()
  for (let i = 1; i <= 7; i++) {
    const pastDate = new Date(today)
    pastDate.setDate(today.getDate() - i)
    const dateStr = pastDate.toISOString().split('T')[0]!
    items.push({ id: dateStr, content_date: dateStr })
  }
  return items
})

// Compute previous and next dates for navigation
const previousDate = computed(() => {
  const date = new Date(dateParam)
  date.setDate(date.getDate() - 1)
  return date.toISOString().split('T')[0]
})

const nextDate = computed(() => {
  const date = new Date(dateParam)
  date.setDate(date.getDate() + 1)
  return date.toISOString().split('T')[0]
})

// Check if next date is in the future (shouldn't navigate to future dates)
const isNextDateFuture = computed(() => {
  const next = new Date(nextDate.value!)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return next >= today
})

// Set people group title on mount (handles cached data from navigation)
onMounted(() => {
  if (data.value?.people_group?.title) {
    setPeopleGroupTitle(data.value.people_group.title, data.value.people_group.image_url)
  }
})

// Set page title
const { t } = useI18n()
useHead(() => ({
  title: data.value?.hasContent
    ? `${t('prayerFuel.pageTitle')} - ${data.value.people_group.title}`
    : `${t('prayerFuel.pageTitle')} - ${data.value?.people_group.title || t('common.loading')}`
}))
</script>

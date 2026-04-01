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
      <!-- Future Start Date Message -->
      <template v-if="isStartDateFuture">
        <div class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
          <UIcon name="i-lucide-calendar-clock" class="w-16 h-16 text-muted mb-6" />
          <h2 class="text-2xl font-bold mb-4">{{ $t('prayerFuel.startsOn.title') }}</h2>
          <p class="text-muted mb-8 max-w-md">{{ $t('prayerFuel.startsOn.message', { date: formattedStartDate }) }}</p>
          <UButton :to="localePath(`/${slug}`)" size="lg" class="rounded-full">
            {{ $t('campaign.signupButton') }}
          </UButton>
        </div>
      </template>

      <!-- Regular Content -->
      <template v-else>
        <!-- People Group Header -->
        <header class="border-b border-default py-8 px-4">
          <div class="max-w-4xl mx-auto">
            <h1 class="text-3xl font-bold mb-2 text-center">{{ $t('prayerFuel.title') }}</h1>
            <p class="text-muted text-center">{{ formatDate(data.date, selectedLanguage) }}</p>
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
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
interface PeopleGroupData {
  name: string
  image_url: string | null
  description: string | null
  population: number | null
  language: string | null
  religion: string | null
  country: string | null
  lat: number | null
  lng: number | null
  picture_credit: Array<{ text: string; link: string | null }> | null
}

interface PrayerContentItem {
  id: number
  title?: string
  language_code: string
  content_json?: Record<string, unknown> | string | null
  content_date: string
  content_type?: string
  people_group_data?: PeopleGroupData | null
}

interface PrayerContentResponse {
  people_group: {
    id: number
    slug: string
    title: string
    default_language: string
  }
  date: string
  language: string
  availableLanguages: string[]
  content: PrayerContentItem[]
  hasContent: boolean
  globalStartDate: string | null
}

definePageMeta({
  layout: 'default'
})

const { locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const slug = route.params.slug as string
const { setPeopleGroupTitle } = usePeopleGroup()

// Get current date in user's timezone
const currentDate = computed(() => new Date().toISOString().split('T')[0] as string)

// Get language preference from global language selector or query param
const selectedLanguage = ref((route.query.language as string) || locale.value || '')

// People group ID for optimized session tracking
const peopleGroupId = computed(() => data.value?.people_group?.id)

// Check if the start date is in the future
const globalStartDate = computed(() => data.value?.globalStartDate)
const isStartDateFuture = computed(() => {
  if (!globalStartDate.value) return false
  // Parse as local date to avoid timezone issues (YYYY-MM-DD format)
  const [year, month, day] = globalStartDate.value.split('-').map(Number)
  const startDate = new Date(year!, month! - 1, day!)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return startDate > today
})

// Format the start date for display
const formattedStartDate = computed(() => {
  if (!globalStartDate.value) return ''
  // Parse as local date to avoid timezone issues (YYYY-MM-DD format)
  const [year, month, day] = globalStartDate.value.split('-').map(Number)
  const startDate = new Date(year!, month! - 1, day!)
  return startDate.toLocaleDateString(locale.value, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

// Use prayer session composable
const { prayedMarked, submitting, markAsPrayed, formatDate } = usePrayerSession(slug, currentDate, peopleGroupId)

// Fetch prayer content
const { data, pending, error: fetchError, refresh } = await useFetch<PrayerContentResponse>(
  computed(() => `/api/people-groups/${slug}/prayer-content/${currentDate.value}`),
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

<template>
  <div class="library-content-page">
    <div class="page-header">
      <div>
        <NuxtLink to="/admin/libraries" class="back-link">← Back to Libraries</NuxtLink>
        <h1 v-if="library" class="library-name">{{ library.name }}</h1>
        <p v-if="library && library.description" class="library-description">{{ library.description }}</p>
      </div>
      <div class="header-actions">
        <UButton
          @click="openTranslateAllModal"
          variant="outline"
          icon="i-lucide-languages"
          :disabled="availableSourceLanguages.length === 0"
        >
          Translate All Content
        </UButton>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading library content...</div>

    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="content-editor">
      <!-- Language Filter -->
      <div class="filter-bar">
        <div class="filter-group">
          <label>Filter by Language:</label>
          <USelect
            v-model="selectedLanguage"
            :items="languageOptions"
            value-key="value"
            class="language-select"
          />
        </div>
        <div class="stats">
          <span>Total Days: {{ dayRange.maxDay || 0 }}</span>
        </div>
      </div>

      <!-- Calendar View -->
      <div class="calendar-container">
        <div class="calendar-header">
          <h3>Days Calendar</h3>
          <div class="legend">
            <span class="legend-item">
              <span class="indicator complete"></span> All languages
            </span>
            <span class="legend-item">
              <span class="indicator partial"></span> Some languages
            </span>
            <span class="legend-item">
              <span class="indicator empty"></span> No content
            </span>
          </div>
        </div>

        <div class="days-grid">
          <UButton
            v-for="day in displayDays"
            :key="day"
            @click="selectDay(day)"
            :variant="getDayVariant(day)"
            :color="getDayColor(day)"
            :title="getDayTooltip(day)"
            class="aspect-square p-0! justify-center"
          >
            {{ day }}
          </UButton>
        </div>

        <div class="pagination-controls">
          <UButton
            v-if="currentPage > 1"
            @click="previousPage"
            variant="outline"
            size="sm"
          >
            Previous
          </UButton>
          <span class="page-info">
            Days {{ startDay }}-{{ endDay }}
          </span>
          <UButton
            @click="nextPage"
            variant="outline"
            size="sm"
          >
            Next
          </UButton>
        </div>
      </div>

    </div>

    <!-- Translation Options Modal -->
    <TranslationOptionsModal
      v-model:open="showTranslateModal"
      mode="all"
      :available-languages="availableSourceLanguages"
      :existing-languages="availableSourceLanguages"
      :loading="startingTranslation"
      @translate="handleStartBulkTranslation"
      @cancel="showTranslateModal = false"
    />

    <!-- Translation Progress Modal -->
    <TranslationProgressModal
      v-model:open="showProgressModal"
      :library-id="libraryId"
      @close="handleProgressClose"
      @cancelled="handleProgressCancelled"
    />
  </div>
</template>

<script setup lang="ts">
import { getLanguageName, LANGUAGES } from '~/utils/languages'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const route = useRoute()
const libraryId = computed(() => parseInt(route.params.id as string))

interface Library {
  id: number
  name: string
  description: string
  stats?: {
    totalDays: number
    languageStats: { [key: string]: number }
  }
}

interface LibraryContent {
  id: number
  library_id: number
  day_number: number
  language_code: string
  title: string
  content_json: any
}

const library = ref<Library | null>(null)
const loading = ref(true)
const error = ref('')
const selectedLanguage = ref('all')
const dayContentMap = ref<Map<number, LibraryContent[]>>(new Map())
const dayRange = ref({ minDay: 1, maxDay: 365 })
const currentPage = ref(1)
const daysPerPage = 100
const toast = useToast()

// Translation state
const showTranslateModal = ref(false)
const showProgressModal = ref(false)
const startingTranslation = ref(false)

const languageOptions = computed(() => [
  { label: 'All Languages', value: 'all' },
  ...LANGUAGES.map(lang => ({
    label: `${lang.flag} ${lang.name}`,
    value: lang.code
  }))
])

// Languages that have content in the library (can be used as source)
const availableSourceLanguages = computed(() => {
  const languages = new Set<string>()
  dayContentMap.value.forEach(contents => {
    contents.forEach(c => languages.add(c.language_code))
  })
  return Array.from(languages)
})

const startDay = computed(() => (currentPage.value - 1) * daysPerPage + 1)
const endDay = computed(() => Math.min(currentPage.value * daysPerPage, dayRange.value.maxDay || 365))
const displayDays = computed(() => {
  const days = []
  for (let i = startDay.value; i <= endDay.value; i++) {
    days.push(i)
  }
  return days
})

async function loadLibrary() {
  try {
    const response = await $fetch<{ library: Library }>(`/api/admin/libraries/${libraryId.value}`)
    library.value = response.library

    if (response.library.stats?.totalDays) {
      dayRange.value.maxDay = Math.max(response.library.stats.totalDays, 365)
    }
  } catch (err) {
    console.error('Failed to load library:', err)
    error.value = 'Failed to load library'
  }
}

async function loadContent() {
  try {
    loading.value = true
    error.value = ''

    const response = await $fetch<{ content: Array<{ dayNumber: number; languages: string[]; content: LibraryContent[] }> }>(
      `/api/admin/libraries/${libraryId.value}/content?grouped=true`
    )

    // Build a map of day -> content
    const map = new Map<number, LibraryContent[]>()
    response.content.forEach(group => {
      map.set(group.dayNumber, group.content)
    })
    dayContentMap.value = map

    // Update day range
    if (response.content.length > 0) {
      const days = response.content.map(g => g.dayNumber)
      dayRange.value.maxDay = Math.max(...days, 365)
    }
  } catch (err: any) {
    error.value = 'Failed to load content'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function getDayStatus(day: number): 'complete' | 'partial' | 'empty' {
  const content = dayContentMap.value.get(day)

  if (!content || content.length === 0) {
    return 'empty'
  }

  if (selectedLanguage.value !== 'all') {
    // Filtered by language
    const hasLanguage = content.some(c => c.language_code === selectedLanguage.value)
    return hasLanguage ? 'complete' : 'empty'
  }

  // Check if all languages are present
  const languages = new Set(content.map(c => c.language_code))
  if (languages.size >= LANGUAGES.length) {
    return 'complete'
  } else if (languages.size > 0) {
    return 'partial'
  }

  return 'empty'
}

function getDayVariant(day: number): 'solid' | 'outline' {
  const status = getDayStatus(day)
  return status === 'empty' ? 'outline' : 'solid'
}

function getDayColor(day: number): 'success' | 'warning' | 'neutral' {
  const status = getDayStatus(day)
  if (status === 'complete') return 'success'
  if (status === 'partial') return 'warning'
  return 'neutral'
}

function getDayTooltip(day: number): string {
  const content = dayContentMap.value.get(day)

  if (!content || content.length === 0) {
    return `Day ${day}: No content`
  }

  const languages = content.map(c => getLanguageName(c.language_code)).join(', ')
  return `Day ${day}: ${languages}`
}

async function selectDay(day: number) {
  await navigateTo(`/admin/libraries/${libraryId.value}/days/${day}`)
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

function nextPage() {
  currentPage.value++
}

// Translation functions
function openTranslateAllModal() {
  showTranslateModal.value = true
}

async function handleStartBulkTranslation(options: { sourceLanguage: string; targetLanguages: string[]; overwrite: boolean; retranslateVerses: boolean }) {
  startingTranslation.value = true

  try {
    const response = await $fetch(`/api/admin/libraries/${libraryId.value}/translate`, {
      method: 'POST',
      body: {
        sourceLanguage: options.sourceLanguage,
        overwrite: options.overwrite,
        targetLanguages: options.targetLanguages,
        retranslateVerses: options.retranslateVerses
      }
    })

    if (response.totalJobs === 0) {
      toast.add({
        title: 'No translations needed',
        description: response.message,
        color: 'primary'
      })
      showTranslateModal.value = false
      return
    }

    // Show progress modal
    showTranslateModal.value = false
    showProgressModal.value = true

    toast.add({
      title: 'Translation started',
      description: `Queued ${response.totalJobs} translation job(s)`,
      color: 'primary'
    })
  } catch (err: any) {
    console.error('Failed to start translation:', err)
    toast.add({
      title: 'Failed to start translation',
      description: err.data?.statusMessage || 'An error occurred',
      color: 'error'
    })
  } finally {
    startingTranslation.value = false
  }
}

function handleProgressClose() {
  showProgressModal.value = false
  // Reload content to show newly translated items
  loadContent()
}

function handleProgressCancelled() {
  toast.add({
    title: 'Translation cancelled',
    description: 'Remaining translation jobs have been cancelled',
    color: 'warning'
  })
}

onMounted(async () => {
  await loadLibrary()
  await loadContent()
})

watch(selectedLanguage, () => {
  // Calendar view will automatically update based on the computed getDayStatus
})
</script>

<style scoped>
.library-content-page {
  max-width: 1400px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.header-actions {
  flex-shrink: 0;
}

.back-link {
  display: inline-block;
  color: var(--ui-text-muted);
  text-decoration: none;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.back-link:hover {
  color: var(--color-text);
}

.library-name {
  margin: 0 0 0.5rem;
}

.library-description {
  margin: 0;
  color: var(--ui-text-muted);
}

.loading, .error {
  text-align: center;
  padding: 2rem;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filter-group label {
  font-weight: 500;
  font-size: 0.875rem;
}

.language-select {
  min-width: 200px;
}

.stats {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.calendar-container {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1.5rem;
  background-color: var(--ui-bg);
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.calendar-header h3 {
  margin: 0;
}

.legend {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.indicator {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
}

.indicator.complete {
  background-color: #22c55e;
}

.indicator.partial {
  background-color: #eab308;
}

.indicator.empty {
  background-color: var(--ui-bg-elevated);
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

.page-info {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}
</style>

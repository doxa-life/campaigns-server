<template>
  <div class="people-group-content-page">
    <div class="page-header">
      <div>
        <NuxtLink :to="`/admin/people-groups/${peopleGroupId}`" class="back-link">← Back to People Group</NuxtLink>
        <h1 v-if="peopleGroup">{{ peopleGroup.title }} - Content Libraries</h1>
        <p class="subtitle">Manage content libraries specific to this people group</p>
      </div>
      <div class="header-actions">
        <UButton @click="showImportModal = true" variant="outline" icon="i-lucide-upload">
          Import
        </UButton>
        <UButton @click="showCreateModal = true" size="lg">
          + Create Library
        </UButton>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading libraries...</div>

    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else-if="libraries.length === 0" class="empty-state">
      <p>No content libraries yet. Create your first library to get started.</p>
      <UButton @click="showCreateModal = true" size="lg">
        Create Library
      </UButton>
    </div>

    <div v-else class="content-layout">
      <!-- Libraries List -->
      <div class="libraries-panel">
        <h3>Libraries</h3>
        <div class="libraries-list">
          <div
            v-for="library in libraries"
            :key="library.id"
            class="library-item"
            :class="{ active: selectedLibrary?.id === library.id }"
            @click="selectLibrary(library)"
          >
            <div class="library-info">
              <span class="library-name">{{ library.name }}</span>
              <span class="library-key">{{ library.library_key }}</span>
            </div>
            <div class="library-stats">
              <span>{{ library.stats?.totalDays || 0 }} days</span>
            </div>
            <div class="library-actions">
              <UButton
                @click.stop="handleExport(library)"
                variant="ghost"
                size="xs"
                icon="i-lucide-download"
                title="Export"
              />
              <UButton
                @click.stop="editLibrary(library)"
                variant="ghost"
                size="xs"
                icon="i-lucide-pencil"
                title="Edit"
              />
              <UButton
                @click.stop="deleteLibrary(library)"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                title="Delete"
                class="delete-btn"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Calendar Panel -->
      <div class="calendar-panel">
        <div v-if="!selectedLibrary" class="no-selection">
          <p>Select a library to view and edit its content</p>
        </div>

        <div v-else class="calendar-content">
          <div class="calendar-header-row">
            <div>
              <h3>{{ selectedLibrary.name }}</h3>
              <p v-if="selectedLibrary.description" class="library-description">{{ selectedLibrary.description }}</p>
            </div>
            <UButton
              @click="openTranslateAllModal"
              variant="outline"
              icon="i-lucide-languages"
              size="sm"
              :disabled="availableSourceLanguages.length === 0"
            >
              Translate All Content
            </UButton>
          </div>

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
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <UModal
      v-model:open="isModalOpen"
      :title="editingLibrary ? 'Edit Library' : 'Create Library'"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <form @submit.prevent="saveLibrary" class="modal-content">
          <UFormField label="Library Name" required>
            <UInput
              v-model="form.name"
              placeholder="Enter library name"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Library Key" :hint="editingLibrary ? 'Cannot be changed' : 'Used for internal identification (e.g., day_in_life, prayer_points)'">
            <UInput
              v-model="form.library_key"
              placeholder="e.g., day_in_life"
              class="w-full"
              :disabled="!!editingLibrary"
            />
          </UFormField>

          <UFormField label="Description">
            <UTextarea
              v-model="form.description"
              :rows="3"
              placeholder="Enter library description (optional)"
              class="w-full"
            />
          </UFormField>

          <UFormField>
            <UCheckbox
              v-model="form.repeating"
              label="Repeating / Continuous"
              description="When enabled, the library cycles through its content indefinitely"
            />
          </UFormField>

          <div class="modal-footer">
            <UButton type="button" variant="outline" @click="closeModal">Cancel</UButton>
            <UButton type="submit" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save Library' }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <ConfirmModal
      v-model:open="showDeleteModal"
      title="Delete Library"
      :message="libraryToDelete ? `Are you sure you want to delete &quot;${libraryToDelete.name}&quot;?` : ''"
      warning="This will also delete all associated content. This action cannot be undone."
      confirm-text="Delete"
      confirm-color="primary"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />

    <!-- Translation Options Modal -->
    <TranslationOptionsModal
      v-if="selectedLibrary"
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
      v-if="selectedLibrary"
      v-model:open="showProgressModal"
      :library-id="selectedLibrary.id"
      @close="handleProgressClose"
      @cancelled="handleProgressCancelled"
    />

    <!-- Import Modal -->
    <LibraryImportModal
      v-model:open="showImportModal"
      :people-group-id="peopleGroupId"
      :existing-libraries="libraries"
      @imported="handleImported"
    />
  </div>
</template>

<script setup lang="ts">
import { getLanguageName, getLanguageFlag, LANGUAGES } from '~/utils/languages'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const route = useRoute()
const peopleGroupId = computed(() => parseInt(route.params.id as string))

interface PeopleGroup {
  id: number
  title: string
  slug: string
}

interface Library {
  id: number
  name: string
  description: string
  library_key: string | null
  repeating: boolean
  people_group_id: number | null
  created_at: string
  updated_at: string
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
  content_json: any
}

const peopleGroup = ref<PeopleGroup | null>(null)
const libraries = ref<Library[]>([])
const selectedLibrary = ref<Library | null>(null)
const loading = ref(true)
const error = ref('')
const toast = useToast()
const { exportLibrary } = useLibraryExport()

// Create/Edit modal state
const showCreateModal = ref(false)
const showImportModal = ref(false)
const editingLibrary = ref<Library | null>(null)
const saving = ref(false)

const isModalOpen = computed({
  get: () => showCreateModal.value || !!editingLibrary.value,
  set: (value: boolean) => {
    if (!value) {
      closeModal()
    }
  }
})

const form = ref({
  name: '',
  description: '',
  library_key: '',
  repeating: false
})

// Delete modal state
const showDeleteModal = ref(false)
const libraryToDelete = ref<Library | null>(null)
const deleting = ref(false)

// Translation state
const showTranslateModal = ref(false)
const showProgressModal = ref(false)
const startingTranslation = ref(false)

// Calendar state
const selectedLanguage = ref('all')
const dayContentMap = ref<Map<number, LibraryContent[]>>(new Map())
const dayRange = ref({ minDay: 1, maxDay: 365 })
const currentPage = ref(1)
const daysPerPage = 100

const languageOptions = computed(() => [
  { label: 'All Languages', value: 'all' },
  ...LANGUAGES.map(lang => ({
    label: `${lang.flag} ${lang.name}`,
    value: lang.code
  }))
])

const startDay = computed(() => (currentPage.value - 1) * daysPerPage + 1)
const endDay = computed(() => Math.min(currentPage.value * daysPerPage, dayRange.value.maxDay || 365))
const displayDays = computed(() => {
  const days = []
  for (let i = startDay.value; i <= endDay.value; i++) {
    days.push(i)
  }
  return days
})

async function loadPeopleGroup() {
  try {
    const response = await $fetch<{ peopleGroup: PeopleGroup }>(`/api/admin/people-groups/${peopleGroupId.value}`)
    peopleGroup.value = response.peopleGroup
  } catch (err) {
    console.error('Failed to load people group:', err)
  }
}

async function loadLibraries() {
  try {
    loading.value = true
    error.value = ''
    const response = await $fetch<{ libraries: Library[] }>(`/api/admin/people-groups/${peopleGroupId.value}/libraries`)
    libraries.value = response.libraries

    // Auto-select first library if none selected
    const firstLibrary = response.libraries[0]
    if (firstLibrary && !selectedLibrary.value) {
      selectLibrary(firstLibrary)
    }
  } catch (err: any) {
    error.value = 'Failed to load libraries'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function selectLibrary(library: Library) {
  selectedLibrary.value = library
  currentPage.value = 1
  // Show at least 365 days even for empty libraries so users can add content
  dayRange.value = { minDay: 1, maxDay: Math.max(library.stats?.totalDays || 0, 365) }
  loadLibraryContent()
}

async function loadLibraryContent() {
  if (!selectedLibrary.value) return

  try {
    const response = await $fetch<{ content: Array<{ dayNumber: number; languages: string[]; content: LibraryContent[] }> }>(
      `/api/admin/libraries/${selectedLibrary.value.id}/content?grouped=true`
    )

    // Build a map of day -> content
    const map = new Map<number, LibraryContent[]>()
    response.content.forEach(group => {
      map.set(group.dayNumber, group.content)
    })
    dayContentMap.value = map

    // Update day range - ensure at least 365 days are shown
    if (response.content.length > 0) {
      const days = response.content.map(g => g.dayNumber)
      dayRange.value.maxDay = Math.max(...days, 365)
    } else {
      dayRange.value.maxDay = 365
    }
  } catch (err: any) {
    console.error('Failed to load library content:', err)
  }
}

function getDayStatus(day: number): 'complete' | 'partial' | 'empty' {
  const content = dayContentMap.value.get(day)

  if (!content || content.length === 0) {
    return 'empty'
  }

  if (selectedLanguage.value !== 'all') {
    const hasLanguage = content.some(c => c.language_code === selectedLanguage.value)
    return hasLanguage ? 'complete' : 'empty'
  }

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
  if (!selectedLibrary.value) return
  await navigateTo(`/admin/people-groups/${peopleGroupId.value}/libraries/${selectedLibrary.value.id}/days/${day}`)
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

function nextPage() {
  currentPage.value++
}

// Languages that have content in the selected library (can be used as source)
const availableSourceLanguages = computed(() => {
  const languages = new Set<string>()
  dayContentMap.value.forEach(contents => {
    contents.forEach(c => languages.add(c.language_code))
  })
  return Array.from(languages)
})

// Translation functions
function openTranslateAllModal() {
  showTranslateModal.value = true
}

async function handleStartBulkTranslation(options: { sourceLanguage: string; targetLanguages: string[]; overwrite: boolean; retranslateVerses: boolean }) {
  if (!selectedLibrary.value) return
  startingTranslation.value = true

  try {
    const response = await $fetch(`/api/admin/libraries/${selectedLibrary.value.id}/translate`, {
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
  loadLibraryContent()
}

function handleProgressCancelled() {
  toast.add({
    title: 'Translation cancelled',
    description: 'Remaining translation jobs have been cancelled',
    color: 'warning'
  })
}

// Library CRUD
function editLibrary(library: Library) {
  editingLibrary.value = library
  form.value = {
    name: library.name,
    description: library.description || '',
    library_key: library.library_key || '',
    repeating: library.repeating || false
  }
}

async function saveLibrary() {
  if (!form.value.name.trim()) {
    toast.add({
      title: 'Validation Error',
      description: 'Library name is required',
      color: 'error'
    })
    return
  }

  try {
    saving.value = true

    if (editingLibrary.value) {
      // Update existing library
      await $fetch(`/api/admin/libraries/${editingLibrary.value.id}`, {
        method: 'PUT',
        body: {
          name: form.value.name,
          description: form.value.description,
          repeating: form.value.repeating
        }
      })

      toast.add({
        title: 'Library updated',
        description: `"${form.value.name}" has been updated successfully.`,
        color: 'success'
      })
    } else {
      // Create new library
      await $fetch(`/api/admin/people-groups/${peopleGroupId.value}/libraries`, {
        method: 'POST',
        body: form.value
      })

      toast.add({
        title: 'Library created',
        description: `"${form.value.name}" has been created successfully.`,
        color: 'success'
      })
    }

    closeModal()
    await loadLibraries()
  } catch (err: any) {
    toast.add({
      title: 'Failed to save library',
      description: err.data?.statusMessage || 'An error occurred while saving the library.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function deleteLibrary(library: Library) {
  libraryToDelete.value = library
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!libraryToDelete.value) return

  const library = libraryToDelete.value

  try {
    deleting.value = true
    await $fetch(`/api/admin/libraries/${library.id}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Library deleted',
      description: `"${library.name}" has been deleted successfully.`,
      color: 'success'
    })

    // Clear selection if deleted library was selected
    if (selectedLibrary.value?.id === library.id) {
      selectedLibrary.value = null
      dayContentMap.value = new Map()
    }

    await loadLibraries()
  } catch (err: any) {
    toast.add({
      title: 'Failed to delete library',
      description: err.data?.statusMessage || 'An error occurred while deleting the library.',
      color: 'error'
    })
  } finally {
    deleting.value = false
    showDeleteModal.value = false
    libraryToDelete.value = null
  }
}

function cancelDelete() {
  showDeleteModal.value = false
  libraryToDelete.value = null
}

function closeModal() {
  showCreateModal.value = false
  editingLibrary.value = null
  form.value = {
    name: '',
    description: '',
    library_key: '',
    repeating: false
  }
}

async function handleExport(library: Library) {
  await exportLibrary(library)
}

function handleImported() {
  loadLibraries()
}

onMounted(async () => {
  await loadPeopleGroup()
  await loadLibraries()
})

watch(selectedLanguage, () => {
  // Calendar view will automatically update based on the computed getDayStatus
})
</script>

<style scoped>
.people-group-content-page {
  max-width: 1400px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.page-header h1 {
  margin: 0 0 0.5rem;
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

.subtitle {
  margin: 0;
  color: var(--ui-text-muted);
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.loading, .error {
  text-align: center;
  padding: 2rem;
}

.empty-state {
  text-align: center;
  padding: 3rem;
}

.empty-state p {
  margin-bottom: 1.5rem;
  color: var(--ui-text-muted);
}

.content-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .content-layout {
    grid-template-columns: 1fr;
  }
}

.libraries-panel {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1rem;
  background-color: var(--ui-bg);
}

.libraries-panel h3 {
  margin: 0 0 1rem;
  font-size: 1rem;
}

.libraries-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.library-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.library-item:hover {
  background-color: var(--ui-bg-elevated);
}

.library-item.active {
  border-color: var(--ui-text-highlighted);
  background-color: var(--ui-bg-elevated);
}

.library-info {
  flex: 1;
  min-width: 0;
}

.library-name {
  display: block;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-key {
  display: block;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.library-stats {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.library-actions {
  display: flex;
  gap: 0.25rem;
}

.delete-btn {
  color: var(--ui-text-muted);
}

.calendar-panel {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1.5rem;
  background-color: var(--ui-bg);
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: var(--ui-text-muted);
}

.calendar-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.calendar-header-row h3 {
  margin: 0 0 0.25rem;
}

.library-description {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
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
  justify-content: flex-end;
  margin-bottom: 1.5rem;
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
  grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
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

.modal-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 600px;
  margin: 0 auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1.5rem;
  border-top: 1px solid var(--color-border);
  margin-top: 0.5rem;
}
</style>

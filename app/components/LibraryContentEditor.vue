<template>
  <div class="editor-page">
    <div v-if="mode === 'edit' && loading" class="loading-state">
      <p>Loading content...</p>
    </div>

    <div v-else-if="mode === 'edit' && error" class="error-state">
      <p>{{ error }}</p>
      <UButton :to="backUrl">
        Back to Day {{ dayNumber }}
      </UButton>
    </div>

    <template v-else>
      <div class="editor-header">
        <NuxtLink :to="backUrl" class="back-link">
          ← Back to Day {{ dayNumber }}
        </NuxtLink>
        <div class="flex items-center gap-2">
          <UButton
            v-if="mode === 'edit'"
            @click="navigateDay(-1)"
            :disabled="dayNumber <= 1 || navigating"
            variant="outline"
            icon="i-lucide-chevron-left"
            size="sm"
          >
            Prev Day
          </UButton>
          <UButton
            v-if="mode === 'edit'"
            @click="navigateDay(1)"
            :disabled="navigating"
            variant="outline"
            trailing-icon="i-lucide-chevron-right"
            size="sm"
          >
            Next Day
          </UButton>
          <div class="mx-2 h-6 w-px bg-(--ui-border)" />
          <UButton @click="cancel" variant="outline">
            Cancel
          </UButton>
          <UButton @click="saveContent" :loading="saving" :disabled="!isValid">
            {{ mode === 'edit' ? 'Save Changes' : 'Save' }}
          </UButton>
        </div>
      </div>

      <div class="editor-container">
        <div class="editor-main">
          <div class="editor-details">
            Day {{ dayNumber }} • {{ selectedLanguage?.flag }} {{ selectedLanguage?.name }} ({{ selectedLanguage?.nativeName }})
          </div>
          <RichTextEditor v-model="form.content_json" />
        </div>
      </div>
    </template>

    <!-- Unsaved Changes Modal (route leave) -->
    <ConfirmModal
      v-model:open="showUnsavedChangesModal"
      title="Leave Without Saving?"
      message="Your changes will be lost."
      confirm-text="Leave"
      confirm-color="primary"
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />

    <!-- Unsaved Changes Modal (day navigation) -->
    <UModal v-model:open="showDayNavModal" title="Unsaved Changes">
      <template #body>
        <p>You have unsaved changes. What would you like to do?</p>
      </template>
      <template #footer>
        <div class="flex justify-between items-center gap-3 w-full">
          <UButton @click="showDayNavModal = false" variant="outline">
            Cancel
          </UButton>
          <div class="flex gap-2">
            <UButton @click="discardAndNavigate" color="error" variant="soft">
              Discard Changes
            </UButton>
            <UButton @click="saveAndNavigate" :loading="saving" color="primary">
              Save & Continue
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { getLanguageByCode } from '~/utils/languages'

interface LibraryContent {
  id: number
  library_id: number
  day_number: number
  language_code: string
  content_json: any
}

const props = defineProps<{
  libraryId: number
  dayNumber: number
  languageCode?: string
  backUrl: string
  mode: 'new' | 'edit'
  contentId?: number
}>()

const router = useRouter()
const toast = useToast()

const loadedLanguageCode = ref('')
const effectiveLanguageCode = computed(() =>
  props.mode === 'edit' ? loadedLanguageCode.value : (props.languageCode || 'en')
)
const selectedLanguage = computed(() => getLanguageByCode(effectiveLanguageCode.value))

provide('editorLanguage', effectiveLanguageCode)

const form = ref({
  content_json: {
    type: 'doc',
    content: [] as Array<{ content?: Array<{ text?: string }> }>
  }
})

const loading = ref(props.mode === 'edit')
const error = ref('')
const saving = ref(false)
const isSaved = ref(false)
const hasUnsavedChanges = ref(false)
const showUnsavedChangesModal = ref(false)
const showDayNavModal = ref(false)
const pendingNavigation = ref<any>(null)
const navigating = ref(false)
const pendingDayDirection = ref(0)

const isValid = computed(() => true)

const hasActualContent = computed(() => {
  if (form.value.content_json?.content && Array.isArray(form.value.content_json.content)) {
    for (const node of form.value.content_json.content) {
      if (node.content && Array.isArray(node.content) && node.content.length > 0) {
        for (const child of node.content) {
          if (child.text && child.text.trim().length > 0) {
            return true
          }
        }
      }
    }
  }
  return false
})

async function loadContent() {
  if (props.mode !== 'edit' || !props.contentId) return

  try {
    loading.value = true
    error.value = ''

    const response = await $fetch<{ content: LibraryContent }>(
      `/api/admin/libraries/${props.libraryId}/content/${props.contentId}`
    )

    form.value.content_json = response.content.content_json || { type: 'doc', content: [] }
    loadedLanguageCode.value = response.content.language_code

    await nextTick()

    watch(form, () => {
      hasUnsavedChanges.value = true
    }, { deep: true })

  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to load content'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function cancel() {
  router.push(props.backUrl)
}

async function saveContent() {
  if (!isValid.value) return

  try {
    saving.value = true

    if (props.mode === 'edit' && props.contentId) {
      await $fetch(`/api/admin/libraries/${props.libraryId}/content/${props.contentId}`, {
        method: 'PUT',
        body: {
          content_json: form.value.content_json
        }
      })

      isSaved.value = true
      hasUnsavedChanges.value = false

      toast.add({
        title: 'Content updated',
        description: 'Your changes have been saved successfully.',
        color: 'success'
      })
    } else {
      await $fetch(`/api/admin/libraries/${props.libraryId}/content`, {
        method: 'POST',
        body: {
          day_number: props.dayNumber,
          language_code: props.languageCode,
          content_json: form.value.content_json
        }
      })

      isSaved.value = true
      hasUnsavedChanges.value = false

      toast.add({
        title: 'Content created',
        description: 'Your content has been saved successfully.',
        color: 'success'
      })

      router.push(props.backUrl)
    }
  } catch (err: any) {
    console.error('Failed to save content:', err)
    toast.add({
      title: 'Failed to save content',
      description: err.data?.statusMessage || 'An error occurred while saving your content.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function navigateDay(direction: number) {
  const targetDay = props.dayNumber + direction
  if (targetDay < 1) return

  const shouldWarn = props.mode === 'new'
    ? hasActualContent.value
    : hasUnsavedChanges.value

  if (shouldWarn) {
    pendingDayDirection.value = direction
    showDayNavModal.value = true
    return
  }

  await performDayNavigation(direction)
}

async function performDayNavigation(direction: number) {
  const targetDay = props.dayNumber + direction
  navigating.value = true

  try {
    const response = await $fetch<{ content: Array<{ id: number; language_code: string }> }>(
      `/api/admin/libraries/${props.libraryId}/content/day/${targetDay}`
    )

    const match = response.content.find(c => c.language_code === effectiveLanguageCode.value)

    isSaved.value = true
    hasUnsavedChanges.value = false

    if (match) {
      await navigateTo(`/admin/libraries/${props.libraryId}/days/${targetDay}/content/${match.id}`)
    } else {
      await navigateTo(`/admin/libraries/${props.libraryId}/days/${targetDay}`)
    }
  } catch {
    await navigateTo(`/admin/libraries/${props.libraryId}/days/${targetDay}`)
  } finally {
    navigating.value = false
  }
}

async function discardAndNavigate() {
  showDayNavModal.value = false
  await performDayNavigation(pendingDayDirection.value)
}

async function saveAndNavigate() {
  if (!isValid.value) return

  try {
    saving.value = true

    if (props.mode === 'edit' && props.contentId) {
      await $fetch(`/api/admin/libraries/${props.libraryId}/content/${props.contentId}`, {
        method: 'PUT',
        body: { content_json: form.value.content_json }
      })
    }

    toast.add({
      title: 'Content saved',
      color: 'success'
    })

    showDayNavModal.value = false
    await performDayNavigation(pendingDayDirection.value)
  } catch (err: any) {
    toast.add({
      title: 'Failed to save',
      description: err.data?.statusMessage || 'An error occurred while saving.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function confirmLeave() {
  isSaved.value = true
  hasUnsavedChanges.value = false
  showUnsavedChangesModal.value = false
  if (pendingNavigation.value) {
    pendingNavigation.value()
  }
}

function cancelLeave() {
  showUnsavedChangesModal.value = false
  pendingNavigation.value = null
}

onBeforeRouteLeave((_to, _from, next) => {
  // Always allow navigation if content was saved
  if (isSaved.value) {
    next()
    return
  }

  // For new mode: warn if there's unsaved content
  // For edit mode: warn if there are unsaved changes
  const shouldWarn = props.mode === 'new'
    ? hasActualContent.value
    : hasUnsavedChanges.value

  if (shouldWarn) {
    pendingNavigation.value = next
    showUnsavedChangesModal.value = true
  } else {
    next()
  }
})

onMounted(() => {
  if (props.mode === 'edit') {
    loadContent()
  }
})
</script>

<style scoped>
.editor-page {
  position: fixed;
  top: 0;
  left: 250px;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg);
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 1rem;
  text-align: center;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.back-link {
  color: var(--ui-text-muted);
  text-decoration: none;
  font-size: 0.875rem;
}

.back-link:hover {
  color: var(--color-text);
}

.editor-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-main {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.editor-details {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ui-border);
}

@media (max-width: 768px) {
  .editor-page {
    left: 0;
  }
}
</style>

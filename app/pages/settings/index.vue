<template>
  <div class="max-w-6xl">
    <h1 class="text-2xl font-bold mb-8">Settings</h1>

    <UTabs v-model="activeTab" :items="tabs" class="mb-8">
      <template #content="{ item }">
        <!-- AI Tab -->
        <div v-if="item.value === 'ai'" class="py-6">
          <h2 class="text-xl font-semibold mb-2">OpenRouter API Key</h2>
          <p class="text-[var(--ui-text-muted)] mb-6">
            Translation and every AI feature call OpenRouter with the <code>OPENROUTER_API_KEY</code> environment variable.
            This checks the key the server is running with; it does not spend credits.
          </p>

          <div class="max-w-md">
            <UAlert
              v-if="openrouterKeyAlert"
              :color="openrouterKeyAlert.color"
              :icon="openrouterKeyAlert.icon"
              :title="openrouterKeyAlert.title"
              :description="openrouterKeyAlert.description"
            />

            <UButton
              @click="checkOpenrouterKey"
              :loading="isCheckingOpenrouterKey"
              variant="outline"
              class="mt-4"
            >
              {{ isCheckingOpenrouterKey ? 'Checking...' : 'Check Key' }}
            </UButton>
          </div>

          <h2 class="text-xl font-semibold mb-2 mt-10">AI Model</h2>
          <p class="text-[var(--ui-text-muted)] mb-6">
            The OpenRouter model used for every AI feature — inbox draft replies, knowledge capture, and report parsing.
            Enter any OpenRouter model id (e.g. <code>anthropic/claude-sonnet-4.6</code>); a newly released model can be adopted here without a code change.
          </p>

          <div class="max-w-md">
            <label class="block text-sm font-medium mb-1">Model id</label>
            <UInput
              v-model="aiModel"
              placeholder="anthropic/claude-sonnet-4.6"
              class="w-full"
            />

            <UButton
              @click="saveAiModel"
              :loading="isSavingAiModel"
              :disabled="!aiModel.trim()"
              variant="outline"
              class="mt-4"
            >
              {{ isSavingAiModel ? 'Saving...' : 'Save Model' }}
            </UButton>

            <UAlert
              v-if="aiModelMessage"
              :color="aiModelMessage.type === 'success' ? 'success' : 'error'"
              :title="aiModelMessage.text"
              class="mt-4"
            />
          </div>

          <h2 class="text-xl font-semibold mb-2 mt-10">Translation Model</h2>
          <p class="text-[var(--ui-text-muted)] mb-6">
            The OpenRouter model used to translate content into other languages.
            Enter any OpenRouter model id (e.g. <code>google/gemini-3.1-pro-preview</code>); a newly released model can be adopted here without a code change.
          </p>

          <div class="max-w-md">
            <label class="block text-sm font-medium mb-1">Model id</label>
            <UInput
              v-model="translationModel"
              placeholder="google/gemini-3.1-pro-preview"
              class="w-full"
            />

            <UButton
              @click="saveTranslationModel"
              :loading="isSavingTranslationModel"
              :disabled="!translationModel.trim()"
              variant="outline"
              class="mt-4"
            >
              {{ isSavingTranslationModel ? 'Saving...' : 'Save Model' }}
            </UButton>

            <UAlert
              v-if="translationModelMessage"
              :color="translationModelMessage.type === 'success' ? 'success' : 'error'"
              :title="translationModelMessage.text"
              class="mt-4"
            />
          </div>
        </div>

        <!-- Translation Tab -->
        <div v-if="item.value === 'translation'" class="py-6">
          <h2 class="text-xl font-semibold mb-2">Batch Translation</h2>
          <p class="text-[var(--ui-text-muted)] mb-4">Translate a translatable field from English to all other languages for all people groups.</p>

          <div class="flex flex-wrap items-end gap-4">
            <div class="w-64">
              <label class="block text-sm font-medium mb-1">Field to translate</label>
              <USelect
                v-model="selectedTranslateField"
                :items="translatableFieldOptions"
                placeholder="Select a field"
              />
            </div>

            <UCheckbox
              v-model="translateOverwrite"
              label="Overwrite existing translations"
            />

            <UButton
              @click="() => { showTranslateConfirmModal = true }"
              :disabled="!selectedTranslateField"
              variant="outline"
              icon="i-lucide-languages"
            >
              Translate Field
            </UButton>
          </div>

          <UAlert
            v-if="translateMessage"
            :color="translateMessage.type === 'success' ? 'success' : 'error'"
            :title="translateMessage.text"
            class="mt-4"
          />

          <UCard v-if="translateStats" class="mt-6">
            <template #header>
              <h3 class="font-semibold">Translation Results</h3>
            </template>
            <div class="space-y-2">
              <p><strong>Total with English content:</strong> {{ translateStats.total }}</p>
              <p><strong>Translated:</strong> {{ translateStats.translated }}</p>
              <p><strong>Skipped (already translated):</strong> {{ translateStats.skipped }}</p>
              <p><strong>Errors:</strong> {{ translateStats.errors }}</p>
            </div>
          </UCard>

          <div class="border-t border-[var(--ui-border)] pt-8 mt-8">
            <h2 class="text-xl font-semibold mb-2">Rebuild Verses</h2>
            <p class="text-[var(--ui-text-muted)] mb-6">
              Re-fetch Bible verse text from the API for selected languages.
              Only verses that were originally fetched from the API will be updated — manually entered verses are left untouched.
            </p>

            <div class="mb-4">
              <label class="block text-sm font-medium mb-1">Languages to rebuild</label>
              <div class="flex gap-2 mb-2 text-sm">
                <button type="button" class="text-[var(--ui-text-highlighted)] hover:underline" @click="selectAllRebuildLanguages">Select all</button>
                <span class="text-[var(--ui-text-muted)]">|</span>
                <button type="button" class="text-[var(--ui-text-highlighted)] hover:underline" @click="clearAllRebuildLanguages">Clear all</button>
              </div>
              <div class="grid grid-cols-2 gap-1.5">
                <UCheckbox
                  v-for="lang in languagesWithBible"
                  :key="lang.code"
                  :model-value="rebuildLanguages.includes(lang.code)"
                  @update:model-value="toggleRebuildLanguage(lang.code, $event)"
                  :label="`${lang.flag} ${lang.name}`"
                />
              </div>
            </div>

            <UButton
              @click="() => { showRebuildConfirmModal = true }"
              :disabled="rebuildLanguages.length === 0 || isRebuilding"
              variant="outline"
              icon="i-lucide-refresh-cw"
            >
              Rebuild Verses
            </UButton>

            <UAlert
              v-if="rebuildMessage"
              :color="rebuildMessage.type === 'success' ? 'success' : 'error'"
              :title="rebuildMessage.text"
              class="mt-4"
            />

            <!-- Progress card shown while rebuilding -->
            <UCard v-if="isRebuilding" class="mt-6">
              <template #header>
                <h3 class="font-semibold">Rebuild Progress</h3>
              </template>
              <div class="space-y-3">
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-primary" />
                  <span class="font-medium">{{ rebuildProgress.message }}</span>
                </div>
                <UProgress
                  v-if="rebuildProgress.percent !== undefined"
                  :value="rebuildProgress.percent"
                  size="sm"
                />
                <p v-if="rebuildProgress.detail" class="text-sm text-[var(--ui-text-muted)]">
                  {{ rebuildProgress.detail }}
                </p>
              </div>
            </UCard>

            <!-- Results card shown after completion -->
            <UCard v-if="rebuildStats" class="mt-6">
              <template #header>
                <h3 class="font-semibold">Rebuild Results</h3>
              </template>
              <div class="space-y-2">
                <p><strong>Total Content Rows:</strong> {{ rebuildStats.totalRows }}</p>
                <p><strong>Rows Updated:</strong> {{ rebuildStats.rowsUpdated }}</p>
                <p><strong>Verses Rebuilt:</strong> {{ rebuildStats.versesRebuilt }}</p>
                <p><strong>Errors:</strong> {{ rebuildStats.errors }}</p>
              </div>
              <div v-if="rebuildWarnings.length > 0" class="mt-4 border-t border-[var(--ui-border)] pt-4">
                <p class="text-sm font-medium mb-2">Verse Warnings ({{ rebuildWarnings.length }}):</p>
                <ul class="text-sm text-[var(--ui-text-muted)] space-y-1">
                  <li v-for="(w, i) in rebuildWarnings" :key="i">{{ w.reference }} ({{ w.language }}): {{ w.reason }}</li>
                </ul>
              </div>
            </UCard>
          </div>
        </div>
      </template>
    </UTabs>

    <!-- Rebuild Verses Confirmation Modal -->
    <UModal v-model:open="showRebuildConfirmModal" title="Confirm Rebuild Verses">
      <template #body>
        <div class="p-6 space-y-4">
          <p>
            This will re-fetch Bible verse text for <strong>all library content</strong> in {{ rebuildLanguages.length }} selected language(s).
          </p>
          <p class="text-amber-600 dark:text-amber-400">
            Existing verse content will be overwritten with fresh data from the Bolls Bible API.
          </p>
          <div class="flex gap-2 justify-end pt-4">
            <UButton
              variant="outline"
              @click="() => { showRebuildConfirmModal = false }"
            >
              Cancel
            </UButton>
            <UButton
              @click="startRebuild"
              color="primary"
            >
              Start Rebuild
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Translation Confirmation Modal -->
    <UModal v-model:open="showTranslateConfirmModal" title="Confirm Batch Translation" :close="!isTranslating">
      <template #body>
        <div class="p-6 space-y-4">
          <!-- Pre-translation info -->
          <template v-if="!isTranslating">
            <p>
              This will translate the <strong>{{ selectedFieldLabel }}</strong> field from English to all other languages for all people groups that have English content.
            </p>
            <p v-if="translateOverwrite" class="text-amber-600 dark:text-amber-400">
              Existing translations will be overwritten.
            </p>
            <p v-else>
              Existing translations will be preserved (only missing languages will be translated).
            </p>
          </template>

          <!-- Progress display -->
          <template v-else>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-primary" />
                <span class="font-medium">{{ translateProgress.message }}</span>
              </div>

              <UProgress
                v-if="translateProgress.percent !== undefined"
                :value="translateProgress.percent"
                size="sm"
              />

              <p v-if="translateProgress.detail" class="text-sm text-[var(--ui-text-muted)]">
                {{ translateProgress.detail }}
              </p>
            </div>
          </template>

          <div class="flex gap-2 justify-end pt-4">
            <UButton
              v-if="!isTranslating"
              variant="outline"
              @click="() => { showTranslateConfirmModal = false }"
            >
              Cancel
            </UButton>
            <UButton
              v-if="!isTranslating"
              @click="translateField"
              color="primary"
            >
              Start Translation
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { allFields } from '~/utils/people-group-fields'
import { LANGUAGES } from '~/utils/languages'

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

const tabs = [
  { label: 'AI', value: 'ai' },
  { label: 'Translation', value: 'translation' },
]

const activeTab = ref('ai')
// OpenRouter API key check
type OpenRouterKeyStatus =
  | { status: 'missing' }
  | { status: 'invalid' | 'unreachable'; message: string }
  | { status: 'valid'; label: string; limit: number | null; limit_remaining: number | null; usage_monthly: number; is_free_tier: boolean }

const openrouterKey = ref<OpenRouterKeyStatus | null>(null)
const isCheckingOpenrouterKey = ref(false)

const usd = (amount: number) => `$${amount.toFixed(2)}`

const openrouterKeyAlert = computed(() => {
  const key = openrouterKey.value
  switch (key?.status) {
    case 'valid': {
      const credits = key.limit === null
        ? `${usd(key.usage_monthly)} used this month, no credit limit on this key.`
        : `${usd(key.limit_remaining ?? 0)} of ${usd(key.limit)} remaining, ${usd(key.usage_monthly)} used this month.`
      return { color: 'success' as const, icon: 'i-lucide-circle-check', title: `Key "${key.label}" is valid`, description: credits }
    }
    case 'invalid':
      return { color: 'error' as const, icon: 'i-lucide-circle-x', title: 'OpenRouter rejected the key', description: key.message }
    case 'unreachable':
      return { color: 'warning' as const, icon: 'i-lucide-triangle-alert', title: 'Could not verify the key', description: key.message }
    case 'missing':
      return { color: 'error' as const, icon: 'i-lucide-circle-x', title: 'OPENROUTER_API_KEY is not set', description: 'Translation and AI features are disabled until the server has a key.' }
    default:
      return null
  }
})

async function checkOpenrouterKey() {
  isCheckingOpenrouterKey.value = true
  try {
    openrouterKey.value = await $fetch<OpenRouterKeyStatus>('/api/admin/settings/openrouter-key')
  } catch (error: any) {
    console.error('Failed to check OpenRouter key:', error)
    openrouterKey.value = { status: 'unreachable', message: error.data?.message || 'Failed to check the OpenRouter API key.' }
  } finally {
    isCheckingOpenrouterKey.value = false
  }
}

checkOpenrouterKey()

// AI model setting
const aiModel = ref('')
const isSavingAiModel = ref(false)
const aiModelMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)

async function loadAiModel() {
  try {
    const data = await $fetch<{ ai_model: string }>('/api/admin/settings/ai-model')
    aiModel.value = data.ai_model || ''
  } catch (error) {
    console.error('Failed to load AI model:', error)
  }
}

async function saveAiModel() {
  const value = aiModel.value.trim()
  if (!value) return

  isSavingAiModel.value = true
  aiModelMessage.value = null

  try {
    const data = await $fetch<{ ai_model: string }>('/api/admin/settings/ai-model', {
      method: 'PUT',
      body: { ai_model: value }
    })
    aiModel.value = data.ai_model
    aiModelMessage.value = { text: 'AI model saved.', type: 'success' }
  } catch (error: any) {
    console.error('Failed to save AI model:', error)
    aiModelMessage.value = { text: error.data?.message || 'Failed to save AI model.', type: 'error' }
  } finally {
    isSavingAiModel.value = false
  }
}

loadAiModel()

// Translation model setting
const translationModel = ref('')
const isSavingTranslationModel = ref(false)
const translationModelMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)

async function loadTranslationModel() {
  try {
    const data = await $fetch<{ translation_model: string }>('/api/admin/settings/translation-model')
    translationModel.value = data.translation_model || ''
  } catch (error) {
    console.error('Failed to load translation model:', error)
  }
}

async function saveTranslationModel() {
  const value = translationModel.value.trim()
  if (!value) return

  isSavingTranslationModel.value = true
  translationModelMessage.value = null

  try {
    const data = await $fetch<{ translation_model: string }>('/api/admin/settings/translation-model', {
      method: 'PUT',
      body: { translation_model: value }
    })
    translationModel.value = data.translation_model
    translationModelMessage.value = { text: 'Translation model saved.', type: 'success' }
  } catch (error: any) {
    console.error('Failed to save translation model:', error)
    translationModelMessage.value = { text: error.data?.message || 'Failed to save translation model.', type: 'error' }
  } finally {
    isSavingTranslationModel.value = false
  }
}

loadTranslationModel()

// Translation state
const selectedTranslateField = ref<string | undefined>(undefined)
const translateOverwrite = ref(false)
const showTranslateConfirmModal = ref(false)
const isTranslating = ref(false)
const translateMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const translateStats = ref<{ total: number; translated: number; skipped: number; errors: number } | null>(null)
const translateProgress = ref<{ message: string; detail?: string; percent?: number }>({ message: 'Starting...' })

// Rebuild Verses state
const rebuildLanguages = ref<string[]>([])
const isRebuilding = ref(false)
const showRebuildConfirmModal = ref(false)
const rebuildMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const rebuildProgress = ref<{ message: string; detail?: string; percent?: number }>({ message: 'Starting...' })
const rebuildStats = ref<{ totalRows: number; rowsUpdated: number; versesRebuilt: number; errors: number } | null>(null)
const rebuildWarnings = ref<Array<{ reference: string; language: string; reason: string }>>([])

const languagesWithBible = computed(() =>
  LANGUAGES.filter(l => l.bibleId)
)

function toggleRebuildLanguage(code: string, checked: boolean | string) {
  if (checked) {
    if (!rebuildLanguages.value.includes(code)) {
      rebuildLanguages.value.push(code)
    }
  } else {
    rebuildLanguages.value = rebuildLanguages.value.filter(c => c !== code)
  }
}

function selectAllRebuildLanguages() {
  rebuildLanguages.value = languagesWithBible.value.map(l => l.code)
}

function clearAllRebuildLanguages() {
  rebuildLanguages.value = []
}

// Filter to only translatable fields
const translatableFieldOptions = computed(() =>
  allFields
    .filter(f => f.type === 'translatable')
    .map(f => ({
      label: f.key,
      value: f.key
    }))
)

const selectedFieldLabel = computed(() => {
  const field = allFields.find(f => f.key === selectedTranslateField.value)
  return field?.key || selectedTranslateField.value
})

async function startRebuild() {
  showRebuildConfirmModal.value = false
  isRebuilding.value = true
  rebuildMessage.value = null
  rebuildStats.value = null
  rebuildWarnings.value = []
  rebuildProgress.value = { message: 'Starting rebuild...' }

  try {
    const response = await fetch('/api/admin/libraries/rebuild-verses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ languages: rebuildLanguages.value })
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))

          if (eventType === 'progress') {
            rebuildProgress.value = {
              message: data.message,
              detail: data.processed && data.total
                ? `${data.processed} of ${data.total} rows — ${data.versesRebuilt} verses rebuilt`
                : undefined,
              percent: data.processed && data.total
                ? Math.round((data.processed / data.total) * 100)
                : undefined
            }
          } else if (eventType === 'complete') {
            rebuildMessage.value = {
              text: `Rebuild complete: ${data.stats.rowsUpdated} rows updated, ${data.stats.versesRebuilt} verses rebuilt`,
              type: data.success ? 'success' : 'error'
            }
            rebuildStats.value = data.stats
            rebuildWarnings.value = data.warnings || []
          } else if (eventType === 'error') {
            rebuildMessage.value = {
              text: data.message,
              type: 'error'
            }
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Rebuild error:', error)
    rebuildMessage.value = {
      text: error.message || 'Rebuild failed. Please try again.',
      type: 'error'
    }
  } finally {
    isRebuilding.value = false
  }
}

async function translateField() {
  if (!selectedTranslateField.value) return

  isTranslating.value = true
  translateMessage.value = null
  translateStats.value = null
  translateProgress.value = { message: 'Starting translation...' }

  try {
    const response = await fetch('/api/admin/people-groups/translate-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        field_key: selectedTranslateField.value,
        overwrite: translateOverwrite.value
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events from buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))

          if (eventType === 'progress') {
            translateProgress.value = {
              message: data.message,
              detail: data.saved && data.totalPeopleGroups
                ? `${data.saved} of ${data.totalPeopleGroups}`
                : data.languageIndex && data.totalLanguages
                  ? `Language ${data.languageIndex} of ${data.totalLanguages}`
                  : undefined,
              percent: data.saved && data.totalPeopleGroups
                ? Math.round((data.saved / data.totalPeopleGroups) * 100)
                : data.languageIndex && data.totalLanguages
                  ? Math.round((data.languageIndex / data.totalLanguages) * 100)
                  : undefined
            }
          } else if (eventType === 'complete') {
            translateMessage.value = {
              text: data.message,
              type: data.success ? 'success' : 'error'
            }
            translateStats.value = data.stats
            showTranslateConfirmModal.value = false
          } else if (eventType === 'error') {
            translateMessage.value = {
              text: data.message,
              type: 'error'
            }
            showTranslateConfirmModal.value = false
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Translation error:', error)
    translateMessage.value = {
      text: error.message || 'Translation failed. Please try again.',
      type: 'error'
    }
    showTranslateConfirmModal.value = false
  } finally {
    isTranslating.value = false
  }
}
</script>

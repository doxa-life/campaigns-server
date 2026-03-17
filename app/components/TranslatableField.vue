<template>
  <div>
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <USelect
          v-model="selectedLanguage"
          :items="languageOptions"
          class="w-48"
        />
        <UButton
          v-if="showTranslateButton"
          @click="showTranslateModal = true"
          :disabled="!hasEnglishContent"
          variant="outline"
          size="sm"
          icon="i-lucide-languages"
          :title="hasEnglishContent ? 'Translate from English' : 'Add English content first'"
        />
      </div>
      <UTextarea
        :model-value="modelValue?.[selectedLanguage] || ''"
        @update:model-value="updateLanguage(selectedLanguage, $event)"
        :rows="rows"
        class="w-full"
      />
    </div>

    <!-- Translation Modal -->
    <UModal v-model:open="showTranslateModal" title="Translate from English">
      <template #body>
        <div class="p-6 space-y-4">
          <p class="text-[var(--ui-text-muted)]">
            Translate the English content to all other languages using DeepL.
          </p>

          <UCheckbox
            v-model="overwriteExisting"
            label="Overwrite existing translations"
          />

          <UAlert
            v-if="translateError"
            color="error"
            :title="translateError"
            class="mt-3"
          />

          <UAlert
            v-if="translateSuccess"
            color="success"
            :title="translateSuccess"
            class="mt-3"
          />

          <div class="flex gap-2 justify-end pt-4">
            <UButton variant="outline" @click="showTranslateModal = false">
              Cancel
            </UButton>
            <UButton
              @click="translateFromEnglish"
              :loading="isTranslating"
              color="primary"
            >
              {{ isTranslating ? 'Translating...' : 'Translate' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { LANGUAGES } from '~/utils/languages'

const props = withDefaults(defineProps<{
  modelValue: Record<string, string> | null
  rows?: number
  showTranslateButton?: boolean
}>(), {
  rows: 3,
  showTranslateButton: true
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>]
  'save': []
}>()

const selectedLanguage = ref('en')
const showTranslateModal = ref(false)
const isTranslating = ref(false)
const overwriteExisting = ref(true)
const translateError = ref<string | null>(null)
const translateSuccess = ref<string | null>(null)

const languageOptions = computed(() =>
  LANGUAGES.map(lang => ({
    label: `${lang.flag} ${lang.name}`,
    value: lang.code
  }))
)

const hasEnglishContent = computed(() => {
  const englishText = props.modelValue?.en
  return englishText && englishText.trim().length > 0
})

function updateLanguage(code: string, value: string) {
  const updated = { ...(props.modelValue || {}) }
  if (value) {
    updated[code] = value
  } else {
    delete updated[code]
  }
  emit('update:modelValue', updated)
}

async function translateFromEnglish() {
  if (!hasEnglishContent.value) return

  isTranslating.value = true
  translateError.value = null
  translateSuccess.value = null

  try {
    const englishText = props.modelValue!.en

    // Get target languages (all except English)
    const targetLanguages = LANGUAGES
      .filter(lang => lang.code !== 'en')
      .filter(lang => overwriteExisting.value || !props.modelValue?.[lang.code])
      .map(lang => lang.code)

    if (targetLanguages.length === 0) {
      translateSuccess.value = 'All languages already have translations'
      return
    }

    const response = await $fetch<{
      success: boolean
      translations: Record<string, string>
      errors?: Array<{ language: string; error: string }>
    }>('/api/admin/translate/field', {
      method: 'POST',
      body: {
        text: englishText,
        targetLanguages,
        sourceLanguage: 'en'
      }
    })

    // Merge translations into current values
    const updated = { ...(props.modelValue || {}) }
    for (const [langCode, translatedText] of Object.entries(response.translations)) {
      updated[langCode] = translatedText
    }
    emit('update:modelValue', updated)

    const translatedCount = Object.keys(response.translations).length
    if (response.errors && response.errors.length > 0) {
      console.error('Translation errors:', response.errors)
      const errorMessages = response.errors.map(e => `${e.language}: ${e.error}`).join('; ')
      translateError.value = `Translated ${translatedCount} language(s), but ${response.errors.length} failed: ${errorMessages}`
    } else {
      translateSuccess.value = `Translated to ${translatedCount} language(s)`
      // Emit save event and close modal on success after a brief delay
      emit('save')
      setTimeout(() => {
        showTranslateModal.value = false
        translateSuccess.value = null
      }, 1500)
    }
  } catch (error: any) {
    translateError.value = error.data?.message || error.message || 'Translation failed'
  } finally {
    isTranslating.value = false
  }
}
</script>

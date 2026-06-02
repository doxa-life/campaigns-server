<template>
  <div class="min-h-[calc(100vh-200px)] py-8 px-4">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <div class="text-center">
        <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
        <p>{{ $t('common.loading') }}</p>
      </div>
    </div>

    <!-- Invalid / missing link -->
    <div v-else-if="!data?.valid" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-alert-circle" class="w-16 h-16 mx-auto mb-4 text-[var(--ui-error)]" />
        <h1 class="text-2xl font-bold mb-4">{{ $t('survey.may2026.page.invalidTitle') }}</h1>
        <p class="text-[var(--ui-text-muted)]">{{ $t('survey.may2026.page.invalid') }}</p>
      </UCard>
    </div>

    <!-- Closed -->
    <div v-else-if="data.status === 'closed'" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-clock" class="w-16 h-16 mx-auto mb-4 text-[var(--ui-text-muted)]" />
        <h1 class="text-2xl font-bold mb-4">{{ $t('survey.may2026.page.closedTitle') }}</h1>
        <p class="text-[var(--ui-text-muted)]">{{ $t('survey.may2026.page.closed') }}</p>
      </UCard>
    </div>

    <!-- Thank you -->
    <div v-else-if="submitted" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-check-circle" class="w-16 h-16 mx-auto mb-4 text-[var(--ui-success)]" />
        <h1 class="text-2xl font-bold mb-4">{{ $t('survey.may2026.page.thanksTitle') }}</h1>
        <p class="text-[var(--ui-text-muted)]">{{ $t('survey.may2026.page.thanks') }}</p>
      </UCard>
    </div>

    <!-- Survey form -->
    <div v-else class="max-w-2xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold mb-2">{{ $t('survey.may2026.page.title') }}</h1>
        <p class="text-[var(--ui-text-muted)]">{{ $t('survey.may2026.page.intro') }}</p>
      </div>

      <UAlert
        v-if="data.alreadyResponded"
        icon="i-lucide-info"
        color="info"
        variant="soft"
        class="mb-6"
        :description="$t('survey.may2026.page.editNotice')"
      />

      <div class="space-y-6">
        <UCard v-for="(question, index) in questions" :key="question.key">
          <UFormField :label="`${index + 1}. ${$t(questionLabel(question.key))}`" :ui="{ label: 'text-base font-medium' }">
            <div v-if="question.type === 'scale'" class="mt-3">
              <URadioGroup
                v-model="answers[question.key]"
                :items="scaleItems(question)"
                orientation="horizontal"
              />
              <p class="mt-2 text-xs text-[var(--ui-text-muted)]">{{ scaleLegend(question) }}</p>
            </div>
            <UTextarea
              v-else
              v-model="answers[question.key]"
              :rows="4"
              autoresize
              class="w-full mt-2"
            />
          </UFormField>
        </UCard>
      </div>

      <div class="mt-8 flex justify-end">
        <UButton size="lg" :loading="saving" @click="submit">
          {{ $t('survey.may2026.page.submit') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MAY_2026_SURVEY_QUESTIONS, may2026I18n, type SurveyQuestion } from '#shared/surveys/may-2026-survey'

const route = useRoute()
const { t } = useI18n()
const toast = useToast()

const profileId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))

const questions = MAY_2026_SURVEY_QUESTIONS
const answers = reactive<Record<string, any>>({})
const submitted = ref(false)
const saving = ref(false)

const { data, pending: loading } = await useAsyncData(
  'survey-response',
  () => $fetch('/api/survey/response', { query: { id: profileId.value } }),
  { watch: [profileId] }
)

watchEffect(() => {
  if (data.value?.valid && data.value.answers) {
    for (const [key, value] of Object.entries(data.value.answers)) {
      answers[key] = value
    }
  }
})

function questionLabel(key: string) {
  return may2026I18n.questionLabel(key)
}

function scaleItems(question: SurveyQuestion) {
  const min = question.min ?? 1
  const max = question.max ?? 5
  return Array.from({ length: max - min + 1 }, (_, i) => ({
    label: String(min + i),
    value: min + i
  }))
}

function scaleLegend(question: SurveyQuestion) {
  return (question.scalePoints ?? [])
    .map(point => `${point} = ${t(may2026I18n.scaleLabel(question.key, point))}`)
    .join('  ·  ')
}

async function submit() {
  saving.value = true
  try {
    await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: profileId.value, answers: { ...answers } }
    })
    submitted.value = true
  } catch (err: any) {
    toast.add({
      title: t('survey.may2026.page.errorTitle'),
      description: err.data?.statusMessage || t('survey.may2026.page.error'),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

useHead({ title: () => t('survey.may2026.page.title') })
</script>

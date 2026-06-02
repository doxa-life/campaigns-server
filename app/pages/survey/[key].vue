<template>
  <div class="min-h-[calc(100vh-200px)] py-8 px-4">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <div class="text-center">
        <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
        <p>{{ $t('common.loading') }}</p>
      </div>
    </div>

    <!-- Invalid / missing link (or unknown survey) -->
    <div v-else-if="!data?.valid" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-alert-circle" class="w-16 h-16 mx-auto mb-4 text-[var(--ui-error)]" />
        <h1 class="text-2xl font-bold mb-4">{{ pageText('invalidTitle', 'Invalid link') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">{{ pageText('invalid', "This survey link doesn't look valid. Please use the link from your email.") }}</p>
        <UButton :to="localePath('/')">{{ pageText('goHome', 'Go to homepage') }}</UButton>
      </UCard>
    </div>

    <!-- Closed -->
    <div v-else-if="data.status === 'closed'" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-clock" class="w-16 h-16 mx-auto mb-4 text-[var(--ui-text-muted)]" />
        <h1 class="text-2xl font-bold mb-4">{{ pageText('closedTitle', 'Survey closed') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">{{ pageText('closed', 'This survey is no longer accepting responses. Thank you for your interest.') }}</p>
        <UButton :to="localePath('/')">{{ pageText('goHome', 'Go to homepage') }}</UButton>
      </UCard>
    </div>

    <!-- Thank you -->
    <div v-else-if="submitted" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-check-circle" class="w-16 h-16 mx-auto mb-4 text-[var(--ui-success)]" />
        <h1 class="text-2xl font-bold mb-4">{{ pageText('thanksTitle', 'Thank you!') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">{{ pageText('thanks', 'Thank you — your responses are in.') }}</p>
        <UButton :to="localePath('/')">{{ pageText('goHome', 'Go to homepage') }}</UButton>
      </UCard>
    </div>

    <!-- Survey form -->
    <div v-else class="max-w-2xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold mb-2">{{ pageText('title', data.title) }}</h1>
        <p class="text-[var(--ui-text-muted)]">{{ pageText('intro', '') }}</p>
      </div>

      <UAlert
        v-if="data.alreadyResponded"
        icon="i-lucide-info"
        color="info"
        variant="soft"
        class="mb-6"
        :description="pageText('editNotice', 'You\'ve already responded — you can update your answers below.')"
      />

      <div class="space-y-6">
        <UCard v-for="(question, index) in questions" :key="question.key">
          <UFormField :label="`${index + 1}. ${questionLabel(question.key)}`" :ui="{ label: 'text-base font-medium' }">
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
          {{ pageText('submit', 'Send my responses') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface PublicQuestion {
  key: string
  type: 'scale' | 'text'
  config: { min?: number; max?: number; scalePoints?: number[] }
}

interface SurveyResponseData {
  valid: boolean
  surveyExists: boolean
  status: 'open' | 'closed'
  name: string
  alreadyResponded: boolean
  answers: Record<string, number | string>
  title: string
  questions: PublicQuestion[]
  content: {
    page?: Record<string, string>
    questions?: Record<string, { label?: string; scale?: Record<string, string> }>
  }
}

const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const toast = useToast()

const surveyKey = computed(() => (typeof route.params.key === 'string' ? route.params.key : ''))
const profileId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))

const answers = reactive<Record<string, any>>({})
const submitted = ref(false)
const saving = ref(false)

const { data, pending: loading } = await useAsyncData<SurveyResponseData>(
  'survey-response',
  () => $fetch('/api/survey/response', {
    query: { id: profileId.value, key: surveyKey.value, lang: locale.value }
  }),
  { watch: [profileId, surveyKey, locale] }
)

const questions = computed(() => data.value?.questions ?? [])

watchEffect(() => {
  if (data.value?.valid && data.value.answers) {
    for (const [key, value] of Object.entries(data.value.answers)) {
      answers[key] = value
    }
  }
})

function pageText(key: string, fallback = '') {
  return data.value?.content?.page?.[key] ?? fallback
}

function questionLabel(key: string) {
  return data.value?.content?.questions?.[key]?.label ?? key
}

function scaleLabel(key: string, point: number) {
  return data.value?.content?.questions?.[key]?.scale?.[String(point)] ?? ''
}

function scaleItems(question: PublicQuestion) {
  const min = question.config?.min ?? 1
  const max = question.config?.max ?? 5
  return Array.from({ length: max - min + 1 }, (_, i) => ({
    label: String(min + i),
    value: min + i
  }))
}

function scaleLegend(question: PublicQuestion) {
  return (question.config?.scalePoints ?? [])
    .map(point => `${point} = ${scaleLabel(question.key, point)}`)
    .filter(s => !s.endsWith('= '))
    .join('  ·  ')
}

async function submit() {
  saving.value = true
  try {
    await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: profileId.value, key: surveyKey.value, answers: { ...answers } }
    })
    submitted.value = true
  } catch (err: any) {
    toast.add({
      title: pageText('errorTitle', 'Something went wrong'),
      description: err.data?.statusMessage || pageText('error', 'We couldn\'t save your responses. Please try again.'),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

useHead({ title: () => data.value?.content?.page?.title || data.value?.title || t('common.loading') })
</script>

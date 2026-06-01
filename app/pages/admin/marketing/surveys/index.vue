<template>
  <div class="flex gap-6 items-start">
    <!-- Left: survey list -->
    <aside class="w-72 shrink-0">
      <h2 class="text-lg font-bold mb-4">{{ $t('survey.admin.heading') }}</h2>
      <div class="space-y-1">
        <button
          v-for="survey in surveys"
          :key="survey.key"
          type="button"
          class="w-full text-left rounded-lg border px-3 py-2 transition-colors"
          :class="survey.key === selectedKey
            ? 'border-[var(--ui-text)] bg-[var(--ui-bg-elevated)]'
            : 'border-[var(--ui-border)] hover:border-[var(--ui-text-muted)]'"
          @click="selectedKey = survey.key"
        >
          <div class="font-medium text-sm">{{ survey.title }}</div>
          <div class="text-xs text-[var(--ui-text-muted)] mt-0.5">
            {{ $t('survey.admin.totalResponses', { count: survey.response_count }) }}
          </div>
        </button>
      </div>
    </aside>

    <!-- Right: responses for the selected survey -->
    <section class="flex-1 min-w-0">
      <div v-if="!selectedKey" class="py-20">
        <p class="text-center text-[var(--ui-text-muted)]">{{ $t('survey.admin.selectPrompt') }}</p>
      </div>

      <template v-else>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold">{{ data?.title }}</h2>
            <p class="text-[var(--ui-text-muted)] mt-1">
              {{ $t('survey.admin.totalResponses', { count: data?.totalResponses ?? 0 }) }}
            </p>
          </div>
          <UButton
            icon="i-lucide-download"
            variant="outline"
            :loading="exporting"
            :disabled="!data?.totalResponses"
            @click="exportCsv"
          >
            {{ $t('survey.admin.exportCsv') }}
          </UButton>
        </div>

        <div v-if="pending" class="flex justify-center py-20">
          <UIcon name="i-lucide-loader" class="w-8 h-8 animate-spin" />
        </div>

        <div v-else-if="!data?.totalResponses" class="py-20">
          <UCard class="max-w-md mx-auto text-center">
            <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto mb-3 text-[var(--ui-text-muted)]" />
            <p class="text-[var(--ui-text-muted)]">{{ $t('survey.admin.noResponses') }}</p>
          </UCard>
        </div>

        <!-- Questions in their original order (scale and text interleaved) -->
        <div v-else class="space-y-6">
          <UCard v-for="item in renderQuestions" :key="item.key">
            <div class="text-base font-medium mb-1">
              {{ item.number }}. {{ $t(questionLabel(item.key)) }}
            </div>

            <template v-if="item.type === 'scale' && item.scale">
              <p class="text-sm text-[var(--ui-text-muted)] mb-4">
                {{ $t('survey.admin.average') }}:
                <span class="font-semibold text-[var(--ui-text)]">{{ item.scale.average != null ? item.scale.average.toFixed(2) : '—' }}</span>
                ({{ item.scale.count }})
              </p>
              <div class="space-y-2">
                <div v-for="point in scalePoints(item.key)" :key="point" class="flex items-center gap-3">
                  <span class="w-4 text-sm text-[var(--ui-text-muted)]">{{ point }}</span>
                  <UProgress :model-value="item.scale.distribution[point] || 0" :max="item.scale.count || 1" class="flex-1" />
                  <span class="w-10 text-right text-sm tabular-nums">{{ item.scale.distribution[point] || 0 }}</span>
                </div>
              </div>
            </template>

            <template v-else-if="item.type === 'text' && item.text">
              <p class="text-sm text-[var(--ui-text-muted)] mb-4">{{ item.text.answers.length }}</p>
              <div v-if="item.text.answers.length" class="space-y-3 max-h-96 overflow-y-auto">
                <p
                  v-for="(answer, i) in item.text.answers"
                  :key="i"
                  class="text-sm border-l-2 border-[var(--ui-border)] pl-3 py-1 whitespace-pre-wrap"
                >
                  {{ answer }}
                </p>
              </div>
              <p v-else class="text-sm text-[var(--ui-text-muted)]">{{ $t('survey.admin.noResponses') }}</p>
            </template>
          </UCard>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  MAY_2026_SURVEY_QUESTIONS,
  may2026I18n,
  getMay2026Question
} from '#shared/surveys/may-2026-survey'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface SurveyListItem { key: string; title: string; status: string; response_count: number }
interface ScaleAggregate { key: string; count: number; average: number | null; distribution: Record<number, number> }
interface TextAggregate { key: string; answers: string[] }
interface SurveyResults {
  title: string
  status: string
  totalResponses: number
  scale: ScaleAggregate[]
  text: TextAggregate[]
}

const exporting = ref(false)

const { data: listData } = await useAsyncData('admin-surveys', () =>
  $fetch<{ surveys: SurveyListItem[] }>('/api/admin/surveys')
)
const surveys = computed(() => listData.value?.surveys ?? [])
const selectedKey = ref(surveys.value[0]?.key ?? '')

const { data, pending } = await useAsyncData<SurveyResults | null>('admin-survey-results',
  () => selectedKey.value
    ? $fetch<SurveyResults>(`/api/admin/surveys/${selectedKey.value}/results`)
    : Promise.resolve(null),
  { watch: [selectedKey] }
)

// Render questions in their authored order, interleaving scale and text,
// rather than grouping all scale questions before all text questions.
const renderQuestions = computed(() => {
  const results = data.value
  if (!results) return []
  return MAY_2026_SURVEY_QUESTIONS.map((question, index) => ({
    key: question.key,
    type: question.type,
    number: index + 1,
    scale: question.type === 'scale' ? results.scale.find(a => a.key === question.key) ?? null : null,
    text: question.type === 'text' ? results.text.find(t => t.key === question.key) ?? null : null
  }))
})

function questionLabel(key: string) {
  return may2026I18n.questionLabel(key)
}

function scalePoints(key: string): number[] {
  const question = getMay2026Question(key)
  if (!question) return []
  const min = question.min ?? 1
  const max = question.max ?? 5
  return Array.from({ length: max - min + 1 }, (_, i) => min + i)
}

async function exportCsv() {
  if (!selectedKey.value) return
  exporting.value = true
  try {
    const csv = await $fetch<string>(`/api/admin/surveys/${selectedKey.value}/export`)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedKey.value}-responses.csv`
    link.click()
    URL.revokeObjectURL(url)
  } finally {
    exporting.value = false
  }
}
</script>

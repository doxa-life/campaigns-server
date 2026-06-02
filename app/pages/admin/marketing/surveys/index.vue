<template>
  <div class="flex gap-6 items-start">
    <!-- Left: survey list -->
    <aside class="w-72 shrink-0">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold">{{ $t('survey.admin.heading') }}</h2>
        <UButton size="xs" icon="i-lucide-plus" @click="showCreate = true">
          {{ $t('survey.admin.newSurvey') }}
        </UButton>
      </div>
      <div class="space-y-1">
        <div
          v-for="survey in surveys"
          :key="survey.key"
          class="group w-full rounded-lg border px-3 py-2 transition-colors cursor-pointer"
          :class="survey.key === selectedKey
            ? 'border-[var(--ui-text)] bg-[var(--ui-bg-elevated)]'
            : 'border-[var(--ui-border)] hover:border-[var(--ui-text-muted)]'"
          @click="selectedKey = survey.key"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="font-medium text-sm truncate">{{ survey.title }}</div>
              <div class="text-xs text-[var(--ui-text-muted)] mt-0.5">
                {{ $t('survey.admin.totalResponses', { count: survey.response_count }) }}
                <UBadge v-if="survey.status === 'closed'" size="xs" color="neutral" variant="subtle" class="ml-1">
                  {{ $t('survey.admin.closed') }}
                </UBadge>
              </div>
            </div>
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              class="opacity-0 group-hover:opacity-100"
              @click.stop="navigateTo(`/admin/marketing/surveys/${survey.key}/edit`)"
            />
          </div>
        </div>
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
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-pencil"
              variant="outline"
              @click="navigateTo(`/admin/marketing/surveys/${selectedKey}/edit`)"
            >
              {{ $t('survey.admin.edit') }}
            </UButton>
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
              {{ item.number }}. {{ item.label }}
            </div>

            <template v-if="item.type === 'scale' && item.scale">
              <p class="text-sm text-[var(--ui-text-muted)] mb-4">
                {{ $t('survey.admin.average') }}:
                <span class="font-semibold text-[var(--ui-text)]">{{ item.scale.average != null ? item.scale.average.toFixed(2) : '—' }}</span>
                ({{ item.scale.count }})
              </p>
              <div class="space-y-2">
                <div v-for="point in item.scalePoints" :key="point" class="flex items-center gap-3">
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

    <!-- Create survey modal -->
    <UModal v-model:open="showCreate" :title="$t('survey.admin.newSurvey')">
      <template #body>
        <form class="p-2 space-y-4" @submit.prevent="createSurvey">
          <UFormField :label="$t('survey.admin.titleLabel')" required>
            <UInput v-model="newTitle" class="w-full" :placeholder="$t('survey.admin.titlePlaceholder')" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="outline" type="button" @click="showCreate = false">{{ $t('common.cancel') }}</UButton>
            <UButton type="submit" :loading="creating" :disabled="!newTitle.trim()">{{ $t('survey.admin.create') }}</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface SurveyListItem { key: string; title: string; status: string; response_count: number }
interface ResultsQuestion { key: string; type: 'scale' | 'text'; label: string; scalePoints: number[] }
interface ScaleAggregate { key: string; count: number; average: number | null; distribution: Record<number, number> }
interface TextAggregate { key: string; answers: string[] }
interface SurveyResults {
  title: string
  status: string
  totalResponses: number
  questions: ResultsQuestion[]
  scale: ScaleAggregate[]
  text: TextAggregate[]
}

const toast = useToast()
const exporting = ref(false)
const showCreate = ref(false)
const creating = ref(false)
const newTitle = ref('')

const { data: listData, refresh: refreshList } = await useAsyncData('admin-surveys', () =>
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

// Render questions in their authored order, interleaving scale and text.
const renderQuestions = computed(() => {
  const results = data.value
  if (!results?.questions) return []
  return results.questions.map((question, index) => ({
    key: question.key,
    type: question.type,
    label: question.label,
    scalePoints: question.scalePoints,
    number: index + 1,
    scale: question.type === 'scale' ? results.scale.find(a => a.key === question.key) ?? null : null,
    text: question.type === 'text' ? results.text.find(t => t.key === question.key) ?? null : null
  }))
})

async function createSurvey() {
  if (!newTitle.value.trim()) return
  creating.value = true
  try {
    const res = await $fetch<{ survey: { key: string } }>('/api/admin/surveys', {
      method: 'POST',
      body: { title: newTitle.value.trim() }
    })
    showCreate.value = false
    newTitle.value = ''
    await refreshList()
    navigateTo(`/admin/marketing/surveys/${res.survey.key}/edit`)
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to create survey', color: 'error' })
  } finally {
    creating.value = false
  }
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

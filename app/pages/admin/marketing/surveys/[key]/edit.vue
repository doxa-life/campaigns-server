<template>
  <div class="max-w-4xl mx-auto pb-24">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <NuxtLink to="/admin/marketing/surveys" class="text-sm text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]">
        ← {{ $t('survey.admin.backToSurveys') }}
      </NuxtLink>
      <div class="flex gap-2">
        <UButton variant="outline" icon="i-lucide-mail" @click="navigateTo(`/admin/marketing/emails/new?template=${key}`)">
          {{ $t('survey.admin.createEmail') }}
        </UButton>
        <UButton
          variant="outline"
          icon="i-lucide-languages"
          :loading="translating"
          @click="translateAll"
        >
          {{ $t('survey.admin.translateAll') }}
        </UButton>
        <UButton icon="i-lucide-save" :loading="saving" @click="saveAll">{{ $t('survey.admin.save') }}</UButton>
      </div>
    </div>

    <div v-if="loadPending" class="flex justify-center py-20">
      <UIcon name="i-lucide-loader" class="w-8 h-8 animate-spin" />
    </div>

    <template v-else>
      <!-- Settings -->
      <UCard class="mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField :label="$t('survey.admin.titleLabel')" required>
            <UInput v-model="survey.title" class="w-full" />
          </UFormField>
          <UFormField :label="$t('survey.admin.statusLabel')">
            <USelect v-model="survey.status" :items="statusItems" value-key="value" class="w-full" />
          </UFormField>
        </div>
        <div class="mt-4 text-xs text-[var(--ui-text-muted)]">
          {{ $t('survey.admin.keyLabel') }}: <code>{{ key }}</code>
        </div>
        <div class="mt-4 pt-4 border-t border-[var(--ui-border)]">
          <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" @click="showDelete = true">
            {{ $t('survey.admin.deleteSurvey') }}
          </UButton>
        </div>
      </UCard>

      <!-- Questions (structure) -->
      <UCard class="mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold">{{ $t('survey.admin.questions') }}</h3>
          <UButton size="xs" icon="i-lucide-plus" @click="addQuestion">{{ $t('survey.admin.addQuestion') }}</UButton>
        </div>
        <div class="space-y-3">
          <div
            v-for="(q, i) in questions"
            :key="i"
            class="border border-[var(--ui-border)] rounded-lg p-3 space-y-3"
          >
            <div class="flex items-center gap-2">
              <UFormField :label="$t('survey.admin.questionKey')" class="flex-1">
                <UInput v-model="q.key" class="w-full" placeholder="focus" />
              </UFormField>
              <UFormField :label="$t('survey.admin.questionType')" class="w-40">
                <USelect v-model="q.type" :items="typeItems" value-key="value" class="w-full" />
              </UFormField>
              <div class="flex flex-col gap-1 pt-5">
                <UButton size="xs" variant="ghost" icon="i-lucide-chevron-up" :disabled="i === 0" @click="move(i, -1)" />
                <UButton size="xs" variant="ghost" icon="i-lucide-chevron-down" :disabled="i === questions.length - 1" @click="move(i, 1)" />
              </div>
              <UButton class="pt-5" size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="questions.splice(i, 1)" />
            </div>
            <div v-if="q.type === 'scale'" class="grid grid-cols-3 gap-3">
              <UFormField :label="$t('survey.admin.scaleMin')">
                <UInput v-model.number="q.min" type="number" class="w-full" />
              </UFormField>
              <UFormField :label="$t('survey.admin.scaleMax')">
                <UInput v-model.number="q.max" type="number" class="w-full" />
              </UFormField>
              <UFormField :label="$t('survey.admin.scaleLabeledPoints')" :help="$t('survey.admin.scaleLabeledPointsHelp')">
                <UInput v-model="q.scalePointsText" class="w-full" placeholder="1,5" />
              </UFormField>
            </div>
          </div>
          <p v-if="!questions.length" class="text-sm text-[var(--ui-text-muted)]">{{ $t('survey.admin.noQuestions') }}</p>
        </div>
      </UCard>

      <!-- Content (per language) -->
      <UCard>
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold">{{ $t('survey.admin.content') }}</h3>
          <USelect v-model="activeLang" :items="langItems" value-key="value" class="w-56" />
        </div>

        <div v-if="cur" class="space-y-8">
          <!-- Page text -->
          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-3">{{ $t('survey.admin.pageText') }}</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UFormField v-for="f in PAGE_FIELDS" :key="f" :label="f">
                <UTextarea
                  v-if="f === 'intro' || f === 'thanks' || f === 'invalid' || f === 'closed' || f === 'editNotice'"
                  v-model="cur.page[f]"
                  :rows="2"
                  autoresize
                  class="w-full"
                />
                <UInput v-else v-model="cur.page[f]" class="w-full" />
              </UFormField>
            </div>
          </section>

          <!-- Question labels -->
          <section v-if="questions.length">
            <h4 class="text-sm font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-3">{{ $t('survey.admin.questionLabels') }}</h4>
            <div class="space-y-4">
              <div v-for="q in questions" :key="q.key" class="border border-[var(--ui-border)] rounded-lg p-3">
                <UFormField :label="q.key">
                  <UTextarea v-model="cur.questions[q.key].label" :rows="2" autoresize class="w-full" />
                </UFormField>
                <div v-if="q.type === 'scale'" class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <UFormField v-for="p in pointsOf(q)" :key="p" :label="`${$t('survey.admin.scalePoint')} ${p}`">
                    <UInput v-model="cur.questions[q.key].scale[p]" class="w-full" />
                  </UFormField>
                </div>
              </div>
            </div>
          </section>

          <!-- Email -->
          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-3">{{ $t('survey.admin.invitationEmail') }}</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UFormField :label="$t('survey.admin.emailSubject')"><UInput v-model="cur.email.subject" class="w-full" /></UFormField>
              <UFormField :label="$t('survey.admin.emailHeader')"><UInput v-model="cur.email.header" class="w-full" /></UFormField>
              <UFormField :label="$t('survey.admin.emailGreeting')" :help="$t('survey.admin.emailGreetingHelp')"><UInput v-model="cur.email.greeting" class="w-full" /></UFormField>
              <UFormField :label="$t('survey.admin.emailGreetingFallback')"><UInput v-model="cur.email.greeting_fallback" class="w-full" /></UFormField>
              <UFormField :label="$t('survey.admin.emailCta')"><UInput v-model="cur.email.cta" class="w-full" /></UFormField>
              <UFormField :label="$t('survey.admin.emailSignoff')"><UInput v-model="cur.email.signoff" class="w-full" /></UFormField>
              <UFormField :label="$t('survey.admin.emailTeam')"><UInput v-model="cur.email.team" class="w-full" /></UFormField>
            </div>
            <UFormField :label="$t('survey.admin.emailBody')" class="mt-3">
              <RichTextEditor v-model="cur.email.body" />
            </UFormField>
          </section>
        </div>
      </UCard>
    </template>

    <ConfirmModal
      v-model:open="showDelete"
      :title="$t('survey.admin.deleteSurvey')"
      :message="$t('survey.admin.deleteConfirm', { title: survey.title })"
      :confirm-text="$t('survey.admin.delete')"
      confirm-color="error"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="showDelete = false"
    />
  </div>
</template>

<script setup lang="ts">
import { LANGUAGES } from '~/utils/languages'

definePageMeta({ layout: 'admin', middleware: 'auth' })

const route = useRoute()
const toast = useToast()
const { t } = useI18n()
const key = computed(() => String(route.params.key))

const PAGE_FIELDS = ['title', 'intro', 'submit', 'thanksTitle', 'thanks', 'editNotice', 'invalidTitle', 'invalid', 'closedTitle', 'closed', 'goHome', 'errorTitle', 'error']
const EMAIL_FIELDS = ['subject', 'header', 'greeting', 'greeting_fallback', 'cta', 'signoff', 'team']
const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] })

const statusItems = [
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' }
]
const typeItems = [
  { label: 'Scale', value: 'scale' },
  { label: 'Text', value: 'text' }
]
const langItems = LANGUAGES.map(l => ({ label: `${l.flag} ${l.name}`, value: l.code }))

interface FormQuestion { key: string; type: 'scale' | 'text'; min: number; max: number; scalePointsText: string }

const survey = reactive<{ title: string; status: 'open' | 'closed' }>({ title: '', status: 'open' })
const questions = ref<FormQuestion[]>([])
const translations = reactive<Record<string, any>>({})
const activeLang = ref('en')

const saving = ref(false)
const translating = ref(false)
const deleting = ref(false)
const showDelete = ref(false)

function parsePoints(text: string): number[] {
  return [...new Set(text.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n)))]
}
function pointsOf(q: FormQuestion): number[] {
  return parsePoints(q.scalePointsText)
}

// Ensure a language blob has every field/question slot so v-model has a target.
function normalizeLang(lang: string) {
  const c = translations[lang] ?? (translations[lang] = {})
  c.page ??= {}
  for (const f of PAGE_FIELDS) if (c.page[f] === undefined) c.page[f] = ''
  c.questions ??= {}
  for (const q of questions.value) {
    const qc = c.questions[q.key] ?? (c.questions[q.key] = {})
    if (qc.label === undefined) qc.label = ''
    if (q.type === 'scale') {
      qc.scale ??= {}
      for (const p of pointsOf(q)) if (qc.scale[p] === undefined) qc.scale[p] = ''
    }
  }
  c.email ??= {}
  for (const f of EMAIL_FIELDS) if (c.email[f] === undefined) c.email[f] = ''
  if (!c.email.body) c.email.body = emptyDoc()
}

const cur = computed(() => translations[activeLang.value])

const { pending: loadPending } = await useAsyncData(`survey-edit-${key.value}`, async () => {
  const data = await $fetch<{
    survey: { title: string; status: 'open' | 'closed' }
    questions: Array<{ key: string; type: 'scale' | 'text'; config: { min?: number; max?: number; scalePoints?: number[] } }>
    translations: Record<string, any>
  }>(`/api/admin/surveys/${key.value}`)

  survey.title = data.survey.title
  survey.status = data.survey.status
  questions.value = data.questions.map(q => ({
    key: q.key,
    type: q.type,
    min: q.config?.min ?? 1,
    max: q.config?.max ?? 5,
    scalePointsText: (q.config?.scalePoints ?? []).join(',')
  }))
  for (const [lang, content] of Object.entries(data.translations)) translations[lang] = content
  // Always have at least an English blob to author.
  normalizeLang('en')
  normalizeLang(activeLang.value)
  return true
})

// Keep the active language's structure in sync as questions change.
watch(questions, () => normalizeLang(activeLang.value), { deep: true })
watch(activeLang, lang => normalizeLang(lang))

function addQuestion() {
  questions.value.push({ key: `q${questions.value.length + 1}`, type: 'text', min: 1, max: 5, scalePointsText: '' })
}
function move(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= questions.value.length) return
  const arr = questions.value
  ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
}

function buildQuestionsPayload() {
  return questions.value.map(q => ({
    key: q.key.trim(),
    type: q.type,
    config: q.type === 'scale'
      ? { min: Number(q.min), max: Number(q.max), scalePoints: parsePoints(q.scalePointsText) }
      : {}
  }))
}

async function saveAll() {
  saving.value = true
  try {
    await $fetch(`/api/admin/surveys/${key.value}`, { method: 'PUT', body: { title: survey.title, status: survey.status } })
    await $fetch(`/api/admin/surveys/${key.value}/questions`, { method: 'PUT', body: { questions: buildQuestionsPayload() } })
    for (const lang of Object.keys(translations)) {
      await $fetch(`/api/admin/surveys/${key.value}/translations`, { method: 'PUT', body: { language: lang, content: translations[lang] } })
    }
    toast.add({ title: t('survey.admin.saved'), color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Save failed', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function translateAll() {
  translating.value = true
  try {
    // Persist current edits (translate reads from the DB), then translate from English.
    await saveAll()
    const res = await $fetch<{ success: boolean; translated: string[]; failed: { language: string }[] }>(
      `/api/admin/surveys/${key.value}/translate`,
      { method: 'POST', body: { source_language: 'en' } }
    )
    // Reload to pull in the newly written translations.
    const data = await $fetch<{ translations: Record<string, any> }>(`/api/admin/surveys/${key.value}`)
    for (const [lang, content] of Object.entries(data.translations)) translations[lang] = content
    normalizeLang(activeLang.value)
    toast.add({
      title: t('survey.admin.translateDone', { count: res.translated.length }),
      description: res.failed.length ? `Failed: ${res.failed.map(f => f.language).join(', ')}` : undefined,
      color: res.failed.length ? 'warning' : 'success'
    })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Translation failed', color: 'error' })
  } finally {
    translating.value = false
  }
}

async function confirmDelete() {
  deleting.value = true
  try {
    await $fetch(`/api/admin/surveys/${key.value}`, { method: 'DELETE' })
    navigateTo('/admin/marketing/surveys')
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Delete failed', color: 'error' })
    deleting.value = false
  }
}
</script>

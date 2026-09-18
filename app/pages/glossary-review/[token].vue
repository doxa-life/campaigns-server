<template>
  <div class="max-w-3xl mx-auto px-4 py-8">
    <div v-if="loading" class="flex items-center justify-center py-16">
      <UIcon name="i-lucide-loader" class="w-6 h-6 animate-spin" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      :title="error"
      description="Ask whoever sent you this link for a new one."
    />

    <template v-else-if="data">
      <header class="mb-8">
        <h1 class="text-2xl font-bold">
          {{ data.language.name_en }} terminology review
        </h1>
        <p v-if="data.language.name_local" class="text-lg" :dir="data.language.text_direction">
          {{ data.language.name_local }}
        </p>
        <p class="text-sm text-[var(--ui-text-muted)] mt-2">
          {{ data.pass.label }} · {{ confirmedCount }} of {{ entries.length }} terms confirmed
        </p>
      </header>

      <!-- The name gates editing: it is the only attribution an edit through this link carries. -->
      <UCard class="mb-8">
        <div class="flex flex-col gap-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              :label="data.chrome_en.reviewer.rows.reviewer_name"
              :hint="chrome('reviewer.rows.reviewer_name')"
              required
            >
              <UInput v-model="reviewerName" class="w-full" placeholder="Your name" />
            </UFormField>
            <UFormField
              :label="data.chrome_en.reviewer.rows.reviewer_email"
              :hint="chrome('reviewer.rows.reviewer_email')"
              help="So we can come back to you about a flagged term."
            >
              <UInput v-model="reviewerEmail" type="email" class="w-full" placeholder="you@example.com" />
            </UFormField>
          </div>
          <div class="flex items-center gap-3">
            <UButton :loading="savingName" :disabled="!reviewerName.trim()" @click="saveName">
              Save
            </UButton>
            <p v-if="!data.pass.reviewer_name" class="text-sm text-[var(--ui-text-muted)]">
              Enter your name to start. Your work is saved as you go — you can close this page and come back.
            </p>
          </div>
        </div>
      </UCard>

      <UCard class="mb-8">
        <template #header>
          <h2 class="font-semibold">{{ data.chrome_en.instructions.heading }}</h2>
        </template>
        <p class="mb-2">
          <span class="font-medium">{{ data.chrome_en.instructions.purpose_label }}.</span>
          {{ data.chrome_en.instructions.purpose }}
        </p>
        <ol class="list-decimal pl-5 flex flex-col gap-1 text-sm">
          <li v-for="(item, index) in data.chrome_en.instructions.items" :key="index">{{ item }}</li>
        </ol>

        <template v-if="localInstructions.items.length" #footer>
          <div :dir="data.language.text_direction">
            <h3 class="font-semibold mb-2">{{ localInstructions.heading }}</h3>
            <p v-if="localInstructions.purpose" class="mb-2">
              <span class="font-medium">{{ localInstructions.purpose_label }}.</span>
              {{ localInstructions.purpose }}
            </p>
            <ol class="list-decimal pl-5 flex flex-col gap-1 text-sm">
              <li v-for="(item, index) in localInstructions.items" :key="index">{{ item }}</li>
            </ol>
          </div>
        </template>
      </UCard>

      <UCard class="mb-8">
        <template #header>
          <h2 class="font-semibold">
            {{ data.chrome_en.reviewer.bible_label }}
            <span v-if="chrome('reviewer.bible_label')" class="text-[var(--ui-text-muted)] font-normal">
              · {{ chrome('reviewer.bible_label') }}
            </span>
          </h2>
        </template>
        <p class="text-sm text-[var(--ui-text-muted)] mb-4">{{ data.chrome_en.reviewer.bible_note }}</p>
        <p
          v-if="chrome('reviewer.bible_note')"
          class="text-sm text-[var(--ui-text-muted)] mb-4"
          :dir="data.language.text_direction"
        >
          {{ chrome('reviewer.bible_note') }}
        </p>

        <div class="flex flex-col gap-4">
          <UFormField v-if="bibleOptions.length" :label="data.chrome_en.reviewer.rows.bible_translation_primary">
            <USelect
              v-model="bibleForm.bible_id"
              :items="bibleOptions"
              placeholder="Choose a translation…"
              class="w-full"
              @change="saveBible"
            />
          </UFormField>

          <UFormField
            :label="data.chrome_en.reviewer.rows.bible_translation_edition_year"
            :help="bibleOptions.length
              ? 'If your community uses a translation that is not listed above, name it here.'
              : 'Name the translation your community uses — exact title, abbreviation, edition, and year.'"
          >
            <UInput v-model="bibleForm.bible_translation" class="w-full" @change="saveBible" />
          </UFormField>
        </div>
      </UCard>

      <div class="flex flex-col gap-8">
        <section v-for="section in groupedEntries" :key="section.title">
          <h2 class="text-lg font-semibold mb-1">{{ section.title }}</h2>
          <p
            v-if="chrome(`section_titles.${section.title}`)"
            class="text-[var(--ui-text-muted)] mb-4"
            :dir="data.language.text_direction"
          >
            {{ chrome(`section_titles.${section.title}`) }}
          </p>

          <div class="flex flex-col gap-4">
            <UCard v-for="entry in section.entries" :key="entry.term_id">
              <div class="flex items-start justify-between gap-3 mb-4">
                <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)] flex items-baseline gap-2">
                  <span class="text-xs font-normal tabular-nums text-[var(--ui-text-dimmed)]">
                    {{ entry.number }}/{{ entries.length }}
                  </span>
                  {{ entry.term }}
                </h3>
                <UBadge :color="statusColor(entry)" variant="subtle" size="xs">
                  {{ entry.status }}
                </UBadge>
              </div>

              <dl class="flex flex-col gap-4 mb-5">
                <div v-for="field in entry.fields" :key="field.label">
                  <dt class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                    <span class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text)]">
                      {{ field.label }}
                    </span>
                    <span
                      v-if="chrome(`field_labels.${field.label}`)"
                      class="text-[11px] text-[var(--ui-text)]"
                      :dir="data.language.text_direction"
                    >
                      {{ chrome(`field_labels.${field.label}`) }}
                    </span>
                  </dt>
                  <dd
                    class="border-s-2 border-[var(--ui-border-accented)] ps-3 text-sm leading-relaxed text-[var(--ui-text-toned)]"
                  >
                    {{ field.value }}
                  </dd>
                </div>
              </dl>

              <UFormField :label="chrome('labels.final_term') || data.chrome_en.labels.final_term">
                <UInput
                  v-model="entry.value"
                  :dir="data.language.text_direction"
                  :disabled="!canEdit"
                  class="w-full"
                  @change="saveValue(entry)"
                />
              </UFormField>

              <div class="flex items-center gap-2 mt-3 flex-wrap">
                <UButton
                  :color="entry.status === 'confirmed' ? 'success' : 'neutral'"
                  :variant="entry.status === 'confirmed' ? 'solid' : 'outline'"
                  :disabled="!canEdit"
                  icon="i-lucide-check"
                  size="sm"
                  @click="setStatus(entry, entry.status === 'confirmed' ? 'draft' : 'confirmed')"
                >
                  {{ chrome('labels.confirm') || data.chrome_en.labels.confirm }}
                </UButton>
                <UButton
                  :color="entry.status === 'flagged' ? 'warning' : 'neutral'"
                  :variant="entry.status === 'flagged' ? 'solid' : 'outline'"
                  :disabled="!canEdit"
                  icon="i-lucide-flag"
                  size="sm"
                  @click="setStatus(entry, entry.status === 'flagged' ? 'draft' : 'flagged')"
                >
                  {{ chrome('labels.flag') || data.chrome_en.labels.flag }}
                </UButton>
              </div>

              <UFormField
                :label="chrome('labels.translator_notes') || data.chrome_en.labels.translator_notes"
                class="mt-3"
              >
                <UTextarea
                  v-model="entry.note"
                  :rows="2"
                  :disabled="!canEdit"
                  class="w-full"
                  @change="saveNote(entry)"
                />
              </UFormField>
            </UCard>
          </div>
        </section>
      </div>

      <!-- Rules no single term holds. Placed after the terms because working
           through them is what brings these to mind. -->
      <UCard class="mt-10">
        <template #header>
          <h2 class="font-semibold">
            {{ data.chrome_en.notes.heading }}
            <span v-if="chrome('notes.heading')" class="text-[var(--ui-text-muted)] font-normal">
              · {{ chrome('notes.heading') }}
            </span>
          </h2>
        </template>

        <p class="text-sm text-[var(--ui-text-muted)]">{{ data.chrome_en.notes.purpose }}</p>
        <ul class="text-sm text-[var(--ui-text-muted)] list-disc pl-5 mt-2 space-y-1">
          <li v-for="(item, index) in data.chrome_en.notes.items" :key="index">{{ item }}</li>
        </ul>

        <div v-if="localNotesChrome.purpose" :dir="data.language.text_direction" class="mt-4">
          <p class="text-sm">{{ localNotesChrome.purpose }}</p>
          <ul v-if="localNotesChrome.items.length" class="text-sm list-disc pl-5 mt-2 space-y-1">
            <li v-for="(item, index) in localNotesChrome.items" :key="index">{{ item }}</li>
          </ul>
        </div>

        <UTextarea
          v-model="languageNotes"
          :rows="10"
          :disabled="!canEdit"
          :dir="data.language.text_direction"
          class="w-full mt-4"
          @change="saveLanguageNotes"
        />
        <p class="text-xs text-[var(--ui-text-muted)] mt-2">
          {{ languageNotes.length }} / {{ notesMaxLength }}
        </p>
      </UCard>

      <div class="mt-10 flex items-center justify-between gap-4 flex-wrap">
        <p class="text-sm text-[var(--ui-text-muted)]">
          {{ confirmedCount }} of {{ entries.length }} terms confirmed.
        </p>
        <UButton
          :loading="submitting"
          :disabled="!canEdit"
          :color="data.pass.status === 'submitted' ? 'neutral' : 'primary'"
          size="lg"
          icon="i-lucide-send"
          @click="submit"
        >
          {{ data.pass.status === 'submitted'
            ? (chrome('labels.submitted') || data.chrome_en.labels.submitted)
            : (chrome('labels.submit') || data.chrome_en.labels.submit) }}
        </UButton>
      </div>

      <p v-if="data.pass.status === 'submitted'" class="text-sm text-[var(--ui-text-muted)] mt-3 text-right">
        You can keep editing — changes are saved as you make them.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { GLOSSARY_NOTES_MAX_LENGTH } from '~~/config/glossary-chrome'

definePageMeta({
  layout: 'default'
})

// A review link is meant for the person it was sent to, not for search engines.
useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }]
})

interface Field { label: string; value: string }

interface Entry {
  term_id: string
  number: number
  term: string
  section_title: string
  fields: Field[]
  value: string
  status: 'draft' | 'confirmed' | 'flagged'
  note: string
  stale: boolean
}

interface ReviewData {
  pass: {
    id: string
    label: string
    reviewer_name: string | null
    reviewer_email: string | null
    status: 'open' | 'submitted'
    submitted_at: string | null
  }
  language: {
    code: string
    name_en: string
    name_local: string
    text_direction: 'ltr' | 'rtl'
    bible_id: string | null
    bible_translation: string | null
    notes: string
  }
  chrome_en: {
    instructions: { heading: string; purpose_label: string; purpose: string; items: string[] }
    labels: Record<string, string>
    reviewer: { heading: string; bible_label: string; bible_note: string; rows: Record<string, string> }
    notes: { heading: string; purpose: string; items: string[] }
  }
  chrome_local: Record<string, any>
  bible_translations: Array<{ short_name: string; full_name: string }>
  entries: Entry[]
}

const route = useRoute()
const toast = useToast()

const token = computed(() => String(route.params.token || ''))

const data = ref<ReviewData | null>(null)
const entries = ref<Entry[]>([])
const loading = ref(true)
const error = ref('')

const reviewerName = ref('')
const reviewerEmail = ref('')
const savingName = ref(false)
const submitting = ref(false)
const bibleForm = ref({ bible_id: '', bible_translation: '' })
const languageNotes = ref('')
const notesMaxLength = GLOSSARY_NOTES_MAX_LENGTH

const canEdit = computed(() => !!data.value?.pass.reviewer_name)
const confirmedCount = computed(() => entries.value.filter(entry => entry.status === 'confirmed').length)

const localInstructions = computed(() => ({
  heading: data.value?.chrome_local?.instructions?.heading || '',
  purpose_label: data.value?.chrome_local?.instructions?.purpose_label || '',
  purpose: data.value?.chrome_local?.instructions?.purpose || '',
  items: (data.value?.chrome_local?.instructions?.items || []) as string[]
}))

// Languages seeded before the notes field existed have no translated wording
// for it, so each piece falls back to the English shown above it.
const localNotesChrome = computed(() => ({
  purpose: data.value?.chrome_local?.notes?.purpose || '',
  items: (data.value?.chrome_local?.notes?.items || []) as string[]
}))

// No empty sentinel option: a select item may not carry an empty value, so the
// unchosen state is the placeholder.
const bibleOptions = computed(() =>
  (data.value?.bible_translations || []).map(translation => ({
    label: `${translation.short_name} — ${translation.full_name}`,
    value: translation.short_name
  }))
)

const groupedEntries = computed(() => {
  const groups: Array<{ title: string; entries: Entry[] }> = []
  for (const entry of entries.value) {
    const last = groups[groups.length - 1]
    if (last && last.title === entry.section_title) last.entries.push(entry)
    else groups.push({ title: entry.section_title, entries: [entry] })
  }
  return groups
})

/** A translated label by dotted path, or '' when the language has no wording for it. */
function chrome(path: string): string {
  let node: any = data.value?.chrome_local
  for (const key of path.split('.')) {
    if (!node || typeof node !== 'object') return ''
    node = node[key]
  }
  return typeof node === 'string' ? node : ''
}

function statusColor(entry: Entry): 'success' | 'warning' | 'neutral' {
  if (entry.status === 'confirmed') return 'success'
  if (entry.status === 'flagged') return 'warning'
  return 'neutral'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await $fetch<ReviewData>(`/api/glossary/review/${token.value}`)
    data.value = result
    entries.value = result.entries.map((entry, index) => ({
      ...entry,
      number: index + 1,
      note: entry.note || ''
    }))
    reviewerName.value = result.pass.reviewer_name || ''
    reviewerEmail.value = result.pass.reviewer_email || ''
    bibleForm.value = {
      bible_id: result.language.bible_id || '',
      bible_translation: result.language.bible_translation || ''
    }
    languageNotes.value = result.language.notes || ''
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'This review link is no longer valid'
  } finally {
    loading.value = false
  }
}

async function saveName() {
  savingName.value = true
  try {
    const pass = await $fetch<{ reviewer_name: string | null; reviewer_email: string | null }>(
      `/api/glossary/review/${token.value}/reviewer`,
      {
        method: 'PATCH',
        body: { reviewer_name: reviewerName.value, reviewer_email: reviewerEmail.value }
      }
    )
    if (data.value) {
      data.value.pass.reviewer_name = pass.reviewer_name
      data.value.pass.reviewer_email = pass.reviewer_email
    }
    toast.add({ title: 'Thanks — you can start reviewing', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not save your details', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingName.value = false
  }
}

async function patchTerm(entry: Entry, body: Record<string, unknown>) {
  try {
    const updated = await $fetch<{ value: string; status: Entry['status']; note: string | null }>(
      `/api/glossary/review/${token.value}/terms/${entry.term_id}`,
      { method: 'PATCH', body }
    )
    entry.status = updated.status
    entry.value = updated.value
    entry.note = updated.note || ''
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage, color: 'error' })
    await load()
  }
}

// Editing the wording is itself a decision about the term, so it confirms it.
function saveValue(entry: Entry) {
  patchTerm(entry, { value: entry.value, status: 'confirmed' })
}

function setStatus(entry: Entry, status: Entry['status']) {
  patchTerm(entry, { status })
}

function saveNote(entry: Entry) {
  patchTerm(entry, { note: entry.note })
}

async function saveBible() {
  try {
    await $fetch(`/api/glossary/review/${token.value}/bible`, {
      method: 'PATCH',
      body: {
        bible_id: bibleForm.value.bible_id || null,
        bible_translation: bibleForm.value.bible_translation || null
      }
    })
  } catch (e: any) {
    toast.add({ title: 'Could not save the Bible translation', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function saveLanguageNotes() {
  try {
    await $fetch(`/api/glossary/review/${token.value}/notes`, {
      method: 'PATCH',
      body: { notes: languageNotes.value }
    })
    toast.add({ title: 'Notes saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not save your notes', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function submit() {
  submitting.value = true
  try {
    await $fetch(`/api/glossary/review/${token.value}/submit`, { method: 'POST' })
    if (data.value) data.value.pass.status = 'submitted'
    toast.add({
      title: 'Review submitted',
      description: 'Thank you. You can still come back and change anything.',
      color: 'success'
    })
  } catch (e: any) {
    toast.add({ title: 'Could not submit', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

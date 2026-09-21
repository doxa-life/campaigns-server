<template>
  <div class="max-w-6xl">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader" class="w-6 h-6 animate-spin" />
      <span class="ml-2">Loading...</span>
    </div>

    <UAlert v-else-if="error" color="error" :title="error" />

    <template v-else-if="language">
      <div class="flex justify-between items-start gap-4 mb-6">
        <div>
          <UButton
            to="/admin/glossary"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            size="xs"
            class="-ml-2 mb-1"
          >
            Glossary
          </UButton>
          <h1 class="text-2xl font-bold flex items-center gap-2">
            {{ language.name_en }}
            <span v-if="language.name_local" class="text-[var(--ui-text-muted)] font-normal">
              {{ language.name_local }}
            </span>
            <UBadge color="neutral" variant="outline">{{ language.code }}</UBadge>
          </h1>
          <p class="text-sm text-[var(--ui-text-muted)] mt-1">
            {{ confirmedCount }} of {{ entries.length }} terms confirmed
            <span v-if="!language.registered_in_code">
              · not yet registered in <code>config/languages.ts</code>
            </span>
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <UButton
            :to="`/api/glossary/${language.code}?format=markdown`"
            external
            target="_blank"
            icon="i-lucide-download"
            variant="outline"
            color="neutral"
          >
            Export
          </UButton>
          <UDropdownMenu v-if="canManage" :items="actionItems">
            <UButton icon="i-lucide-ellipsis-vertical" variant="ghost" color="neutral" aria-label="Language actions" />
          </UDropdownMenu>
        </div>
      </div>

      <UTabs v-model="activeTab" :items="tabs" class="w-full">
        <template #terms>
          <div class="flex flex-col gap-3 pt-4">
            <div class="flex items-center gap-2 flex-wrap">
              <UInput v-model="search" icon="i-lucide-search" placeholder="Filter terms" class="w-64" />
              <USelect v-model="statusFilter" :items="statusFilterOptions" class="w-48" />
            </div>

            <div
              v-for="entry in visibleEntries"
              :key="entry.term_id"
              class="border border-[var(--ui-border)] rounded-lg p-4 flex flex-col gap-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium">{{ entry.term }}</span>
                    <span v-if="entry.acronym" class="text-[var(--ui-text-muted)]">({{ entry.acronym }})</span>
                    <UBadge :color="statusColor(entry)" variant="subtle" size="xs">
                      {{ statusLabel(entry) }}
                    </UBadge>
                    <span class="text-xs text-[var(--ui-text-muted)]">{{ entry.section_title }}</span>
                  </div>
                  <p v-if="entry.note" class="text-sm text-[var(--ui-text-muted)] mt-1">
                    <span class="font-medium">Note.</span> {{ entry.note }}
                  </p>
                  <p v-if="entry.updated_by_name" class="text-xs text-[var(--ui-text-muted)] mt-1">
                    Last changed by {{ entry.updated_by_name }}
                  </p>
                </div>
                <UButton
                  v-if="entry.translation_id"
                  icon="i-lucide-history"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="History"
                  @click="openHistory(entry)"
                />
              </div>

              <div class="flex items-center gap-2">
                <UInput
                  :model-value="entry.value"
                  :dir="language.text_direction"
                  :disabled="!canManage"
                  placeholder="No wording yet"
                  class="flex-1"
                  @change="(event: Event) => saveValue(entry, (event.target as HTMLInputElement).value)"
                />
                <!-- Empty means the English acronym; only a language's own is stored. -->
                <UInput
                  v-if="entry.acronym"
                  :model-value="entry.acronym_translation || ''"
                  :placeholder="entry.acronym"
                  :dir="language.text_direction"
                  :disabled="!canManage"
                  :aria-label="`Acronym, ${entry.acronym} unless set`"
                  class="w-28"
                  @change="(event: Event) => saveAcronym(entry, (event.target as HTMLInputElement).value)"
                />
                <UButton
                  v-if="canManage"
                  :color="entry.status === 'confirmed' ? 'success' : 'neutral'"
                  :variant="entry.status === 'confirmed' ? 'solid' : 'outline'"
                  icon="i-lucide-check"
                  size="sm"
                  @click="setStatus(entry, entry.status === 'confirmed' ? 'draft' : 'confirmed')"
                >
                  Confirm
                </UButton>
                <UButton
                  v-if="canManage"
                  :color="entry.status === 'flagged' ? 'warning' : 'neutral'"
                  :variant="entry.status === 'flagged' ? 'solid' : 'outline'"
                  icon="i-lucide-flag"
                  size="sm"
                  aria-label="Flag"
                  @click="setStatus(entry, entry.status === 'flagged' ? 'draft' : 'flagged')"
                />
              </div>
            </div>

            <p v-if="visibleEntries.length === 0" class="text-center py-8 text-[var(--ui-text-muted)]">
              No terms match this filter.
            </p>
          </div>
        </template>

        <template #reviews>
          <div class="flex flex-col gap-4 pt-4">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm text-[var(--ui-text-muted)]">
                Each pass is one review link. Label it with the reviewer's name or the round —
                whoever opens it still enters their own name, which is what edits are attributed to.
                Edits take effect immediately and stay reversible.
              </p>
              <UButton v-if="canManage" icon="i-lucide-plus" @click="startNewPass">
                New pass
              </UButton>
            </div>

            <div
              v-for="pass in passes"
              :key="pass.id"
              class="border border-[var(--ui-border)] rounded-lg p-4 flex flex-col gap-2"
            >
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ pass.label }}</span>
                  <UBadge :color="pass.status === 'submitted' ? 'success' : 'info'" variant="subtle" size="xs">
                    {{ pass.status === 'submitted' ? 'Submitted' : 'Open' }}
                  </UBadge>
                </div>
                <div v-if="canManage" class="flex items-center gap-1">
                  <UButton
                    icon="i-lucide-copy"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="copyLink(pass)"
                  >
                    Copy link
                  </UButton>
                  <UButton
                    v-if="pass.status === 'submitted'"
                    icon="i-lucide-rotate-ccw"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="reopenPass(pass)"
                  >
                    Reopen
                  </UButton>
                  <UButton
                    icon="i-lucide-refresh-cw"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    aria-label="Regenerate link"
                    @click="regeneratePass(pass)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    size="xs"
                    variant="ghost"
                    color="error"
                    aria-label="Delete pass"
                    @click="deletePass(pass)"
                  />
                </div>
              </div>
              <p class="text-sm text-[var(--ui-text-muted)]">
                {{ pass.reviewer_name || 'Not yet opened' }}
                <a
                  v-if="pass.reviewer_email"
                  :href="`mailto:${pass.reviewer_email}`"
                  class="underline"
                >{{ pass.reviewer_email }}</a>
                <span v-if="pass.submitted_at"> · submitted {{ formatDate(pass.submitted_at) }}</span>
                <span v-else-if="pass.last_seen_at"> · last seen {{ formatDate(pass.last_seen_at) }}</span>
              </p>
              <code class="text-xs text-[var(--ui-text-muted)] break-all">{{ reviewUrl(pass) }}</code>
            </div>

            <p v-if="passes.length === 0" class="text-center py-8 text-[var(--ui-text-muted)]">
              No review passes yet.
            </p>
          </div>
        </template>

        <template #bible>
          <div class="flex flex-col gap-4 pt-4 max-w-xl">
            <p class="text-sm text-[var(--ui-text-muted)]">
              Biblical phrasing across the whole glossary follows one translation — the one this language's
              church communities actually use.
            </p>

            <UFormField
              label="Bolls.life edition"
              :help="bibleOptions.length
                ? 'The editions the app can fetch verses from for this language.'
                : 'Bolls.life carries no edition for this language yet. Record the reviewer\'s answer below and request it from bolls.'"
            >
              <div class="flex items-center gap-2">
                <USelect
                  v-model="bibleForm.bible_id"
                  :items="bibleOptions"
                  :disabled="!canManage || !bibleOptions.length"
                  placeholder="Not set"
                  class="flex-1"
                />
                <UButton
                  v-if="canManage && bibleForm.bible_id"
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  aria-label="Clear edition"
                  @click="() => { bibleForm.bible_id = '' }"
                />
              </div>
            </UFormField>

            <UFormField label="Translation reported by reviewers" help="Exact title, abbreviation, edition, and year.">
              <UInput v-model="bibleForm.bible_translation" :disabled="!canManage" class="w-full" />
            </UFormField>

            <UFormField label="Notes">
              <UTextarea v-model="bibleForm.bible_translation_note" :rows="3" :disabled="!canManage" class="w-full" />
            </UFormField>

            <div v-if="canManage">
              <UButton :loading="savingBible" @click="saveBible">Save</UButton>
            </div>
          </div>
        </template>

        <template #notes>
          <div class="flex flex-col gap-4 pt-4 max-w-2xl">
            <p class="text-sm text-[var(--ui-text-muted)]">
              Rules that hold for all {{ language.name_en }} rather than for one term — how the reader is
              addressed, the verbs prayer prompts use, which acronyms translate, how numbers are written.
              This text is sent with every machine translation and is what a developer or agent reads before
              translating a repository's strings, so keep it short and concrete.
            </p>

            <UFormField
              label="Notes"
              :help="`${notesForm.length} of ${notesMaxLength} characters. Markdown. Written in English or in ${language.name_en}.`"
            >
              <UTextarea
                v-model="notesForm"
                :rows="16"
                :disabled="!canManage"
                :placeholder="notesTemplate"
                class="w-full font-mono text-sm"
              />
            </UFormField>

            <UAlert
              v-if="notesForm.length > notesMaxLength"
              color="error"
              variant="subtle"
              :title="`Too long by ${notesForm.length - notesMaxLength} characters`"
              description="A point that applies to a single term belongs in that term's own note, where it is read only by whoever opens it."
            />

            <div class="flex items-center gap-2">
              <UButton v-if="canManage" :loading="savingNotes" :disabled="notesForm.length > notesMaxLength" @click="saveNotes">
                Save
              </UButton>
              <UButton
                v-if="canManage && !notesForm.trim()"
                variant="outline"
                color="neutral"
                icon="i-lucide-list-plus"
                @click="() => { notesForm = notesTemplate }"
              >
                Start from the headings
              </UButton>
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-history"
                @click="openNoteHistory"
              >
                History
              </UButton>
            </div>
          </div>
        </template>
      </UTabs>
    </template>

    <UModal v-model:open="showNewPass" :title="createdPass ? 'Review link ready' : 'New review pass'">
      <template #body>
        <UFormField
          v-if="!createdPass"
          label="Label"
          required
          help="Name it after the reviewer you are sending it to, or after the round — “Rodica T” or “French pass 1”."
        >
          <UInput v-model="newPassLabel" :placeholder="`${language?.name_en || ''} pass 1`" class="w-full" />
        </UFormField>

        <div v-else class="flex flex-col gap-3">
          <p class="text-sm">
            Send this link to your reviewer for <strong>{{ createdPass.label }}</strong>. It works until
            you regenerate it.
          </p>
          <div class="flex items-center gap-2">
            <UInput :model-value="reviewUrl(createdPass)" readonly class="flex-1 font-mono text-xs" />
            <UButton icon="i-lucide-copy" @click="copyLink(createdPass)">Copy</UButton>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <template v-if="createdPass">
            <UButton @click="() => { showNewPass = false }">Done</UButton>
          </template>
          <template v-else>
            <UButton color="neutral" variant="ghost" @click="() => { showNewPass = false }">Cancel</UButton>
            <UButton :loading="creatingPass" @click="createPass">Create</UButton>
          </template>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showHistory" title="History">
      <template #body>
        <div v-if="historyLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader" class="w-5 h-5 animate-spin" />
        </div>
        <ul v-else class="flex flex-col gap-3">
          <li
            v-for="revision in history"
            :key="revision.id"
            class="border border-[var(--ui-border)] rounded-lg p-3 flex items-start justify-between gap-3"
          >
            <div class="min-w-0">
              <p class="font-medium break-words" :dir="language?.text_direction">{{ revision.value || '—' }}</p>
              <p class="text-xs text-[var(--ui-text-muted)] mt-1">
                {{ revision.status }} · {{ revision.reviewer_name || revision.source }} ·
                {{ formatDate(revision.created_at) }}
              </p>
              <p v-if="revision.note" class="text-xs text-[var(--ui-text-muted)] mt-1">{{ revision.note }}</p>
            </div>
            <UButton
              v-if="canManage"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-undo-2"
              @click="revert(revision)"
            >
              Restore
            </UButton>
          </li>
          <li v-if="history.length === 0" class="text-sm text-[var(--ui-text-muted)] py-4">
            No changes recorded yet.
          </li>
        </ul>
      </template>
    </UModal>

    <UModal v-model:open="showNoteHistory" title="Notes history">
      <template #body>
        <div v-if="noteHistoryLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader" class="w-5 h-5 animate-spin" />
        </div>
        <ul v-else class="flex flex-col gap-3">
          <li
            v-for="revision in noteHistory"
            :key="revision.id"
            class="border border-[var(--ui-border)] rounded-lg p-3 flex items-start justify-between gap-3"
          >
            <div class="min-w-0">
              <pre class="text-xs whitespace-pre-wrap break-words font-mono">{{ revision.notes || '—' }}</pre>
              <p class="text-xs text-[var(--ui-text-muted)] mt-1">
                {{ revision.reviewer_name || revision.source }} · {{ formatDate(revision.created_at) }}
              </p>
            </div>
            <UButton
              v-if="canManage"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-undo-2"
              class="shrink-0"
              @click="revertNotes(revision)"
            >
              Restore
            </UButton>
          </li>
          <li v-if="noteHistory.length === 0" class="text-sm text-[var(--ui-text-muted)] py-4">
            No notes recorded yet.
          </li>
        </ul>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { GLOSSARY_NOTES_MAX_LENGTH, GLOSSARY_NOTES_TEMPLATE } from '~~/config/glossary-chrome'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface Entry {
  term_id: string
  term: string
  acronym: string | null
  section_title: string
  value: string
  acronym_translation: string | null
  status: 'draft' | 'confirmed' | 'flagged'
  note: string | null
  stale: boolean
  updated_by_name: string | null
  translation_id: string | null
}

interface Pass {
  id: string
  label: string
  token: string
  reviewer_name: string | null
  reviewer_email: string | null
  status: 'open' | 'submitted'
  submitted_at: string | null
  last_seen_at: string | null
}

interface Revision {
  id: string
  value: string
  status: string
  note: string | null
  reviewer_name: string | null
  source: string
  created_at: string
}

interface Language {
  code: string
  name_en: string
  name_local: string
  text_direction: 'ltr' | 'rtl'
  bible_id: string | null
  bible_translation: string | null
  bible_translation_note: string | null
  notes: string
  registered_in_code: boolean
}

interface NoteRevision {
  id: string
  notes: string
  reviewer_name: string | null
  source: string
  created_at: string
}

const route = useRoute()
const toast = useToast()
const { canAccess } = useAuthUser()
const config = useRuntimeConfig()

const code = computed(() => String(route.params.code || ''))
const canManage = computed(() => canAccess('glossary.manage'))

const language = ref<Language | null>(null)
const entries = ref<Entry[]>([])
const passes = ref<Pass[]>([])
const bibleTranslations = ref<Array<{ short_name: string; full_name: string }>>([])
const loading = ref(true)
const error = ref('')

const search = ref('')
const statusFilter = ref('all')
const statusFilterOptions = [
  { label: 'All terms', value: 'all' },
  { label: 'Needs review', value: 'draft' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Flagged', value: 'flagged' },
  { label: 'Stale', value: 'stale' }
]

const tabs = [
  { label: 'Terms', value: 'terms', slot: 'terms' },
  { label: 'Translation notes', value: 'notes', slot: 'notes' },
  { label: 'Reviews', value: 'reviews', slot: 'reviews' },
  { label: 'Bible translation', value: 'bible', slot: 'bible' }
]

const activeTab = ref('terms')
const showNewPass = ref(false)
const newPassLabel = ref('')
const creatingPass = ref(false)
const createdPass = ref<Pass | null>(null)

const showHistory = ref(false)
const historyLoading = ref(false)
const history = ref<Revision[]>([])

const bibleForm = ref({ bible_id: '', bible_translation: '', bible_translation_note: '' })
const savingBible = ref(false)

const notesForm = ref('')
const savingNotes = ref(false)
const showNoteHistory = ref(false)
const noteHistoryLoading = ref(false)
const noteHistory = ref<NoteRevision[]>([])
const notesMaxLength = GLOSSARY_NOTES_MAX_LENGTH
const notesTemplate = GLOSSARY_NOTES_TEMPLATE

const confirmedCount = computed(() => entries.value.filter(entry => entry.status === 'confirmed').length)

// No empty sentinel option: a select item may not carry an empty value, so the
// unset state is the placeholder and the adjacent button clears it.
const bibleOptions = computed(() =>
  bibleTranslations.value.map(translation => ({
    label: `${translation.short_name} — ${translation.full_name}`,
    value: translation.short_name
  }))
)

const visibleEntries = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return entries.value.filter(entry => {
    if (needle && !entry.term.toLowerCase().includes(needle) && !entry.value.toLowerCase().includes(needle)) {
      return false
    }
    if (statusFilter.value === 'stale') return entry.stale
    if (statusFilter.value !== 'all') return entry.status === statusFilter.value
    return true
  })
})

const actionItems = computed(() => [[
  {
    label: 'Draft missing terms',
    icon: 'i-lucide-sparkles',
    onSelect: () => populate(false)
  },
  {
    label: 'Redraft all unconfirmed',
    icon: 'i-lucide-refresh-cw',
    onSelect: () => populate(true)
  },
  {
    label: 'Re-translate the review page',
    icon: 'i-lucide-languages',
    onSelect: redraftChrome
  }
]])

function statusLabel(entry: Entry): string {
  if (entry.stale) return 'stale'
  return entry.status
}

function statusColor(entry: Entry): 'success' | 'warning' | 'error' | 'neutral' {
  if (entry.stale) return 'error'
  if (entry.status === 'confirmed') return 'success'
  if (entry.status === 'flagged') return 'warning'
  return 'neutral'
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function reviewUrl(pass: Pass): string {
  const base = config.public.siteUrl || window.location.origin
  return `${base}/glossary-review/${pass.token}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{
      language: Language
      entries: Entry[]
      passes: Pass[]
      bible_translations: Array<{ short_name: string; full_name: string }>
    }>(`/api/admin/glossary/languages/${code.value}`)

    language.value = data.language
    entries.value = data.entries
    passes.value = data.passes
    bibleTranslations.value = data.bible_translations
    bibleForm.value = {
      bible_id: data.language.bible_id || '',
      bible_translation: data.language.bible_translation || '',
      bible_translation_note: data.language.bible_translation_note || ''
    }
    notesForm.value = data.language.notes || ''
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load the language'
  } finally {
    loading.value = false
  }
}

async function patchTerm(entry: Entry, body: Record<string, unknown>) {
  try {
    const updated = await $fetch<{
      value: string
      acronym: string | null
      status: Entry['status']
      note: string | null
      stale: boolean
      id: string
    }>(`/api/admin/glossary/languages/${code.value}/terms/${entry.term_id}`, { method: 'PATCH', body })
    entry.value = updated.value
    entry.acronym_translation = updated.acronym
    entry.status = updated.status
    entry.note = updated.note
    entry.stale = updated.stale
    entry.translation_id = updated.id
  } catch (e: any) {
    toast.add({ title: 'Could not save the term', description: e?.data?.statusMessage, color: 'error' })
    await load()
  }
}

function saveValue(entry: Entry, value: string) {
  if (value === entry.value) return
  patchTerm(entry, { value, status: 'confirmed' })
}

function saveAcronym(entry: Entry, acronym: string) {
  if (acronym === (entry.acronym_translation || '')) return
  patchTerm(entry, { acronym, status: 'confirmed' })
}

function setStatus(entry: Entry, status: Entry['status']) {
  patchTerm(entry, { status })
}

async function populate(redraftAll: boolean) {
  const toastId = toast.add({ title: 'Drafting…', description: 'This takes a moment.', color: 'info' })
  try {
    const result = await $fetch<{ drafted: number }>(`/api/admin/glossary/languages/${code.value}/populate`, {
      method: 'POST',
      body: { redraft_all: redraftAll }
    })
    toast.remove(toastId.id)
    toast.add({ title: `${result.drafted} terms drafted`, color: 'success' })
    await load()
  } catch (e: any) {
    toast.remove(toastId.id)
    toast.add({ title: 'Drafting failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function redraftChrome() {
  try {
    await $fetch(`/api/admin/glossary/languages/${code.value}/chrome`, { method: 'POST' })
    toast.add({ title: 'Review page translated', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not translate the review page', description: e?.data?.statusMessage, color: 'error' })
  }
}

function startNewPass() {
  createdPass.value = null
  newPassLabel.value = ''
  showNewPass.value = true
}

async function createPass() {
  const label = newPassLabel.value.trim() || `${language.value?.name_en} pass ${passes.value.length + 1}`
  creatingPass.value = true
  try {
    const pass = await $fetch<Pass>(`/api/admin/glossary/languages/${code.value}/passes`, {
      method: 'POST',
      body: { label }
    })
    // The link is the whole point of creating a pass, so hand it over before
    // closing rather than making the admin hunt for it in the list.
    createdPass.value = pass
    activeTab.value = 'reviews'
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not create the pass', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    creatingPass.value = false
  }
}

async function copyLink(pass: Pass) {
  await navigator.clipboard.writeText(reviewUrl(pass))
  toast.add({ title: 'Review link copied', color: 'success' })
}

async function regeneratePass(pass: Pass) {
  try {
    await $fetch(`/api/admin/glossary/languages/${code.value}/passes/${pass.id}/regenerate`, { method: 'POST' })
    toast.add({ title: 'New link issued', description: 'The previous link no longer works.', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not regenerate the link', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function reopenPass(pass: Pass) {
  try {
    await $fetch(`/api/admin/glossary/languages/${code.value}/passes/${pass.id}/reopen`, { method: 'POST' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not reopen the pass', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function deletePass(pass: Pass) {
  try {
    await $fetch(`/api/admin/glossary/languages/${code.value}/passes/${pass.id}`, { method: 'DELETE' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not delete the pass', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function openHistory(entry: Entry) {
  if (!entry.translation_id) return
  showHistory.value = true
  historyLoading.value = true
  try {
    const data = await $fetch<{ revisions: Revision[] }>(
      `/api/admin/glossary/translations/${entry.translation_id}/revisions`
    )
    history.value = data.revisions
  } catch (e: any) {
    toast.add({ title: 'Could not load the history', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    historyLoading.value = false
  }
}

async function revert(revision: Revision) {
  try {
    await $fetch(`/api/admin/glossary/revisions/${revision.id}/revert`, { method: 'POST' })
    showHistory.value = false
    toast.add({ title: 'Wording restored', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not restore the wording', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function saveNotes() {
  savingNotes.value = true
  try {
    await $fetch(`/api/admin/glossary/languages/${code.value}/notes`, {
      method: 'PATCH',
      body: { notes: notesForm.value }
    })
    toast.add({ title: 'Notes saved', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not save the notes', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingNotes.value = false
  }
}

async function openNoteHistory() {
  showNoteHistory.value = true
  noteHistoryLoading.value = true
  noteHistory.value = []
  try {
    const data = await $fetch<{ revisions: NoteRevision[] }>(
      `/api/admin/glossary/languages/${code.value}/notes/revisions`
    )
    noteHistory.value = data.revisions
  } catch (e: any) {
    toast.add({ title: 'Could not load the history', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    noteHistoryLoading.value = false
  }
}

async function revertNotes(revision: NoteRevision) {
  try {
    await $fetch(`/api/admin/glossary/note-revisions/${revision.id}/revert`, { method: 'POST' })
    showNoteHistory.value = false
    toast.add({ title: 'Notes restored', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not restore the notes', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function saveBible() {
  savingBible.value = true
  try {
    await $fetch(`/api/admin/glossary/languages/${code.value}`, {
      method: 'PATCH',
      body: {
        bible_id: bibleForm.value.bible_id || null,
        bible_translation: bibleForm.value.bible_translation || null,
        bible_translation_note: bibleForm.value.bible_translation_note || null
      }
    })
    toast.add({ title: 'Saved', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingBible.value = false
  }
}

onMounted(load)
</script>

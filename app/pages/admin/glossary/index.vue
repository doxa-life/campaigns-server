<template>
  <div class="max-w-6xl">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold">Glossary</h1>
      <UButton v-if="canManage" icon="i-lucide-languages" @click="() => { showAddLanguage = true }">
        Add Language
      </UButton>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader" class="w-6 h-6 animate-spin" />
      <span class="ml-2">Loading...</span>
    </div>

    <UAlert v-else-if="error" color="error" :title="error" class="mb-6" />

    <UTabs v-else :items="tabs" default-value="languages" class="w-full">
      <template #languages>
        <div class="pt-4">
          <div v-if="languages.length === 0" class="text-center py-8 text-[var(--ui-text-muted)] border border-dashed border-[var(--ui-border)] rounded-lg">
            No languages yet. Add one to start drafting its terminology.
          </div>

          <UTable v-else :data="languages" :columns="languageColumns" @select="openLanguage">
            <template #name-cell="{ row }">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ (row.original as LanguageRow).name_en }}</span>
                <span v-if="(row.original as LanguageRow).name_local" class="text-[var(--ui-text-muted)]">
                  {{ (row.original as LanguageRow).name_local }}
                </span>
                <UBadge color="neutral" variant="outline" size="xs">{{ (row.original as LanguageRow).code }}</UBadge>
              </div>
            </template>

            <template #progress-cell="{ row }">
              <div class="flex items-center gap-2">
                <UProgress
                  :model-value="progressOf(row.original as LanguageRow)"
                  size="sm"
                  class="w-24"
                />
                <span class="text-sm text-[var(--ui-text-muted)]">
                  {{ (row.original as LanguageRow).confirmed_count }} / {{ (row.original as LanguageRow).term_count }}
                </span>
              </div>
            </template>

            <template #flags-cell="{ row }">
              <div class="flex items-center gap-1 flex-wrap">
                <UBadge v-if="(row.original as LanguageRow).flagged_count" color="warning" variant="subtle" size="xs">
                  {{ (row.original as LanguageRow).flagged_count }} flagged
                </UBadge>
                <UBadge v-if="(row.original as LanguageRow).stale_count" color="error" variant="subtle" size="xs">
                  {{ (row.original as LanguageRow).stale_count }} stale
                </UBadge>
                <UBadge v-if="(row.original as LanguageRow).open_pass_count" color="info" variant="subtle" size="xs">
                  {{ (row.original as LanguageRow).open_pass_count }} open review
                </UBadge>
              </div>
            </template>

            <template #registered-cell="{ row }">
              <UBadge
                :color="(row.original as LanguageRow).registered_in_code ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ (row.original as LanguageRow).registered_in_code ? 'Live in app' : 'Glossary only' }}
              </UBadge>
            </template>
          </UTable>

          <p class="text-xs text-[var(--ui-text-muted)] mt-4">
            A language can be worked on here before it exists in the app. “Live in app” means it is also
            registered in <code>config/languages.ts</code>.
          </p>
        </div>
      </template>

      <template #english>
        <GlossaryEnglishEditor :can-manage="canManage" class="pt-4" @changed="loadLanguages" />
      </template>
    </UTabs>

    <UModal v-model:open="showAddLanguage" title="Add Language">
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField label="Language code" required help="Such as fi, ta, or pt-br.">
            <UInput v-model="newLanguage.code" placeholder="fi" class="w-full" />
          </UFormField>
          <UFormField label="English name" required>
            <UInput v-model="newLanguage.name_en" placeholder="Finnish" class="w-full" />
          </UFormField>
          <UFormField label="Name in the language itself">
            <UInput v-model="newLanguage.name_local" placeholder="suomi" class="w-full" />
          </UFormField>
          <UFormField label="Text direction">
            <USelect v-model="newLanguage.text_direction" :items="directionOptions" class="w-full" />
          </UFormField>
          <UCheckbox
            v-model="newLanguage.draft"
            label="Draft every term with AI now"
            help="Proposes a wording for each term and translates the review page. All drafts until a reviewer confirms them."
          />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { showAddLanguage = false }">Cancel</UButton>
          <UButton :loading="adding" @click="addLanguage">Add Language</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface LanguageRow {
  id: string
  code: string
  name_en: string
  name_local: string
  term_count: number
  confirmed_count: number
  flagged_count: number
  stale_count: number
  open_pass_count: number
  registered_in_code: boolean
}

const { canAccess } = useAuthUser()
const toast = useToast()
const router = useRouter()

const canManage = computed(() => canAccess('glossary.manage'))

const tabs = [
  { label: 'Languages', value: 'languages', slot: 'languages' },
  { label: 'English glossary', value: 'english', slot: 'english' }
]

const languageColumns = [
  { accessorKey: 'name', header: 'Language' },
  { accessorKey: 'progress', header: 'Confirmed' },
  { accessorKey: 'flags', header: '' },
  { accessorKey: 'registered', header: 'Status' }
]

const directionOptions = [
  { label: 'Left to right', value: 'ltr' },
  { label: 'Right to left', value: 'rtl' }
]

const languages = ref<LanguageRow[]>([])
const loading = ref(true)
const error = ref('')
const showAddLanguage = ref(false)
const adding = ref(false)
const newLanguage = ref({ code: '', name_en: '', name_local: '', text_direction: 'ltr', draft: true })

function progressOf(language: LanguageRow): number {
  if (!language.term_count) return 0
  return Math.round((language.confirmed_count / language.term_count) * 100)
}

async function loadLanguages() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{ languages: LanguageRow[] }>('/api/admin/glossary/languages')
    languages.value = data.languages
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load glossary languages'
  } finally {
    loading.value = false
  }
}

function openLanguage(_event: Event, row: { original: LanguageRow }) {
  router.push(`/admin/glossary/${row.original.code}`)
}

async function addLanguage() {
  adding.value = true
  try {
    const result = await $fetch<{ drafted: number; draft_error: string | null }>('/api/admin/glossary/languages', {
      method: 'POST',
      body: {
        code: newLanguage.value.code,
        name_en: newLanguage.value.name_en,
        name_local: newLanguage.value.name_local,
        text_direction: newLanguage.value.text_direction,
        draft: newLanguage.value.draft
      }
    })

    if (result.draft_error) {
      toast.add({
        title: 'Language added, drafting failed',
        description: `${result.draft_error} — you can draft it again from the language page.`,
        color: 'warning'
      })
    } else {
      toast.add({
        title: 'Language added',
        description: result.drafted ? `${result.drafted} terms drafted.` : 'No terms drafted.',
        color: 'success'
      })
    }

    showAddLanguage.value = false
    newLanguage.value = { code: '', name_en: '', name_local: '', text_direction: 'ltr', draft: true }
    await loadLanguages()
  } catch (e: any) {
    toast.add({
      title: 'Could not add the language',
      description: e?.data?.statusMessage || 'Please try again.',
      color: 'error'
    })
  } finally {
    adding.value = false
  }
}

onMounted(loadLanguages)
</script>

<template>
  <div class="updates-page min-h-[calc(100vh-200px)] flex justify-center p-4 sm:p-8">
    <div class="max-w-[760px] w-full">
      <!-- Email-verification result banner (?verified=1/0 from the email link) -->
      <UAlert
        v-if="verifiedBanner !== null"
        :color="verifiedBanner ? 'success' : 'error'"
        :icon="verifiedBanner ? 'i-lucide-mail-check' : 'i-lucide-mail-x'"
        :title="verifiedBanner ? $t('updates.verifiedBanner') : $t('updates.verifyFailedBanner')"
        class="mb-4"
      />

      <!-- Success state -->
      <UCard v-if="submitted" class="text-center py-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <UIcon
            :name="submittedNeedsVerification ? 'i-lucide-mail' : 'i-lucide-check-circle'"
            class="text-4xl text-[var(--ui-text)] shrink-0"
          />
          <h1 class="text-2xl font-bold m-0">
            {{ submittedNeedsVerification ? $t('updates.success.verifyTitle') : $t('updates.success.title') }}
          </h1>
        </div>
        <p class="text-[var(--ui-text-muted)] leading-relaxed">
          {{ submittedNeedsVerification
            ? $t('updates.success.verifyMessage', { email: form.reporter_email })
            : $t('updates.success.message') }}
        </p>
        <UButton class="mt-6" variant="outline" @click="resetAll">{{ $t('updates.success.another') }}</UButton>
      </UCard>

      <UCard v-else>
        <template #header>
          <h1 class="text-2xl font-bold mb-1">{{ $t('updates.heading') }}</h1>
          <p class="text-sm text-[var(--ui-text-muted)] m-0">{{ $t('updates.intro') }}</p>
        </template>

        <form class="space-y-6" @submit.prevent="submit">
          <!-- ============ Unified search ============ -->
          <template v-if="!selectionMade">
            <UFormField :label="$t('updates.searchLabel')" :description="$t('updates.searchHint')">
              <UInput
                v-model="searchQuery"
                icon="i-lucide-search"
                :placeholder="$t('updates.searchPlaceholder')"
                :loading="searching"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <div v-if="doxaResults.length > 0 || externalResults.length > 0" class="search-results">
              <template v-if="doxaResults.length > 0">
                <div class="search-section">{{ $t('updates.sectionDoxa') }}</div>
                <button
                  v-for="result in doxaResults"
                  :key="`doxa-${result.id}`"
                  type="button"
                  class="search-result"
                  @click="selectDoxaGroup(result.id)"
                >
                  <span class="flex items-center gap-2">
                    <UBadge label="DOXA" color="primary" variant="subtle" size="sm" />
                    <span class="font-medium">{{ result.name }}</span>
                    <span v-if="result.country_code" class="text-xs text-[var(--ui-text-muted)]">{{ countryName(result.country_code) }}</span>
                  </span>
                  <UBadge v-if="result.status === 'archived'" label="archived" color="neutral" variant="subtle" size="sm" />
                </button>
              </template>
              <template v-if="externalResults.length > 0">
                <div class="search-section">{{ $t('updates.sectionExternal') }}</div>
                <button
                  v-for="(result, idx) in externalResults"
                  :key="`ext-${result.source}-${result.external_id}-${idx}`"
                  type="button"
                  class="search-result"
                  @click="selectExternal(result)"
                >
                  <span class="flex items-center gap-2">
                    <UBadge :label="result.source === 'imb' ? $t('updates.sourceImb') : $t('updates.sourceJp')" variant="subtle" size="sm" />
                    <span class="font-medium">{{ result.name }}</span>
                    <span v-if="result.country" class="text-xs text-[var(--ui-text-muted)]">{{ result.country }}</span>
                  </span>
                  <UBadge v-if="result.in_doxa" :label="$t('updates.alreadyInDoxa')" color="neutral" variant="subtle" size="sm" />
                </button>
              </template>
            </div>
            <p v-else-if="searchQuery.trim().length >= 2 && !searching" class="text-sm text-[var(--ui-text-muted)] m-0">
              {{ $t('updates.searchNoResults') }}
            </p>

            <UButton
              v-if="searchQuery.trim().length >= 2 && !searching"
              variant="link"
              icon="i-lucide-plus"
              :label="$t('updates.addNewCta')"
              class="px-0"
              @click="startManualEntry"
            />
          </template>

          <template v-else>
            <!-- Selection summary -->
            <div class="selected-group">
              <div class="flex items-center gap-2">
                <UBadge v-if="selectedDoxaGroup" label="DOXA" color="primary" variant="subtle" size="sm" />
                <UBadge
                  v-else-if="selectedExternal"
                  :label="selectedExternal.source === 'imb' ? $t('updates.sourceImb') : $t('updates.sourceJp')"
                  variant="subtle"
                  size="sm"
                />
                <UBadge v-else :label="$t('updates.newGroupBadge')" color="primary" variant="subtle" size="sm" />
                <span class="font-medium">{{ selectionName }}</span>
                <span v-if="selectionCountry" class="text-[var(--ui-text-muted)] text-sm">{{ selectionCountry }}</span>
              </div>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :label="$t('updates.changeSelection')" @click="resetSelection" />
            </div>

            <!-- DOXA group: choose what to do -->
            <div v-if="selectedDoxaGroup && !flow">
              <p class="text-sm font-medium mb-2">{{ $t('updates.actionQuestion') }}</p>
              <div class="grid sm:grid-cols-2 gap-2">
                <button type="button" class="flow-option" @click="chooseUpdate">
                  <UIcon name="i-lucide-pencil" class="text-xl shrink-0" />
                  <span class="font-medium">{{ $t('updates.actionUpdate') }}</span>
                  <span class="text-xs text-[var(--ui-text-muted)]">{{ $t('updates.actionUpdateDesc') }}</span>
                </button>
                <button type="button" class="flow-option" @click="chooseRemove">
                  <UIcon name="i-lucide-archive" class="text-xl shrink-0" />
                  <span class="font-medium">{{ $t('updates.actionRemove') }}</span>
                  <span class="text-xs text-[var(--ui-text-muted)]">{{ $t('updates.actionRemoveDesc') }}</span>
                </button>
              </div>
            </div>

            <template v-if="flow">
              <!-- ============ REMOVE: reason ============ -->
              <UFormField v-if="flow === 'remove'" :label="$t('updates.removeReasonLabel')" required>
                <UpdatesSuggestFieldInput v-model="removeReason" field-key="reason_unlisted" />
              </UFormField>

              <!-- ============ UPDATE: engagement first, details collapsed ============ -->
              <template v-if="flow === 'update'">
                <USeparator />

                <UpdatesFieldRow
                  v-model="suggested.engagement_status"
                  field-key="engagement_status"
                  show-current
                  :current-display="formatValue('engagement_status', currentValues.engagement_status)"
                />

                <!-- The three engagement criteria as yes/no questions -->
                <p class="group-title">{{ $t('updates.criteriaTitle') }}</p>
                <UpdatesFieldRow
                  v-for="key in criteriaKeys"
                  :key="key"
                  v-model="suggested[key]"
                  :field-key="key"
                  :label="$t(`updates.criteria.${key}`)"
                  show-current
                  :current-display="formatValue(key, currentValues[key])"
                />

                <p class="group-title">{{ $t('updates.resourcesTitle') }}</p>
                <UpdatesFieldRow
                  v-for="key in resourceKeys"
                  :key="key"
                  v-model="suggested[key]"
                  :field-key="key"
                  show-current
                  :current-display="formatValue(key, currentValues[key])"
                />

                <UCollapsible v-model:open="detailsOpen">
                  <UButton
                    type="button"
                    variant="link"
                    color="neutral"
                    :icon="detailsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    :label="$t('updates.detailsTitle')"
                    class="px-0"
                  />
                  <template #content>
                    <div class="space-y-4 mt-2">
                      <p class="text-sm m-0">{{ $t('updates.updateFieldsHint') }}</p>
                      <UpdatesFieldRow
                        v-for="key in detailKeys"
                        :key="key"
                        v-model="suggested[key]"
                        :field-key="key"
                        show-current
                        :current-display="formatValue(key, currentValues[key])"
                      />
                      <UpdatesFieldRow field-key="image_url" :label="$t('updates.pictureLabel')" show-current>
                        <template #current>
                          <img v-if="currentImageUrl" :src="currentImageUrl" class="current-image" alt="" />
                          <span v-else>—</span>
                        </template>
                        <UFileUpload
                          v-model="pictureFile"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          variant="area"
                          :label="$t('updates.pictureDropLabel')"
                          :description="$t('updates.pictureHint')"
                          class="w-full"
                        />
                      </UpdatesFieldRow>
                    </div>
                  </template>
                </UCollapsible>
              </template>

              <!-- ============ ADD: detail fields + picture ============ -->
              <template v-else-if="flow === 'add' && showFields">
                <USeparator />
                <UpdatesFieldRow
                  v-for="key in addFieldKeys"
                  :key="key"
                  v-model="suggested[key]"
                  :field-key="key"
                  :hint="key === 'primary_religion' && jpReligionLabel ? $t('updates.jpReligionHint', { label: jpReligionLabel }) : undefined"
                />
                <UpdatesFieldRow field-key="image_url" :label="$t('updates.pictureLabel')">
                  <UFileUpload
                    v-model="pictureFile"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    variant="area"
                    :label="$t('updates.pictureDropLabel')"
                    :description="$t('updates.pictureHint')"
                    class="w-full"
                  />
                </UpdatesFieldRow>
              </template>

              <!-- ============ REMOVE: optional corrections ============ -->
              <template v-else-if="flow === 'remove' && showFields">
                <div class="flex items-center gap-3">
                  <USwitch v-model="showRemoveCorrections" />
                  <span class="text-sm">{{ $t('updates.removeFieldsToggle') }}</span>
                </div>

                <template v-if="showRemoveCorrections">
                  <p class="text-sm m-0">{{ $t('updates.removeFieldsHint') }}</p>
                  <UpdatesFieldRow
                    v-for="key in addFieldKeys"
                    :key="key"
                    v-model="suggested[key]"
                    :field-key="key"
                    show-current
                    :current-display="formatValue(key, currentValues[key])"
                  />
                </template>
              </template>

              <!-- ============ Reporter ============ -->
              <USeparator :label="$t('updates.reporter.title')" />
              <div class="grid sm:grid-cols-2 gap-4">
                <UFormField :label="$t('updates.reporter.name')" required>
                  <UInput v-model="form.reporter_name" class="w-full" />
                </UFormField>
                <UFormField :label="$t('updates.reporter.org')">
                  <UInput v-model="form.reporter_org" class="w-full" />
                </UFormField>
              </div>
              <UFormField :label="$t('updates.reporter.email')" required :hint="$t('updates.reporter.emailHint')">
                <UInput v-model="form.reporter_email" type="email" class="w-full" />
              </UFormField>

              <!-- ============ Verifier (optional) ============ -->
              <USeparator :label="$t('updates.verifier.title')" />
              <p class="text-sm text-[var(--ui-text-muted)] m-0">{{ $t('updates.verifier.hint') }}</p>
              <div class="grid sm:grid-cols-2 gap-4">
                <UFormField :label="$t('updates.verifier.name')">
                  <UInput v-model="form.verifier_name" class="w-full" />
                </UFormField>
                <UFormField :label="$t('updates.verifier.entity')">
                  <UInput v-model="form.verifier_entity" class="w-full" />
                </UFormField>
              </div>
              <UFormField :label="$t('updates.verifier.email')">
                <UInput v-model="form.verifier_email" type="email" class="w-full" />
              </UFormField>

              <!-- ============ Comments ============ -->
              <UFormField :label="$t('updates.commentsLabel')" :description="$t('updates.commentsHint')">
                <UTextarea v-model="form.comments" :rows="4" class="w-full" />
              </UFormField>

              <UpdatesTurnstileWidget ref="turnstileRef" v-model="turnstileToken" />

              <UButton type="submit" block size="lg" :loading="submitting" :disabled="submitting">
                {{ submitting ? $t('updates.submitting') : $t('updates.submit') }}
              </UButton>
            </template>
          </template>
        </form>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import countriesLib from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import {
  getField,
  publicEngagementCriteriaKeys,
  publicResourceFieldKeys,
  publicDetailFieldKeys
} from '~/utils/people-group-fields'

countriesLib.registerLocale(countriesEn)

definePageMeta({
  layout: 'default'
})

type Flow = 'update' | 'add' | 'remove'

interface DoxaSearchResult {
  id: number
  name: string
  slug: string | null
  country_code: string | null
  status: string | null
  engagement_status: string | null
}

interface ExternalSearchResult {
  source: 'imb' | 'jp'
  external_id: string
  name: string
  country: string | null
  in_doxa: boolean
  doxa_id: number | null
  prefill: Record<string, any>
  identifiers: Record<string, string | null>
  religion_label?: string | null
  language_label?: string | null
}

const route = useRoute()
const { t } = useI18n()
const toast = useToast()

useHead(() => ({ title: t('updates.pageTitle') }))

// ?verified=1/0 comes from the email verification redirect.
const verifiedBanner = computed<boolean | null>(() => {
  if (route.query.verified === '1') return true
  if (route.query.verified === '0') return false
  return null
})

// Derived from the selection: doxa group → user picks update/remove,
// external or manual → add.
const flow = ref<Flow | null>(null)

// The suggestible field keys shown as inputs (picture handled separately).
// Field groups per flow: update leads with engagement (criteria + resources),
// with the detail fields collapsed; add and remove-corrections use the flat
// detail list plus engagement status. Picture is handled separately.
const criteriaKeys = publicEngagementCriteriaKeys
const resourceKeys = publicResourceFieldKeys
const detailKeys = publicDetailFieldKeys.filter((k) => k !== 'image_url')
const addFieldKeys = [...detailKeys, 'engagement_status']
const detailsOpen = ref(false)

// Shared reporter/verifier/comments state
const form = ref({
  reporter_name: '',
  reporter_org: '',
  reporter_email: '',
  verifier_name: '',
  verifier_entity: '',
  verifier_email: '',
  comments: ''
})

// Unified search over the DOXA list + IMB mirror + Joshua Project
const searchQuery = ref('')
const searching = ref(false)
const doxaResults = ref<DoxaSearchResult[]>([])
const externalResults = ref<ExternalSearchResult[]>([])

// Selection
const selectedDoxaGroup = ref<{ id: number; name: string } | null>(null)
const currentValues = ref<Record<string, any>>({})
const currentImageUrl = ref<string | null>(null)
const selectedExternal = ref<ExternalSearchResult | null>(null)
const manualEntry = ref(false)

// Suggested values + picture
const suggested = ref<Record<string, any>>({})
const pictureFile = ref<File | null>(null)

// Remove flow
const removeReason = ref<string | null>(null)
const showRemoveCorrections = ref(false)

// Submission
const turnstileToken = ref<string | null>(null)
const turnstileRef = ref<{ reset: () => void } | null>(null)
const submitting = ref(false)
const submitted = ref(false)
const submittedNeedsVerification = ref(false)

const selectionMade = computed(() => !!selectedDoxaGroup.value || !!selectedExternal.value || manualEntry.value)

const selectionName = computed(() => {
  if (selectedDoxaGroup.value) return selectedDoxaGroup.value.name
  if (selectedExternal.value) return selectedExternal.value.name
  return String(suggested.value.name || '').trim() || t('updates.newGroupBadge')
})

const selectionCountry = computed(() => {
  if (selectedDoxaGroup.value) {
    const code = currentValues.value.country_code
    return code ? countryName(String(code)) : null
  }
  return selectedExternal.value?.country ?? null
})

const showFields = computed(() => {
  if (flow.value === 'add') return !!selectedExternal.value || manualEntry.value
  return !!selectedDoxaGroup.value
})

const jpReligionLabel = computed(() =>
  flow.value === 'add' && selectedExternal.value?.source === 'jp' ? selectedExternal.value.religion_label || null : null
)

function countryName(code: string): string {
  return countriesLib.getName(code, 'en', { select: 'official' }) || code
}

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return ''
  const field = getField(key)
  if (field?.type === 'boolean') {
    if (value === true || value === 'true' || value === '1') return t('common.yes')
    if (value === false || value === 'false' || value === '0') return t('common.no')
  }
  if (field?.optionsSource === 'countries') return countryName(String(value))
  if (field?.type === 'select' && field.options) {
    const opt = field.options.find((o) => o.value === String(value))
    if (opt) return opt.label || (opt.labelKey ? t(opt.labelKey) : String(value))
  }
  return String(value)
}

// --- Search ---
let searchTimer: ReturnType<typeof setTimeout> | null = null

async function performSearch(q: string) {
  searching.value = true
  try {
    const [doxa, external] = await Promise.all([
      $fetch<{ results: DoxaSearchResult[] }>('/api/updates/search-doxa', { query: { q } }).catch(() => ({ results: [] as DoxaSearchResult[] })),
      $fetch<{ results: ExternalSearchResult[] }>('/api/updates/search-external', { query: { q } }).catch(() => ({ results: [] as ExternalSearchResult[] }))
    ])
    doxaResults.value = doxa.results
    externalResults.value = external.results
  } finally {
    searching.value = false
  }
}

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (q.trim().length < 2) {
    doxaResults.value = []
    externalResults.value = []
    return
  }
  searchTimer = setTimeout(() => performSearch(q.trim()), 300)
})

function clearResults() {
  doxaResults.value = []
  externalResults.value = []
}

// --- Selection ---
async function selectDoxaGroup(id: number) {
  clearResults()
  try {
    const res = await $fetch<{ id: number; name: string; current_values: Record<string, any>; image_url: string | null }>(
      `/api/updates/doxa-group/${id}`
    )
    selectedDoxaGroup.value = { id: res.id, name: res.name }
    currentValues.value = res.current_values
    currentImageUrl.value = res.image_url
    flow.value = null
  } catch {
    toast.add({ title: t('updates.errors.generic'), color: 'error' })
  }
}

function selectExternal(result: ExternalSearchResult) {
  // A group already on the DOXA list routes into the update/remove flow.
  if (result.in_doxa && result.doxa_id) {
    void selectDoxaGroup(result.doxa_id)
    return
  }
  clearResults()
  selectedExternal.value = result
  flow.value = 'add'
  const prefill: Record<string, any> = {}
  for (const key of addFieldKeys) {
    if (result.prefill[key] !== undefined && result.prefill[key] !== null) {
      prefill[key] = result.prefill[key]
    }
  }
  suggested.value = prefill
}

function startManualEntry() {
  clearResults()
  manualEntry.value = true
  flow.value = 'add'
  suggested.value = { name: searchQuery.value.trim() }
}

function chooseUpdate() {
  flow.value = 'update'
}

function chooseRemove() {
  flow.value = 'remove'
}

function resetSelection() {
  selectedDoxaGroup.value = null
  currentValues.value = {}
  currentImageUrl.value = null
  selectedExternal.value = null
  manualEntry.value = false
  flow.value = null
  suggested.value = {}
  pictureFile.value = null
  removeReason.value = null
  showRemoveCorrections.value = false
  detailsOpen.value = false
  if (searchQuery.value.trim().length >= 2) {
    void performSearch(searchQuery.value.trim())
  }
}

function validate(): string | null {
  if (!form.value.reporter_name.trim()) return t('updates.errors.nameRequired')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.reporter_email.trim())) return t('updates.errors.emailRequired')
  if (flow.value !== 'add' && !selectedDoxaGroup.value) return t('updates.errors.groupRequired')
  if (flow.value === 'add' && !String(suggested.value.name || '').trim()) return t('updates.errors.groupNameRequired')
  if (flow.value === 'remove' && !removeReason.value) return t('updates.errors.reasonRequired')
  if (flow.value === 'update') {
    const hasChange = Object.values(suggested.value).some((v) => v !== null && v !== undefined && v !== '')
    if (!hasChange && !pictureFile.value && !form.value.comments.trim()) return t('updates.errors.changesRequired')
  }
  return null
}

async function submit() {
  const error = validate()
  if (error) {
    toast.add({ title: error, color: 'error' })
    return
  }

  submitting.value = true
  try {
    let suggestedImageKey: string | null = null
    if (pictureFile.value) {
      const formData = new FormData()
      formData.append('image', pictureFile.value)
      try {
        const uploaded = await $fetch<{ key: string }>('/api/updates/upload-image', { method: 'POST', body: formData })
        suggestedImageKey = uploaded.key
      } catch {
        toast.add({ title: t('updates.errors.uploadFailed'), color: 'error' })
        return
      }
    }

    const suggestedChanges: Record<string, any> = {}
    for (const [key, value] of Object.entries(suggested.value)) {
      if (value !== null && value !== undefined && value !== '') suggestedChanges[key] = value
    }
    if (flow.value === 'add' && selectedExternal.value) {
      for (const [key, value] of Object.entries(selectedExternal.value.identifiers)) {
        if (value) suggestedChanges[key] = value
      }
    }
    if (flow.value === 'remove') {
      if (!showRemoveCorrections.value) {
        for (const key of Object.keys(suggestedChanges)) delete suggestedChanges[key]
      }
      suggestedChanges.reason_unlisted = removeReason.value
    }

    const res = await $fetch<{ id: number; status: string }>('/api/updates', {
      method: 'POST',
      body: {
        type: flow.value,
        turnstile_token: turnstileToken.value,
        reporter_name: form.value.reporter_name.trim(),
        reporter_org: form.value.reporter_org.trim() || undefined,
        reporter_email: form.value.reporter_email.trim(),
        verifier_name: form.value.verifier_name.trim() || undefined,
        verifier_entity: form.value.verifier_entity.trim() || undefined,
        verifier_email: form.value.verifier_email.trim() || undefined,
        comments: form.value.comments.trim() || undefined,
        people_group_id: flow.value !== 'add' ? selectedDoxaGroup.value?.id : undefined,
        suggested_changes: suggestedChanges,
        suggested_image_key: suggestedImageKey || undefined
      }
    })

    submitted.value = true
    submittedNeedsVerification.value = res.status === 'awaiting_verification'
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || t('updates.errors.generic'),
      color: 'error'
    })
    turnstileRef.value?.reset()
  } finally {
    submitting.value = false
  }
}

function resetAll() {
  submitted.value = false
  submittedNeedsVerification.value = false
  searchQuery.value = ''
  clearResults()
  resetSelection()
  form.value.comments = ''
  turnstileRef.value?.reset()
}
</script>

<style scoped>
/* The theme's muted grey (main.css) is too faint for a public-facing form, so
   this page renders secondary text in the full text color — visual hierarchy
   comes from size and weight instead. Inherits into Nuxt UI children (field
   descriptions, hints). Dimmed stays untouched: input placeholders use it and
   should read as faded. */
.updates-page {
  --ui-text-muted: var(--ui-text);
}

.flow-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  text-align: left;
  cursor: pointer;
  background: transparent;
  transition: border-color 0.15s, background 0.15s;
}
.flow-option:hover {
  border-color: var(--ui-border-accented);
}

.search-results {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  max-height: 340px;
  overflow-y: auto;
}
.search-section {
  padding: 0.375rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-muted);
  background: var(--ui-bg-elevated);
  border-bottom: 1px solid var(--ui-border);
  position: sticky;
  top: 0;
}
.search-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ui-border);
}
.search-result:last-child {
  border-bottom: none;
}
.search-result:hover {
  background: var(--ui-bg-elevated);
}

.selected-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
}

.group-title {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0.5rem 0 0;
}
.current-image {
  max-width: 140px;
  border-radius: var(--ui-radius);
  display: block;
}
</style>

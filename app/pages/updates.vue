<template>
  <div class="min-h-[calc(100vh-200px)] flex justify-center p-4 sm:p-8">
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
          <!-- Flow chooser -->
          <div class="grid sm:grid-cols-3 gap-2">
            <button
              v-for="opt in flowOptions"
              :key="opt.value"
              type="button"
              class="flow-option"
              :class="{ active: flow === opt.value }"
              @click="selectFlow(opt.value)"
            >
              <UIcon :name="opt.icon" class="text-xl shrink-0" />
              <span class="font-medium">{{ opt.label }}</span>
              <span class="text-xs text-[var(--ui-text-muted)]">{{ opt.description }}</span>
            </button>
          </div>

          <template v-if="flow">
            <!-- ============ UPDATE / REMOVE: pick a DOXA group ============ -->
            <UFormField v-if="flow !== 'add'" :label="$t('updates.searchDoxaLabel')" required>
              <div v-if="selectedDoxaGroup" class="selected-group">
                <div>
                  <span class="font-medium">{{ selectedDoxaGroup.name }}</span>
                  <span v-if="selectedDoxaGroup.country_code" class="text-[var(--ui-text-muted)] text-sm ml-2">{{ countryName(selectedDoxaGroup.country_code) }}</span>
                </div>
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :label="$t('updates.changeSelection')" @click="clearDoxaSelection" />
              </div>
              <template v-else>
                <UInput
                  v-model="doxaQuery"
                  icon="i-lucide-search"
                  :placeholder="$t('updates.searchDoxaPlaceholder')"
                  class="w-full"
                />
                <div v-if="doxaResults.length > 0" class="search-results">
                  <button
                    v-for="result in doxaResults"
                    :key="result.id"
                    type="button"
                    class="search-result"
                    @click="selectDoxaGroup(result)"
                  >
                    <span class="font-medium">{{ result.name }}</span>
                    <span v-if="result.country_code" class="text-xs text-[var(--ui-text-muted)]">{{ countryName(result.country_code) }}</span>
                  </button>
                </div>
                <p v-else-if="doxaQuery.length >= 2 && !doxaSearching" class="text-sm text-[var(--ui-text-muted)] mt-2">{{ $t('updates.searchNoResults') }}</p>
              </template>
            </UFormField>

            <!-- ============ ADD: external search or manual entry ============ -->
            <UFormField v-if="flow === 'add'" :label="$t('updates.searchExternalLabel')" :hint="$t('updates.searchExternalHint')">
              <div v-if="selectedExternal" class="selected-group">
                <div class="flex items-center gap-2">
                  <UBadge :label="selectedExternal.source === 'imb' ? $t('updates.sourceImb') : $t('updates.sourceJp')" variant="subtle" size="sm" />
                  <span class="font-medium">{{ selectedExternal.name }}</span>
                  <span v-if="selectedExternal.country" class="text-[var(--ui-text-muted)] text-sm">{{ selectedExternal.country }}</span>
                </div>
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :label="$t('updates.changeSelection')" @click="clearExternalSelection" />
              </div>
              <div v-else-if="manualEntry" class="selected-group">
                <span class="text-sm">{{ $t('updates.manualEntry') }}</span>
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :label="$t('updates.changeSelection')" @click="stopManualEntry" />
              </div>
              <template v-else>
                <UInput
                  v-model="externalQuery"
                  icon="i-lucide-search"
                  :placeholder="$t('updates.searchExternalPlaceholder')"
                  :loading="externalSearching"
                  class="w-full"
                />
                <div v-if="externalResults.length > 0" class="search-results">
                  <button
                    v-for="(result, idx) in externalResults"
                    :key="`${result.source}-${result.external_id}-${idx}`"
                    type="button"
                    class="search-result"
                    :disabled="result.in_doxa"
                    @click="selectExternal(result)"
                  >
                    <span class="flex items-center gap-2">
                      <UBadge :label="result.source === 'imb' ? $t('updates.sourceImb') : $t('updates.sourceJp')" variant="subtle" size="sm" />
                      <span class="font-medium">{{ result.name }}</span>
                      <span v-if="result.country" class="text-xs text-[var(--ui-text-muted)]">{{ result.country }}</span>
                    </span>
                    <UBadge v-if="result.in_doxa" :label="$t('updates.alreadyInDoxa')" color="neutral" variant="subtle" size="sm" />
                  </button>
                </div>
                <p v-else-if="externalQuery.length >= 2 && !externalSearching" class="text-sm text-[var(--ui-text-muted)] mt-2">{{ $t('updates.searchNoResults') }}</p>
                <UButton
                  class="mt-2"
                  size="sm"
                  variant="link"
                  icon="i-lucide-pencil"
                  :label="$t('updates.manualEntry')"
                  @click="startManualEntry"
                />
              </template>
            </UFormField>

            <!-- ============ REMOVE: reason ============ -->
            <UFormField v-if="flow === 'remove' && selectedDoxaGroup" :label="$t('updates.removeReasonLabel')" required>
              <UpdatesSuggestFieldInput v-model="removeReason" field-key="reason_unlisted" />
            </UFormField>

            <!-- ============ Field suggestions ============ -->
            <template v-if="showFields">
              <USeparator v-if="flow !== 'remove'" />
              <div v-if="flow === 'remove'" class="flex items-center gap-3">
                <USwitch v-model="showRemoveCorrections" />
                <span class="text-sm text-[var(--ui-text-muted)]">{{ $t('updates.removeFieldsToggle') }}</span>
              </div>

              <template v-if="flow !== 'remove' || showRemoveCorrections">
                <p v-if="flow === 'update'" class="text-sm text-[var(--ui-text-muted)] m-0">{{ $t('updates.updateFieldsHint') }}</p>
                <p v-else-if="flow === 'remove'" class="text-sm text-[var(--ui-text-muted)] m-0">{{ $t('updates.removeFieldsHint') }}</p>

                <div v-for="key in editableFieldKeys" :key="key" class="field-row">
                  <div class="field-label">{{ fieldLabel(key) }}</div>
                  <div class="field-inputs" :class="{ 'with-current': hasCurrentColumn }">
                    <div v-if="hasCurrentColumn" class="current-value">
                      <span class="value-tag">{{ $t('updates.currentValue') }}</span>
                      <span>{{ formatValue(key, currentValues[key]) || '—' }}</span>
                    </div>
                    <div>
                      <span v-if="hasCurrentColumn" class="value-tag suggested">{{ $t('updates.suggestedValue') }}</span>
                      <UpdatesSuggestFieldInput v-model="suggested[key]" :field-key="key" />
                      <p v-if="key === 'primary_religion' && jpReligionLabel" class="jp-hint">
                        <UIcon name="i-lucide-info" class="shrink-0" />
                        {{ $t('updates.jpReligionHint', { label: jpReligionLabel }) }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Picture -->
                <div class="field-row">
                  <div class="field-label">{{ $t('updates.pictureLabel') }}</div>
                  <div class="field-inputs" :class="{ 'with-current': hasCurrentColumn }">
                    <div v-if="hasCurrentColumn" class="current-value">
                      <span class="value-tag">{{ $t('updates.currentValue') }}</span>
                      <img v-if="currentImageUrl" :src="currentImageUrl" class="current-image" alt="" />
                      <span v-else>—</span>
                    </div>
                    <div>
                      <span v-if="hasCurrentColumn" class="value-tag suggested">{{ $t('updates.suggestedValue') }}</span>
                      <UFileUpload
                        v-model="pictureFile"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        variant="area"
                        :label="$t('updates.pictureDropLabel')"
                        :description="$t('updates.pictureHint')"
                        class="w-full"
                      />
                    </div>
                  </div>
                </div>
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
        </form>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import countriesLib from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import { getField, publicSuggestibleFieldKeys } from '~/utils/people-group-fields'

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

const flow = ref<Flow | null>(null)
const flowOptions = computed(() => [
  { value: 'update' as Flow, icon: 'i-lucide-pencil', label: t('updates.types.update'), description: t('updates.types.updateDesc') },
  { value: 'add' as Flow, icon: 'i-lucide-plus', label: t('updates.types.add'), description: t('updates.types.addDesc') },
  { value: 'remove' as Flow, icon: 'i-lucide-archive', label: t('updates.types.remove'), description: t('updates.types.removeDesc') }
])

// The suggestible field keys shown as inputs (picture handled separately).
const editableFieldKeys = publicSuggestibleFieldKeys.filter((k) => k !== 'image_url')

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

// DOXA group picker (update + remove)
const doxaQuery = ref('')
const doxaResults = ref<DoxaSearchResult[]>([])
const doxaSearching = ref(false)
const selectedDoxaGroup = ref<DoxaSearchResult | null>(null)
const currentValues = ref<Record<string, any>>({})
const currentImageUrl = ref<string | null>(null)

// External picker (add)
const externalQuery = ref('')
const externalResults = ref<ExternalSearchResult[]>([])
const externalSearching = ref(false)
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

const hasCurrentColumn = computed(() => flow.value !== 'add')

const showFields = computed(() => {
  if (flow.value === 'add') return !!selectedExternal.value || manualEntry.value
  return !!selectedDoxaGroup.value
})

const jpReligionLabel = computed(() =>
  flow.value === 'add' && selectedExternal.value?.source === 'jp' ? selectedExternal.value.religion_label || null : null
)

function selectFlow(value: Flow) {
  if (flow.value === value) return
  flow.value = value
  clearDoxaSelection()
  clearExternalSelection()
  manualEntry.value = false
  suggested.value = {}
  pictureFile.value = null
  removeReason.value = null
  showRemoveCorrections.value = false
}

function countryName(code: string): string {
  return countriesLib.getName(code, 'en', { select: 'official' }) || code
}

function fieldLabel(key: string): string {
  const field = getField(key)
  return field ? t(field.labelKey) : key
}

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return ''
  const field = getField(key)
  if (field?.optionsSource === 'countries') return countryName(String(value))
  if (field?.type === 'select' && field.options) {
    const opt = field.options.find((o) => o.value === String(value))
    if (opt) return opt.label || (opt.labelKey ? t(opt.labelKey) : String(value))
  }
  return String(value)
}

// --- DOXA search ---
let doxaTimer: ReturnType<typeof setTimeout> | null = null
watch(doxaQuery, (q) => {
  if (doxaTimer) clearTimeout(doxaTimer)
  if (q.trim().length < 2) {
    doxaResults.value = []
    return
  }
  doxaTimer = setTimeout(async () => {
    doxaSearching.value = true
    try {
      const res = await $fetch<{ results: DoxaSearchResult[] }>('/api/updates/search-doxa', { query: { q } })
      doxaResults.value = res.results
    } catch {
      doxaResults.value = []
    } finally {
      doxaSearching.value = false
    }
  }, 300)
})

async function selectDoxaGroup(result: DoxaSearchResult) {
  selectedDoxaGroup.value = result
  doxaResults.value = []
  doxaQuery.value = ''
  try {
    const res = await $fetch<{ current_values: Record<string, any>; image_url: string | null }>(
      `/api/updates/doxa-group/${result.id}`
    )
    currentValues.value = res.current_values
    currentImageUrl.value = res.image_url
  } catch {
    currentValues.value = {}
    currentImageUrl.value = null
  }
}

function clearDoxaSelection() {
  selectedDoxaGroup.value = null
  currentValues.value = {}
  currentImageUrl.value = null
  doxaQuery.value = ''
  doxaResults.value = []
}

// --- External search ---
let externalTimer: ReturnType<typeof setTimeout> | null = null
watch(externalQuery, (q) => {
  if (externalTimer) clearTimeout(externalTimer)
  if (q.trim().length < 2) {
    externalResults.value = []
    return
  }
  externalTimer = setTimeout(async () => {
    externalSearching.value = true
    try {
      const res = await $fetch<{ results: ExternalSearchResult[] }>('/api/updates/search-external', { query: { q } })
      externalResults.value = res.results
    } catch {
      externalResults.value = []
    } finally {
      externalSearching.value = false
    }
  }, 300)
})

function selectExternal(result: ExternalSearchResult) {
  selectedExternal.value = result
  externalResults.value = []
  externalQuery.value = ''
  const prefill: Record<string, any> = {}
  for (const key of editableFieldKeys) {
    if (result.prefill[key] !== undefined && result.prefill[key] !== null) {
      prefill[key] = result.prefill[key]
    }
  }
  suggested.value = prefill
}

function clearExternalSelection() {
  selectedExternal.value = null
  externalQuery.value = ''
  externalResults.value = []
  suggested.value = {}
}

function startManualEntry() {
  manualEntry.value = true
  selectedExternal.value = null
  suggested.value = {}
}

function stopManualEntry() {
  manualEntry.value = false
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
        for (const key of editableFieldKeys) delete suggestedChanges[key]
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
  flow.value = null
  clearDoxaSelection()
  clearExternalSelection()
  manualEntry.value = false
  suggested.value = {}
  pictureFile.value = null
  removeReason.value = null
  showRemoveCorrections.value = false
  form.value.comments = ''
  turnstileRef.value?.reset()
}
</script>

<style scoped>
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
.flow-option.active {
  border-color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
}

.search-results {
  margin-top: 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  max-height: 280px;
  overflow-y: auto;
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
.search-result:hover:not(:disabled) {
  background: var(--ui-bg-elevated);
}
.search-result:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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

.field-row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.field-label {
  font-size: 0.875rem;
  font-weight: 500;
}
.field-inputs.with-current {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  align-items: start;
}
@media (max-width: 640px) {
  .field-inputs.with-current {
    grid-template-columns: 1fr;
  }
}
.current-value {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  padding: 0.375rem 0;
  overflow-wrap: anywhere;
}
.value-tag {
  display: block;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-dimmed);
  margin-bottom: 0.125rem;
}
.current-image {
  max-width: 140px;
  border-radius: var(--ui-radius);
  display: block;
}
.jp-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  color: var(--ui-info);
}
</style>

<template>
  <CrmLayout
    :loading="loading"
    :error="error"
    v-model:open="slideoverOpen"
  >
    <template #header>
      <div>
        <h1>Churches</h1>
      </div>
      <div class="header-actions">
        <UButton to="/admin/churches/map" variant="outline" icon="i-lucide-map">Map</UButton>
        <UButton variant="outline" icon="i-lucide-upload" @click="openImportModal">Import CSV</UButton>
        <UButton icon="i-lucide-plus" @click="openCreateModal">New Church</UButton>
      </div>
    </template>

    <template #list-header>
      <CrmListPanel
        v-model="searchQuery"
        search-placeholder="Search by church, town or pastor..."
        :total-count="filteredChurches.length"
      />
    </template>

    <template #list>
      <template v-if="filteredChurches.length === 0">
        <div class="empty-list">No churches found</div>
      </template>
      <CrmListItem
        v-else
        v-for="church in filteredChurches"
        :key="church.id"
        :active="selectedChurch?.id === church.id"
        @click="selectChurch(church)"
      >
        <div class="church-name">{{ church.name }}</div>
        <div class="church-info">{{ placeLabel(church) || 'No location entered' }}</div>
        <div class="church-meta">
          <UBadge :label="churchLocationStatusLabel(church.location_status)" :color="churchLocationStatusColor(church.location_status)" variant="subtle" size="xs" />
          <UBadge v-if="church.congregation_size" :label="`${church.congregation_size} people`" variant="subtle" size="xs" />
          <UBadge v-if="church.service_language" :label="church.service_language" variant="subtle" color="neutral" size="xs" />
        </div>
      </CrmListItem>
    </template>

    <template v-if="selectedChurch" #detail-header>
      <h2>{{ selectedChurch.name }}</h2>
    </template>

    <template v-if="selectedChurch" #detail-actions>
      <CrmRecordNav
        :items="filteredChurches"
        :current-id="selectedChurch.id"
        @navigate="selectChurch($event)"
      />
      <CrmSaveStatus :saving="saving" :saved="!!savedField" />
      <UButton size="sm" @click="openDeleteModal" color="error" variant="outline">Delete</UButton>
    </template>

    <template #detail>
      <CrmDetailPanel v-if="selectedChurch" :side-tabs="sideTabs">
        <template #details>
          <form @submit.prevent>
            <CrmFormSection title="Church">
              <UFormField :label="getChurchFieldLabel('name')" required>
                <UInput
                  :model-value="formData.name"
                  @update:model-value="v => { formData.name = String(v) }"
                  @blur="flushAutoSave"
                  type="text"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="getChurchFieldLabel('town')" :description="getChurchField('town')?.description">
                <UInput
                  :model-value="formData.town ?? ''"
                  @update:model-value="v => { formData.town = String(v) }"
                  @blur="flushAutoSave"
                  type="text"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="getChurchFieldLabel('country')">
                <USelectMenu
                  :model-value="formData.country ?? undefined"
                  @update:model-value="v => { formData.country = v ?? null; fieldChanged('country', 'immediate') }"
                  :items="countryOptions"
                  value-key="value"
                  placeholder="Select country..."
                  virtualize
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="getChurchFieldLabel('congregation_size')" :description="getChurchField('congregation_size')?.description">
                <UInput
                  :model-value="formData.congregation_size === null ? '' : String(formData.congregation_size)"
                  @update:model-value="v => { formData.congregation_size = v === '' || v === null ? null : Number(v) }"
                  @blur="flushAutoSave"
                  type="number"
                  min="0"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="getChurchFieldLabel('service_language')">
                <UInputMenu
                  :model-value="formData.service_language ?? undefined"
                  :items="serviceLanguages"
                  :create-item="true"
                  placeholder="Type a language..."
                  class="w-full"
                  @update:model-value="setServiceLanguage"
                  @create="setServiceLanguage"
                />
              </UFormField>
            </CrmFormSection>

            <CrmFormSection title="Pastor">
              <UFormField :label="getChurchFieldLabel('pastor_name')">
                <UInput
                  :model-value="formData.pastor_name ?? ''"
                  @update:model-value="v => { formData.pastor_name = String(v) }"
                  @blur="flushAutoSave"
                  type="text"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="getChurchFieldLabel('pastor_phone')">
                <UInput
                  :model-value="formData.pastor_phone ?? ''"
                  @update:model-value="v => { formData.pastor_phone = String(v) }"
                  @blur="flushAutoSave"
                  type="tel"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="getChurchFieldLabel('pastor_email')">
                <UInput
                  :model-value="formData.pastor_email ?? ''"
                  @update:model-value="v => { formData.pastor_email = String(v) }"
                  @blur="flushAutoSave"
                  type="email"
                  class="w-full"
                />
              </UFormField>
            </CrmFormSection>

            <CrmFormSection title="Location">
              <template #header-extra>
                <UBadge :label="churchLocationStatusLabel(selectedChurch.location_status)" :color="churchLocationStatusColor(selectedChurch.location_status)" variant="subtle" size="xs" />
              </template>

              <p class="location-hint">{{ locationHint }}</p>

              <div v-if="mapboxToken" class="location-map">
                <LazyAdminChurchLocationPicker
                  :key="selectedChurch.id"
                  :latitude="selectedChurch.latitude"
                  :longitude="selectedChurch.longitude"
                  :token="mapboxToken"
                  @change="saveLocation"
                />
              </div>

              <div class="coordinate-row">
                <UFormField :label="getChurchFieldLabel('latitude')">
                  <UInput v-model="latitudeInput" type="text" inputmode="decimal" placeholder="e.g. 23.7104" class="w-full" @blur="saveTypedLocation" />
                </UFormField>
                <UFormField :label="getChurchFieldLabel('longitude')">
                  <UInput v-model="longitudeInput" type="text" inputmode="decimal" placeholder="e.g. 90.4074" class="w-full" @blur="saveTypedLocation" />
                </UFormField>
              </div>

              <div class="location-actions">
                <UButton
                  size="sm"
                  variant="outline"
                  icon="i-lucide-locate"
                  :disabled="!selectedChurch.town || !selectedChurch.country || selectedChurch.location_status === 'pending'"
                  :loading="geocoding"
                  @click="lookUpLocation"
                >
                  Look up from town
                </UButton>
                <UButton
                  v-if="hasChurchCoordinates(selectedChurch)"
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-map-pin-off"
                  @click="clearLocation"
                >
                  Remove pin
                </UButton>
              </div>
            </CrmFormSection>

            <CrmFormSection title="Metadata">
              <div class="info-row">
                <span class="label">Church ID:</span>
                <span class="value monospace">{{ selectedChurch.id }}</span>
              </div>
              <div class="info-row">
                <span class="label">Created:</span>
                <span class="value">{{ formatDateTime(selectedChurch.created_at) }}</span>
              </div>
            </CrmFormSection>
          </form>
        </template>

        <template #side-comments>
          <RecordComments record-type="church" :record-id="selectedChurch.id" @update:count="commentCount = $event" />
        </template>

        <template #side-activity>
          <RecordActivity v-if="selectedChurch" ref="activityRef" table-name="churches" :record-id="selectedChurch.id" />
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <!-- Create Church Modal -->
  <UModal v-model:open="showCreateModal" title="New Church">
    <template #body>
      <form @submit.prevent="createChurch" class="flex flex-col gap-3">
        <UFormField label="Church name" required>
          <UInput v-model="createForm.name" type="text" class="w-full" />
        </UFormField>
        <UFormField label="Village / town">
          <UInput v-model="createForm.town" type="text" class="w-full" />
        </UFormField>
        <UFormField label="Country">
          <USelectMenu
            v-model="createForm.country"
            :items="countryOptions"
            value-key="value"
            placeholder="Select country..."
            virtualize
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="closeCreateModal">Cancel</UButton>
          <UButton type="submit" :loading="creating">Create</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Church"
    :message="selectedChurch ? `Are you sure you want to delete &quot;${selectedChurch.name}&quot;?` : ''"
    warning="This will remove the church and its comments. This action cannot be undone."
    confirm-text="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="confirmDelete"
    @cancel="showDeleteModal = false"
  />

  <AdminChurchImportModal
    v-model:open="showImportModal"
    @imported="onImported"
  />
</template>

<script setup lang="ts">
import {
  churchLocationStatusColor,
  churchLocationStatusLabel,
  getChurchField,
  getChurchFieldLabel,
  hasChurchCoordinates,
  type ChurchRecord
} from '#shared/churches'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const LAST_COUNTRY_KEY = 'admin-churches-last-country'
const PENDING_POLL_MS = 4000
const PENDING_POLL_LIMIT = 30

const route = useRoute()
const toast = useToast()
const { countryOptions, getCountryName } = useLocalizedOptions()
const mapboxToken = useRuntimeConfig().public.mapboxToken as string

const churches = ref<ChurchRecord[]>([])
const selectedChurch = ref<ChurchRecord | null>(null)
const serviceLanguages = ref<string[]>([])

const loading = ref(true)
const error = ref('')
const creating = ref(false)
const deleting = ref(false)
const geocoding = ref(false)

const searchQuery = ref('')
const slideoverOpen = ref(false)
const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const showImportModal = ref(false)
const createForm = ref({ name: '', town: '', country: undefined as string | undefined })
const lastCountry = ref<string | null>(null)

const latitudeInput = ref('')
const longitudeInput = ref('')

const activityRef = ref<{ refresh: () => void } | null>(null)
const commentCount = ref(0)
const sideTabs = computed(() => [
  { label: 'Activity', slot: 'activity', icon: 'i-lucide-activity' },
  { label: 'Comments', slot: 'comments', icon: 'i-lucide-message-square', badge: commentCount.value || undefined }
])

const { formData, saving, savedField, fieldChanged, reset: resetAutoSave, flush: flushAutoSave } = useAutoSave(
  {
    name: '',
    town: null as string | null,
    country: null as string | null,
    pastor_name: null as string | null,
    pastor_phone: null as string | null,
    pastor_email: null as string | null,
    congregation_size: null as number | null,
    service_language: null as string | null
  },
  {
    saveFn: async (data) => {
      const targetId = selectedChurch.value!.id
      const res = await $fetch<{ church: ChurchRecord }>(`/api/admin/churches/${targetId}`, {
        method: 'PUT',
        body: data
      })
      applyChurch(res.church)
    },
    onSaved: () => {
      activityRef.value?.refresh()
      loadServiceLanguages()
    },
    onError: (err) => {
      toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to save', color: 'error' })
    }
  }
)

watch(slideoverOpen, (open) => {
  if (!open) {
    flushAutoSave()
    deselectChurch()
  }
})

const filteredChurches = computed(() => {
  if (!searchQuery.value) return churches.value
  const q = searchQuery.value.toLowerCase()
  return churches.value.filter(c =>
    c.name.toLowerCase().includes(q)
    || (c.town ?? '').toLowerCase().includes(q)
    || (c.pastor_name ?? '').toLowerCase().includes(q)
  )
})

const locationHint = computed(() => {
  const church = selectedChurch.value
  if (!church) return ''
  const place = placeLabel(church)
  switch (church.location_status) {
    case 'pending': return `Looking up ${place}. This usually takes under a minute.`
    case 'geocoded': return 'Found from the town and country. Drag the pin if it landed in the wrong place.'
    case 'manual': return 'Pin placed by hand.'
    case 'not_found': return `${place || 'The town'} was not found. Check the spelling, or place the pin by hand.`
    default: return 'Add a town and country to look the location up, or click the map to place the pin.'
  }
})

function placeLabel(church: ChurchRecord): string {
  return [church.town, church.country ? getCountryName(church.country) : null].filter(Boolean).join(', ')
}

function applyChurch(church: ChurchRecord) {
  churches.value = churches.value.map(c => c.id === church.id ? church : c)
  if (selectedChurch.value?.id === church.id) {
    selectedChurch.value = church
    syncCoordinateInputs(church)
  }
}

function syncCoordinateInputs(church: ChurchRecord) {
  latitudeInput.value = church.latitude === null ? '' : String(church.latitude)
  longitudeInput.value = church.longitude === null ? '' : String(church.longitude)
}

async function loadData() {
  try {
    loading.value = true
    error.value = ''
    const res = await $fetch<{ churches: ChurchRecord[] }>('/api/admin/churches')
    churches.value = res.churches
  } catch {
    error.value = 'Failed to load churches'
  } finally {
    loading.value = false
  }
}

async function loadServiceLanguages() {
  try {
    const res = await $fetch<{ languages: string[] }>('/api/admin/churches/service-languages')
    serviceLanguages.value = res.languages
  } catch {
    serviceLanguages.value = []
  }
}

async function refreshChurch() {
  if (!selectedChurch.value) return
  try {
    const res = await $fetch<{ church: ChurchRecord }>(`/api/admin/churches/${selectedChurch.value.id}`)
    applyChurch(res.church)
  } catch {
    // The list keeps the last known copy.
  }
}

function selectChurch(church: ChurchRecord, updateUrl = true) {
  if (updateUrl && selectedChurch.value?.id === church.id && slideoverOpen.value) {
    slideoverOpen.value = false
    return
  }

  flushAutoSave()
  selectedChurch.value = church
  slideoverOpen.value = true
  syncCoordinateInputs(church)
  resetAutoSave({
    name: church.name,
    town: church.town,
    country: church.country,
    pastor_name: church.pastor_name,
    pastor_phone: church.pastor_phone,
    pastor_email: church.pastor_email,
    congregation_size: church.congregation_size,
    service_language: church.service_language
  })
  if (updateUrl && import.meta.client) {
    window.history.replaceState({}, '', `/admin/churches/${church.id}`)
  }
}

function deselectChurch() {
  selectedChurch.value = null
  if (import.meta.client) {
    window.history.replaceState({}, '', '/admin/churches')
  }
}

function setServiceLanguage(value: unknown) {
  const language = value == null ? null : String(value).trim() || null
  formData.value.service_language = language
  if (language && !serviceLanguages.value.includes(language)) {
    serviceLanguages.value = [...serviceLanguages.value, language].sort()
  }
  fieldChanged('service_language', 'immediate')
}

// Location edits bypass the autosave form: sending coordinates marks the pin as
// placed by hand, so they only go over the wire when someone actually moved it.
async function saveLocation(coords: { latitude: number | null; longitude: number | null }) {
  if (!selectedChurch.value) return
  try {
    const res = await $fetch<{ church: ChurchRecord }>(`/api/admin/churches/${selectedChurch.value.id}`, {
      method: 'PUT',
      body: coords
    })
    applyChurch(res.church)
    activityRef.value?.refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to save the location', color: 'error' })
    syncCoordinateInputs(selectedChurch.value)
  }
}

function saveTypedLocation() {
  const church = selectedChurch.value
  if (!church) return
  const lat = latitudeInput.value.trim()
  const lng = longitudeInput.value.trim()
  if (lat === '' && lng === '') {
    if (hasChurchCoordinates(church)) clearLocation()
    return
  }
  if (lat === '' || lng === '') return
  const latitude = Number(lat)
  const longitude = Number(lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
  if (latitude === church.latitude && longitude === church.longitude) return
  saveLocation({ latitude, longitude })
}

function clearLocation() {
  saveLocation({ latitude: null, longitude: null })
}

async function lookUpLocation() {
  if (!selectedChurch.value) return
  try {
    geocoding.value = true
    const res = await $fetch<{ church: ChurchRecord }>(`/api/admin/churches/${selectedChurch.value.id}/geocode`, { method: 'POST' })
    applyChurch(res.church)
    activityRef.value?.refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to queue the lookup', color: 'error' })
  } finally {
    geocoding.value = false
  }
}

// While a lookup is pending, poll so the pin appears without a reload.
let pendingPoll: ReturnType<typeof setInterval> | null = null
let pendingPolls = 0

function stopPendingPoll() {
  if (pendingPoll) clearInterval(pendingPoll)
  pendingPoll = null
  pendingPolls = 0
}

watch(() => [selectedChurch.value?.id, selectedChurch.value?.location_status], ([id, status]) => {
  stopPendingPoll()
  if (!id || status !== 'pending') return
  pendingPoll = setInterval(() => {
    pendingPolls++
    if (pendingPolls > PENDING_POLL_LIMIT) {
      stopPendingPoll()
      return
    }
    refreshChurch()
  }, PENDING_POLL_MS)
})

onBeforeUnmount(stopPendingPoll)

function rememberCountry(country: string | null | undefined) {
  if (!country) return
  lastCountry.value = country
  try {
    localStorage.setItem(LAST_COUNTRY_KEY, country)
  } catch {
    // Storage may be unavailable; the default is a convenience only.
  }
}

function openCreateModal() {
  createForm.value = { name: '', town: '', country: lastCountry.value ?? undefined }
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
}

function openImportModal() {
  showImportModal.value = true
}

async function createChurch() {
  if (!createForm.value.name.trim()) return
  try {
    creating.value = true
    const res = await $fetch<{ church: ChurchRecord }>('/api/admin/churches', {
      method: 'POST',
      body: {
        name: createForm.value.name,
        town: createForm.value.town,
        country: createForm.value.country ?? null
      }
    })
    rememberCountry(res.church.country)
    await loadData()
    showCreateModal.value = false
    const created = churches.value.find(c => c.id === res.church.id)
    if (created) selectChurch(created)
    toast.add({ title: 'Church created', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to create', color: 'error' })
  } finally {
    creating.value = false
  }
}

function openDeleteModal() {
  if (selectedChurch.value) showDeleteModal.value = true
}

async function confirmDelete() {
  if (!selectedChurch.value) return
  try {
    deleting.value = true
    await $fetch(`/api/admin/churches/${selectedChurch.value.id}`, { method: 'DELETE' })
    churches.value = churches.value.filter(c => c.id !== selectedChurch.value!.id)
    slideoverOpen.value = false
    showDeleteModal.value = false
    toast.add({ title: 'Church deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to delete', color: 'error' })
  } finally {
    deleting.value = false
  }
}

async function onImported(country: string | null) {
  rememberCountry(country)
  await Promise.all([loadData(), loadServiceLanguages()])
}

onMounted(async () => {
  try {
    lastCountry.value = localStorage.getItem(LAST_COUNTRY_KEY)
  } catch {
    lastCountry.value = null
  }

  await Promise.all([loadData(), loadServiceLanguages()])

  const id = Number(route.params.id)
  if (id) {
    const church = churches.value.find(c => c.id === id)
    if (church) selectChurch(church, false)
  }
})
</script>

<style scoped>
.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.empty-list {
  padding: 1rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.church-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.church-info {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 0.25rem;
}

.church-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.75rem;
}

.location-hint {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 0.75rem;
}

.location-map {
  height: 260px;
  margin-bottom: 0.75rem;
}

.coordinate-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.location-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ui-border);
  font-size: 0.875rem;
}

.info-row .label { font-weight: 500; }
.info-row .value { color: var(--ui-text-muted); }
.monospace { font-family: monospace; }
</style>

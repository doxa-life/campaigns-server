<template>
  <CrmLayout
    :loading="loading"
    :error="error"
    v-model:open="slideoverOpen"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h1>People Groups</h1>
        <UDropdownMenu :items="menuItems">
          <UButton icon="i-lucide-ellipsis-vertical" variant="ghost" color="neutral" />
        </UDropdownMenu>
      </div>
    </template>

    <template #list-header>
      <CrmListPanel
        v-model="searchQuery"
        search-placeholder="Search by name..."
        :total-count="filteredPeopleGroups.length"
      >
        <template #filters>
          <div class="filter-row">
            <USelectMenu
              v-model="filterEngagement"
              :items="engagementOptions"
              value-key="value"
              placeholder="All Engagement"
              class="filter-select"
            />
            <USelectMenu
              v-model="filterAdopted"
              :items="adoptedOptions"
              value-key="value"
              placeholder="All Adoption"
              class="filter-select"
            />
            <USelectMenu
              v-model="filterPrayerCommitment"
              :items="prayerCommitmentOptions"
              value-key="value"
              placeholder="All Prayer"
              class="filter-select"
            />
          </div>
        </template>
      </CrmListPanel>
    </template>

    <template #list>
      <template v-if="filteredPeopleGroups.length === 0">
        <div class="empty-list">No people groups found</div>
      </template>
      <CrmListItem
        v-else
        v-for="group in filteredPeopleGroups"
        :key="group.id"
        :active="selectedGroup?.id === group.id"
        @click="selectGroup(group)"
      >
        <template v-if="group.image_url" #image>
          <img :src="group.image_url" :alt="group.name" />
        </template>
        <div class="group-name">{{ group.name }}</div>
        <div class="group-meta">
          <UBadge
            v-if="group.adoption_count > 0"
            label="Adopted"
            color="success"
            variant="subtle"
            size="xs"
          />
          <UBadge
            v-if="group.engagement_status"
            :label="group.engagement_status"
            :color="group.engagement_status === 'engaged' ? 'success' : 'warning'"
            variant="subtle"
            size="xs"
          />
          <span v-if="group.population" class="population">
            Pop: {{ formatNumber(group.population) }}
          </span>
        </div>
        <div class="group-stats">
          <span>{{ group.people_committed }} committed</span>
          <span>{{ formatDuration(group.committed_duration) }} pledged</span>
          <span>{{ group.people_praying }} praying</span>
          <span>{{ formatDuration(Math.round(group.daily_prayer_duration / 60)) }} daily</span>
        </div>
      </CrmListItem>
    </template>

    <template v-if="selectedGroup" #detail-header>
      <div class="header-info">
        <img
          v-if="selectedGroup.image_url"
          :src="selectedGroup.image_url"
          :alt="selectedGroup.name"
          class="header-image"
        />
        <h2>{{ selectedGroup.name }}</h2>
      </div>
    </template>

    <template v-if="selectedGroup" #detail-actions>
      <CrmSaveStatus :saving="saving" :saved="!!savedField" />
    </template>

    <template #detail>
      <CrmDetailPanel v-if="selectedGroup" :detail-tabs="detailTabs" :side-tabs="sideTabs">
        <template #top>
          <UButton size="xs" @click="navigateToSubscribers(selectedGroup.id)" variant="outline">
            Subscribers
          </UButton>
          <UButton size="xs" :to="`/admin/people-groups/${selectedGroup.id}/content`" variant="outline">
            Content
          </UButton>
          <UButton size="xs" v-if="selectedGroup.slug" :to="`/${selectedGroup.slug}`" target="_blank" variant="outline">
            Sign Up Page
          </UButton>
          <UButton size="xs" v-if="selectedGroup.slug" :href="`https://doxa.life/research/${selectedGroup.slug}/`" target="_blank" variant="outline">
            Full Profile
          </UButton>
        </template>

        <template #detail-progress>
          <CrmFormSection title="Adopted By">
            <template #header-extra>
              <UButton size="xs" variant="outline" icon="i-lucide-plus" @click="openAddAdoptionModal">
                Add
              </UButton>
            </template>

            <div v-if="adoptions.length === 0" class="p-4 text-center text-muted text-sm">
              Not adopted by any groups
            </div>
            <div v-else class="adoptions-list">
              <AdoptionCard
                v-for="adoption in adoptions"
                :key="adoption.id"
                :adoption="adoption"
                :label="adoption.group_name"
                @open="openAdoptionSlideover(adoption)"
              />
            </div>
          </CrmFormSection>

          <form @submit.prevent>
            <CrmFormSection
              v-for="category in progressCategories"
              :key="category.key"
              :title="category.label"
            >
              <div class="fields-grid">
                <UFormField
                  v-for="field in category.fields"
                  v-show="shouldShowField(field)"
                  :key="field.key"
                  :label="field.label"
                  :hint="field.description"
                  :class="{ 'full-width': field.type === 'textarea' || field.type === 'translatable' || field.type === 'picture-credit' }"
                >
                  <div v-if="field.readOnly" class="readonly-field">
                    {{ getFieldValue(field.key) || '—' }}
                  </div>

                  <UInput
                    v-else-if="field.type === 'text'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                    @blur="flushAutoSave"
                    class="w-full"
                  />

                  <UInput
                    v-else-if="field.type === 'number'"
                    type="number"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                    @blur="flushAutoSave"
                    class="w-full"
                  />

                  <USelectMenu
                    v-else-if="field.type === 'select' && field.options"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                    :items="field.options"
                    value-key="value"
                    :search-input="{ placeholder: 'Search...' }"
                    :virtualize="field.options.length > 50"
                    class="w-full"
                  />

                  <USwitch
                    v-else-if="field.type === 'boolean'"
                    :model-value="getFieldValue(field.key) === true || getFieldValue(field.key) === '1'"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                  />
                </UFormField>
              </div>
            </CrmFormSection>
          </form>
        </template>

        <template #detail-details>
          <form @submit.prevent>
            <CrmFormSection
              v-for="category in detailCategories"
              :key="category.key"
              :title="category.label"
            >
              <div class="fields-grid">
                <UFormField
                  v-for="field in category.fields"
                  v-show="shouldShowField(field)"
                  :key="field.key"
                  :label="field.label"
                  :hint="field.description"
                  :class="{ 'full-width': field.type === 'textarea' || field.type === 'translatable' || field.type === 'picture-credit' }"
                >
                  <div v-if="field.readOnly" class="readonly-field">
                    {{ getFieldValue(field.key) || '—' }}
                  </div>

                  <UInput
                    v-else-if="field.type === 'text'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                    @blur="flushAutoSave"
                    class="w-full"
                  />

                  <UInput
                    v-else-if="field.type === 'number'"
                    type="number"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                    @blur="flushAutoSave"
                    class="w-full"
                  />

                  <UTextarea
                    v-else-if="field.type === 'textarea'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                    @blur="flushAutoSave"
                    :rows="3"
                    class="w-full"
                  />

                  <USelectMenu
                    v-else-if="field.type === 'select' && field.options"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                    :items="field.options"
                    value-key="value"
                    :search-input="{ placeholder: 'Search...' }"
                    :virtualize="field.options.length > 50"
                    class="w-full"
                  />

                  <TranslatableField
                    v-else-if="field.type === 'translatable'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event, 'text')"
                    @save="flushAutoSave"
                    :rows="3"
                  />

                  <div
                    v-else-if="field.type === 'picture-credit'"
                    @focusout="flushAutoSave"
                  >
                    <PictureCreditEditor
                      :model-value="getFieldValue(field.key)"
                      @update:model-value="setFieldValue(field.key, $event, field.type)"
                    />
                  </div>

                  <USwitch
                    v-else-if="field.type === 'boolean'"
                    :model-value="getFieldValue(field.key) === true || getFieldValue(field.key) === '1'"
                    @update:model-value="setFieldValue(field.key, $event, field.type)"
                  />
                </UFormField>
              </div>
            </CrmFormSection>
          </form>
        </template>

        <template #side-comments>
          <RecordComments v-if="selectedGroup" record-type="people_group" :record-id="selectedGroup.id" @update:count="commentCount = $event" />
        </template>

        <template #side-activity>
          <RecordActivity v-if="selectedGroup" ref="activityRef" table-name="people_groups" :record-id="selectedGroup.id" />
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <!-- Add Adoption Modal -->
  <UModal v-model:open="showAddAdoptionModal" title="Adopt by Group">
    <template #body>
      <form @submit.prevent="addAdoption" class="flex flex-col gap-3">
        <UFormField label="Group">
          <USelectMenu
            v-model="addAdoptionGroupId"
            :items="availableGroupOptions"
            value-key="value"
            placeholder="Select a group..."
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="showAddAdoptionModal = false">Cancel</UButton>
          <UButton type="submit" :disabled="!addAdoptionGroupId">Add</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <AdoptionSlideover
    v-model:open="showAdoptionSlideover"
    :adoption="selectedAdoption"
    @change="selectGroup(selectedGroup!, false)"
    @delete="removeAdoption"
  />
</template>

<script setup lang="ts">
import { allFields, fieldsByCategory, categories, tableColumnFields, type FieldDefinition } from '~/utils/people-group-fields'
import type { Adoption } from '~/types/adoption'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface PeopleGroup {
  id: number
  joshua_project_id: string | null
  name: string
  slug: string | null
  image_url: string | null
  descriptions: Record<string, string> | null
  metadata: Record<string, any>
  country_code: string | null
  region: string | null
  latitude: number | null
  longitude: number | null
  population: number | null
  evangelical_pct: number | null
  engagement_status: string | null
  primary_religion: string | null
  primary_language: string | null
  people_committed: number
  committed_duration: number
  adoption_count: number
  people_praying: number
  daily_prayer_duration: number
  created_at: string
  updated_at: string
}

const route = useRoute()
const toast = useToast()

const menuItems = [[
  {
    label: 'Export CSV',
    icon: 'i-lucide-download',
    onSelect() {
      window.open('/api/admin/people-groups/export-csv', '_blank')
    }
  }
]]

interface GroupOption {
  id: number
  name: string
}

// Data
const peopleGroups = ref<PeopleGroup[]>([])
const selectedGroup = ref<PeopleGroup | null>(null)
const adoptions = ref<Adoption[]>([])
const allGroups = ref<GroupOption[]>([])


// Auto-save form state
const { formData, saving, savedField, fieldChanged, reset: resetAutoSave, flush: flushAutoSave } = useAutoSave(
  {} as Record<string, any>,
  {
    saveFn: async (data) => {
      if (!selectedGroup.value) return
      const targetId = selectedGroup.value.id
      const columnData: Record<string, any> = {}
      const metadataData: Record<string, any> = {}
      for (const [key, value] of Object.entries(data)) {
        if (columnKeys.has(key)) {
          columnData[key] = value
        } else {
          metadataData[key] = value
        }
      }
      const response = await $fetch<{ success: boolean; peopleGroup: PeopleGroup }>(
        `/api/admin/people-groups/${targetId}`,
        {
          method: 'PUT',
          body: { ...columnData, metadata: metadataData }
        }
      )
      const index = peopleGroups.value.findIndex(g => g.id === response.peopleGroup.id)
      if (index !== -1) {
        peopleGroups.value[index] = response.peopleGroup
      }
      if (selectedGroup.value?.id === targetId) {
        selectedGroup.value = response.peopleGroup
      }
      return buildFormData(response.peopleGroup)
    },
    onSaved: () => {
      activityRef.value?.refresh()
    },
    onError: (err) => {
      toast.add({
        title: 'Error',
        description: err.data?.statusMessage || 'Failed to save changes',
        color: 'error'
      })
    }
  }
)

// Adoption modal state
const showAddAdoptionModal = ref(false)
const addAdoptionGroupId = ref<number | undefined>(undefined)

// Adoption slideover state
const showAdoptionSlideover = ref(false)
const selectedAdoption = ref<Adoption | null>(null)

// Slideover state
const slideoverOpen = ref(false)

const activityRef = ref<{ refresh: () => void } | null>(null)

const commentCount = ref(0)
const detailTabs = [
  { label: 'Progress', slot: 'progress', icon: 'i-lucide-bar-chart-3' },
  { label: 'Details', slot: 'details', icon: 'i-lucide-file-text' }
]
const sideTabs = computed(() => [
  { label: 'Activity', slot: 'activity', icon: 'i-lucide-activity' },
  { label: 'Comments', slot: 'comments', icon: 'i-lucide-message-square', badge: commentCount.value || undefined }
])

watch(slideoverOpen, (open) => {
  if (!open) {
    flushAutoSave()
    deselectGroup()
  }
})

const availableGroupOptions = computed(() => {
  const adoptedGroupIds = new Set(adoptions.value.map(a => a.group_id))
  return allGroups.value
    .filter(g => !adoptedGroupIds.has(g.id))
    .map(g => ({ label: g.name, value: g.id }))
})

// UI state
const loading = ref(true)
const error = ref('')
const searchQuery = ref('')

// Filters
const filterEngagement = ref<string | null>(null)
const filterAdopted = ref<string | null>(null)
const filterPrayerCommitment = ref<string | null>(null)

const engagementOptions = [
  { label: 'All Engagement', value: null },
  { label: 'Engaged', value: 'engaged' },
  { label: 'Unengaged', value: 'unengaged' }
]

const adoptedOptions = [
  { label: 'All Adoption', value: null },
  { label: 'Adopted', value: 'adopted' },
  { label: 'Not Adopted', value: 'not_adopted' }
]

const prayerCommitmentOptions = [
  { label: 'All Prayer', value: null },
  { label: 'With Commitments', value: 'with' },
  { label: 'Without Commitments', value: 'without' }
]

const filteredPeopleGroups = computed(() => {
  let filtered = peopleGroups.value

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(g => g.name.toLowerCase().includes(q))
  }

  if (filterEngagement.value) {
    filtered = filtered.filter(g => g.engagement_status === filterEngagement.value)
  }

  if (filterAdopted.value) {
    filtered = filtered.filter(g =>
      filterAdopted.value === 'adopted' ? g.adoption_count > 0 : g.adoption_count === 0
    )
  }

  if (filterPrayerCommitment.value) {
    filtered = filtered.filter(g =>
      filterPrayerCommitment.value === 'with' ? g.people_committed > 0 : g.people_committed === 0
    )
  }

  return filtered
})

// i18n and localized options
const { t } = useI18n()
const { countryOptions } = useLocalizedOptions()

// Categories shown on the Progress tab
const progressCategoryKeys = new Set(['status', 'engagement', 'workers', 'resources'])

function mapCategory(category: { key: string; labelKey: string }) {
  return {
    key: category.key,
    label: t(category.labelKey),
    fields: (fieldsByCategory[category.key] || []).map(field => ({
      ...field,
      label: t(field.labelKey),
      options: getOptionsForField(field)
    }))
  }
}

// Progress tab: engagement, strategic, resources
const progressCategories = computed(() => {
  return categories
    .filter(c => progressCategoryKeys.has(c.key))
    .map(mapCategory)
    .filter(c => c.fields.length > 0)
})

// Details tab: everything else
const detailCategories = computed(() => {
  return categories
    .filter(c => !progressCategoryKeys.has(c.key))
    .map(mapCategory)
    .filter(c => c.fields.length > 0)
})

// Get options for a field, handling dynamic sources
function getOptionsForField(field: FieldDefinition): { value: string; label: string }[] | undefined {
  if (field.optionsSource === 'countries') {
    return countryOptions.value
  }
  if (field.options) {
    return field.options.map(opt => ({
      value: opt.value,
      label: opt.label || (opt.labelKey ? t(opt.labelKey) : opt.value)
    }))
  }
  return undefined
}

function shouldShowField(field: { showIf?: { field: string; value: string } }): boolean {
  if (!field.showIf) return true
  return getFieldValue(field.showIf.field) === field.showIf.value
}

// Load people groups
async function loadPeopleGroups(isInitialLoad = false) {
  try {
    if (isInitialLoad) {
      loading.value = true
    }
    error.value = ''

    const [response, groupsRes] = await Promise.all([
      $fetch<{ peopleGroups: PeopleGroup[]; total: number }>(
        '/api/admin/people-groups'
      ),
      allGroups.value.length === 0
        ? $fetch<{ groups: GroupOption[] }>('/api/admin/groups')
        : Promise.resolve(null)
    ])

    peopleGroups.value = response.peopleGroups
    if (groupsRes) allGroups.value = groupsRes.groups
  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to load people groups'
    console.error(err)
  } finally {
    loading.value = false
  }
}

// Select a people group
async function selectGroup(group: PeopleGroup, updateUrl = true) {
  if (updateUrl && selectedGroup.value?.id === group.id && slideoverOpen.value) {
    slideoverOpen.value = false
    return
  }

  flushAutoSave()
  selectedGroup.value = group
  slideoverOpen.value = true
  resetAutoSave(buildFormData(group))
  if (updateUrl && import.meta.client) {
    window.history.replaceState({}, '', `/admin/people-groups/${group.id}`)
  }

  try {
    const res = await $fetch<{ adoptions: Adoption[] }>(`/api/admin/people-groups/${group.id}`)
    adoptions.value = res.adoptions
  } catch {
    adoptions.value = []
  }
}

function deselectGroup() {
  selectedGroup.value = null
  if (import.meta.client) {
    window.history.replaceState({}, '', '/admin/people-groups')
  }
}

const columnKeys = new Set(tableColumnFields.map(f => f.key))

function buildFormData(group: PeopleGroup): Record<string, any> {
  const columnValues: Record<string, any> = {}
  for (const key of columnKeys) {
    columnValues[key] = (group as any)[key]
  }
  return { ...columnValues, ...group.metadata }
}

function getFieldValue(key: string): any {
  const value = formData.value[key]
  if (key === 'descriptions') {
    return value || {}
  }
  return value ?? ''
}

function setFieldValue(key: string, value: any, fieldType?: string) {
  formData.value[key] = value
  const strategy = ['text', 'number', 'textarea', 'translatable', 'picture-credit'].includes(fieldType || '')
    ? 'text' as const
    : 'immediate' as const
  fieldChanged(key, strategy)
}

function openAdoptionSlideover(adoption: Adoption) {
  selectedAdoption.value = adoption
  showAdoptionSlideover.value = true
}

function openAddAdoptionModal() {
  addAdoptionGroupId.value = undefined
  showAddAdoptionModal.value = true
}

async function addAdoption() {
  if (!selectedGroup.value || !addAdoptionGroupId.value) return
  try {
    await $fetch(`/api/admin/groups/${addAdoptionGroupId.value}/adoptions`, {
      method: 'POST',
      body: { people_group_id: selectedGroup.value.id }
    })
    showAddAdoptionModal.value = false
    addAdoptionGroupId.value = undefined
    await selectGroup(selectedGroup.value, false)
    toast.add({ title: 'Adoption added', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to add adoption', color: 'error' })
  }
}

async function removeAdoption(adoption: Adoption) {
  if (!selectedGroup.value) return
  try {
    await $fetch(`/api/admin/groups/${adoption.group_id}/adoptions/${adoption.id}`, {
      method: 'DELETE'
    })
    await selectGroup(selectedGroup.value, false)
    toast.add({ title: 'Adoption removed', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to remove', color: 'error' })
  }
}

function navigateToSubscribers(peopleGroupId: number) {
  navigateTo(`/admin/subscribers?peopleGroup=${peopleGroupId}`)
}

function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseInt(num) : num
  if (isNaN(n)) return '\u2014'
  return n.toLocaleString()
}

function formatDuration(minutes: number): string {
  if (!minutes) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

onMounted(async () => {
  const idParam = route.params.id as string | undefined

  if (idParam) {
    // Start loading the list in the background
    const listPromise = loadPeopleGroups(true)

    // Fetch the specific group immediately and open the slider
    try {
      const groupRes = await $fetch<{ peopleGroup: any; adoptions: Adoption[] }>(`/api/admin/people-groups/${idParam}`)
      const group = {
        ...groupRes.peopleGroup,
        people_committed: 0,
        committed_duration: 0,
        adoption_count: groupRes.adoptions.length
      } as PeopleGroup
      selectedGroup.value = group
      slideoverOpen.value = true
      resetAutoSave(buildFormData(group))
      adoptions.value = groupRes.adoptions
    } catch {
      // Group not found — just wait for the list
    }

    // Once the list finishes, swap in the list version which has accurate stats
    await listPromise
    const listGroup = peopleGroups.value.find(g => g.id === parseInt(idParam))
    if (listGroup) {
      selectedGroup.value = listGroup
      resetAutoSave(buildFormData(listGroup))
    }
  } else {
    await loadPeopleGroups(true)
  }
})
</script>

<style scoped>
.empty-list {
  padding: 2rem;
  text-align: center;
  color: var(--ui-text-muted);
}

.group-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.population {
  color: var(--ui-text-muted);
}

.group-stats {
  display: flex;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--ui-text-muted);
  margin-top: 0.25rem;
}

.group-stats span {
  white-space: nowrap;
}

.header-info {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.header-info :deep(h2) {
  font-size: 1.1rem;
}

.header-image {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
}

.header-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.fields-grid .full-width {
  grid-column: 1 / -1;
}

.readonly-field {
  padding: 0.5rem 0.75rem;
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

@media (max-width: 1024px) {
  .fields-grid {
    grid-template-columns: 1fr;
  }
}

.adoptions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-select {
  flex: 1;
  min-width: 120px;
}
</style>

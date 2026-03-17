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
        :total-count="total"
        @update:model-value="debouncedSearch"
      />
    </template>

    <template #list>
      <template v-if="peopleGroups.length === 0">
        <div class="empty-list">No people groups found</div>
      </template>
      <CrmListItem
        v-else
        v-for="group in peopleGroups"
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
            v-if="group.metadata?.imb_engagement_status"
            :label="group.metadata.imb_engagement_status"
            :color="group.metadata.imb_engagement_status === 'engaged' ? 'success' : 'warning'"
            variant="subtle"
            size="xs"
          />
          <span v-if="group.metadata?.imb_population" class="population">
            Pop: {{ formatNumber(group.metadata.imb_population) }}
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
        <div>
          <h2>{{ selectedGroup.name }}</h2>
          <div class="header-meta">
            <span v-if="selectedGroup.joshua_project_id">JP ID: {{ selectedGroup.joshua_project_id }}</span>
          </div>
        </div>
      </div>
    </template>

    <template v-if="selectedGroup" #detail-actions>
      <UButton size="sm" @click="navigateToSubscribers(selectedGroup.id)" variant="outline">
        Subscribers
      </UButton>
      <UButton size="sm" :to="`/admin/people-groups/${selectedGroup.id}/content`" variant="outline">
        Content
      </UButton>
      <UButton size="sm" v-if="selectedGroup.slug" :to="`/${selectedGroup.slug}`" target="_blank" variant="outline">
        Open
      </UButton>
      <UButton size="sm" @click="saveChanges" :loading="saving">Save</UButton>
    </template>

    <template #detail>
      <CrmDetailPanel v-if="selectedGroup" :tabs="detailTabs">
        <template #tab-details>
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

          <form @submit.prevent="saveChanges">
            <CrmFormSection
              v-for="category in fieldCategories"
              :key="category.key"
              :title="category.label"
            >
              <div class="fields-grid">
                <UFormField
                  v-for="field in category.fields"
                  :key="field.key"
                  :label="field.label"
                  :hint="field.description"
                  :class="{ 'full-width': field.type === 'textarea' || field.type === 'translatable' || field.type === 'picture-credit' }"
                >
                  <div v-if="field.readOnly" class="readonly-field">
                    {{ getFieldValue(field.key) || '\u2014' }}
                  </div>

                  <UInput
                    v-else-if="field.type === 'text'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event)"
                    class="w-full"
                  />

                  <UInput
                    v-else-if="field.type === 'number'"
                    type="number"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event)"
                    class="w-full"
                  />

                  <UTextarea
                    v-else-if="field.type === 'textarea'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event)"
                    :rows="3"
                    class="w-full"
                  />

                  <USelectMenu
                    v-else-if="field.type === 'select' && field.options"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event)"
                    :items="field.options"
                    value-key="value"
                    :search-input="{ placeholder: 'Search...' }"
                    :virtualize="field.options.length > 50"
                    class="w-full"
                  />

                  <TranslatableField
                    v-else-if="field.type === 'translatable'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event)"
                    @save="saveChanges"
                    :rows="3"
                  />

                  <PictureCreditEditor
                    v-else-if="field.type === 'picture-credit'"
                    :model-value="getFieldValue(field.key)"
                    @update:model-value="setFieldValue(field.key, $event)"
                  />

                  <UCheckbox
                    v-else-if="field.type === 'boolean'"
                    :model-value="getFieldValue(field.key) === true || getFieldValue(field.key) === '1'"
                    @update:model-value="setFieldValue(field.key, $event)"
                  />
                </UFormField>
              </div>
            </CrmFormSection>
          </form>
        </template>

        <template #tab-comments>
          <RecordComments v-if="selectedGroup" record-type="people_group" :record-id="selectedGroup.id" />
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
import { allFields, fieldsByCategory, categories, type FieldDefinition } from '~/utils/people-group-fields'
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
const total = ref(0)

// Form state
const formData = ref<Record<string, any>>({})

// Adoption modal state
const showAddAdoptionModal = ref(false)
const addAdoptionGroupId = ref<number | null>(null)

// Adoption slideover state
const showAdoptionSlideover = ref(false)
const selectedAdoption = ref<Adoption | null>(null)

// Slideover state
const slideoverOpen = ref(false)

const detailTabs = [
  { label: 'Details', slot: 'details', icon: 'i-lucide-file-text' },
  { label: 'Comments', slot: 'comments', icon: 'i-lucide-message-square' }
]

watch(slideoverOpen, (open) => {
  if (!open) {
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
const saving = ref(false)
const searchQuery = ref('')

// i18n and localized options
const { t } = useI18n()
const { countryOptions } = useLocalizedOptions()

// Field categories computed from new structure
const fieldCategories = computed(() => {
  return categories.map(category => ({
    key: category.key,
    label: t(category.labelKey),
    fields: (fieldsByCategory[category.key] || []).map(field => ({
      ...field,
      label: t(field.labelKey),
      options: getOptionsForField(field)
    }))
  }))
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

// Load people groups
async function loadPeopleGroups(isInitialLoad = false) {
  try {
    if (isInitialLoad) {
      loading.value = true
    }
    error.value = ''

    const params: Record<string, string> = {}
    if (searchQuery.value) {
      params.search = searchQuery.value
    }

    const [response, groupsRes] = await Promise.all([
      $fetch<{ peopleGroups: PeopleGroup[]; total: number }>(
        '/api/admin/people-groups',
        { params }
      ),
      allGroups.value.length === 0
        ? $fetch<{ groups: GroupOption[] }>('/api/admin/groups')
        : Promise.resolve(null)
    ])

    peopleGroups.value = response.peopleGroups
    total.value = response.total
    if (groupsRes) allGroups.value = groupsRes.groups
  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to load people groups'
    console.error(err)
  } finally {
    loading.value = false
  }
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null
function debouncedSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    loadPeopleGroups()
  }, 300)
}

// Select a people group
async function selectGroup(group: PeopleGroup, updateUrl = true) {
  if (updateUrl && selectedGroup.value?.id === group.id && slideoverOpen.value) {
    slideoverOpen.value = false
    return
  }

  selectedGroup.value = group
  slideoverOpen.value = true
  initializeForm(group)
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

// Initialize form with group data
function initializeForm(group: PeopleGroup) {
  formData.value = {
    name: group.name,
    image_url: group.image_url,
    joshua_project_id: group.joshua_project_id,
    descriptions: group.descriptions || {},
    ...group.metadata
  }
}

// Get field value from form data
function getFieldValue(key: string): any {
  const value = formData.value[key]
  if (key === 'descriptions') {
    return value || {}
  }
  return value ?? ''
}

// Set field value in form data
function setFieldValue(key: string, value: any) {
  formData.value[key] = value
}

// Reset form to original values
function resetForm() {
  if (selectedGroup.value) {
    initializeForm(selectedGroup.value)
  }
}

// Save changes
async function saveChanges() {
  if (!selectedGroup.value) return

  try {
    saving.value = true

    const { name, image_url, joshua_project_id, descriptions, ...metadataFields } = formData.value

    const response = await $fetch<{ success: boolean; peopleGroup: PeopleGroup }>(
      `/api/admin/people-groups/${selectedGroup.value.id}`,
      {
        method: 'PUT',
        body: {
          name,
          image_url,
          joshua_project_id,
          descriptions,
          metadata: metadataFields
        }
      }
    )

    selectedGroup.value = response.peopleGroup
    initializeForm(response.peopleGroup)

    const index = peopleGroups.value.findIndex(g => g.id === response.peopleGroup.id)
    if (index !== -1) {
      peopleGroups.value[index] = response.peopleGroup
    }

    toast.add({
      title: 'Success',
      description: 'People group updated successfully',
      color: 'success'
    })
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to save changes',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function openAdoptionSlideover(adoption: Adoption) {
  selectedAdoption.value = adoption
  showAdoptionSlideover.value = true
}

function openAddAdoptionModal() {
  addAdoptionGroupId.value = null
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
    addAdoptionGroupId.value = null
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

// Handle URL-based selection
function handleUrlSelection() {
  const idParam = route.params.id as string | undefined
  if (!idParam) return

  const id = parseInt(idParam)
  const group = peopleGroups.value.find(g => g.id === id)
  if (group) {
    selectGroup(group, false)
  }
}

onMounted(async () => {
  await loadPeopleGroups(true)
  handleUrlSelection()
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
  gap: 1rem;
  align-items: center;
}

.header-image {
  width: 60px;
  height: 60px;
  border-radius: 8px;
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
  grid-template-columns: repeat(2, 1fr);
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
</style>

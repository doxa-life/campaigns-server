<template>
  <CrmLayout
    :loading="loading"
    :error="error"
    v-model:open="slideoverOpen"
  >
    <template #header>
      <div>
        <h1>Groups</h1>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreateModal">New Group</UButton>
    </template>

    <template #list-header>
      <CrmListPanel
        v-model="searchQuery"
        search-placeholder="Search by name..."
        :total-count="filteredGroups.length"
      />
    </template>

    <template #list>
      <template v-if="filteredGroups.length === 0">
        <div class="empty-list">No groups found</div>
      </template>
      <CrmListItem
        v-else
        v-for="group in filteredGroups"
        :key="group.id"
        :active="selectedGroup?.id === group.id"
        @click="selectGroup(group)"
      >
        <div class="group-name">{{ group.name }}</div>
        <div class="group-info">
          {{ group.primary_subscriber_name || 'No primary contact' }}
        </div>
        <div class="group-meta">
          <UBadge v-if="group.adoption_count > 0" :label="`${group.adoption_count} adoption${group.adoption_count > 1 ? 's' : ''}`" variant="subtle" color="success" size="xs" />
          <UBadge v-if="group.subscriber_count > 0" :label="`${group.subscriber_count} contact${group.subscriber_count > 1 ? 's' : ''}`" variant="subtle" size="xs" />
          <span class="date">{{ formatDate(group.created_at) }}</span>
        </div>
      </CrmListItem>
    </template>

    <template v-if="selectedGroup" #detail-header>
      <h2>{{ selectedGroup.name }}</h2>
    </template>

    <template v-if="selectedGroup" #detail-actions>
      <UButton size="sm" @click="openDeleteGroupModal" color="error" variant="outline">Delete</UButton>
      <UButton size="sm" @click="saveGroupChanges" :loading="saving">Save</UButton>
    </template>

    <template #detail>
      <CrmDetailPanel v-if="selectedGroup" :side-tabs="sideTabs">
        <template #details>
          <form @submit.prevent="saveGroupChanges">
            <CrmFormSection title="Group Information">
              <UFormField label="Name" required>
                <UInput v-model="groupForm.name" type="text" class="w-full" />
              </UFormField>
              <UFormField label="Primary Contact">
                <USelectMenu
                  v-model="groupForm.primary_subscriber_id"
                  :items="primarySubscriberOptions"
                  value-key="value"
                  placeholder="Select primary contact..."
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Country">
                <USelectMenu
                  v-model="groupForm.country"
                  :items="countryOptions"
                  value-key="value"
                  placeholder="Select country..."
                  virtualize
                  class="w-full"
                />
              </UFormField>
            </CrmFormSection>

            <CrmFormSection title="Contacts">
              <template #header-extra>
                <UButton size="xs" variant="outline" icon="i-lucide-plus" @click="showAddSubscriberModal = true">
                  Add
                </UButton>
              </template>

              <div v-if="groupSubscribers.length === 0" class="empty-section">
                No contacts linked
              </div>
              <div v-else class="subscribers-list">
                <div v-for="s in groupSubscribers" :key="s.subscriber_id" class="subscriber-row">
                  <div class="subscriber-row-info">
                    <NuxtLink :to="`/admin/subscribers/${s.subscriber_id}`" class="subscriber-link">
                      {{ s.name }}
                    </NuxtLink>
                    <span v-if="s.email" class="subscriber-email">{{ s.email }}</span>
                  </div>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-x"
                    @click="removeSubscriber(s.subscriber_id)"
                  />
                </div>
              </div>
            </CrmFormSection>

            <CrmFormSection title="Adoptions">
              <template #header-extra>
                <UButton size="xs" variant="outline" icon="i-lucide-plus" @click="showAddAdoptionModal = true">
                  Add
                </UButton>
              </template>

              <div v-if="groupAdoptions.length === 0" class="empty-section">
                No adoptions
              </div>
              <div v-else class="adoptions-list">
                <AdoptionCard
                  v-for="adoption in groupAdoptions"
                  :key="adoption.id"
                  :adoption="adoption"
                  :label="adoption.people_group_name"
                  @open="openAdoptionSlideover(adoption)"
                />
              </div>
            </CrmFormSection>
            <CrmFormSection title="Metadata">
              <div class="info-row">
                <span class="label">Group ID:</span>
                <span class="value monospace">{{ selectedGroup.id }}</span>
              </div>
              <div class="info-row">
                <span class="label">Created:</span>
                <span class="value">{{ formatDateTime(selectedGroup.created_at) }}</span>
              </div>
            </CrmFormSection>
          </form>
        </template>

        <template #side-comments>
          <RecordComments record-type="group" :record-id="selectedGroup.id" @update:count="commentCount = $event" />
        </template>

        <template #side-activity>
          <RecordActivity v-if="selectedGroup" ref="activityRef" table-name="groups" :record-id="selectedGroup.id" />
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <!-- Create Group Modal -->
  <UModal v-model:open="showCreateModal" title="New Group">
    <template #body>
      <form @submit.prevent="createGroup" class="flex flex-col gap-3">
        <UFormField label="Name" required>
          <UInput v-model="createGroupForm.name" type="text" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="showCreateModal = false">Cancel</UButton>
          <UButton type="submit" :loading="creating">Create</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <!-- Add Contact Modal -->
  <UModal v-model:open="showAddSubscriberModal" title="Add Contact to Group">
    <template #body>
      <form @submit.prevent="addSubscriberToGroup" class="flex flex-col gap-3">
        <UFormField label="Contact">
          <USelectMenu
            v-model="addSubscriberId"
            :items="allSubscriberOptions"
            value-key="value"
            placeholder="Select a contact..."
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="showAddSubscriberModal = false">Cancel</UButton>
          <UButton type="submit" :disabled="!addSubscriberId">Add</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <!-- Add Adoption Modal -->
  <UModal v-model:open="showAddAdoptionModal" title="Add Adoption">
    <template #body>
      <form @submit.prevent="addAdoption" class="flex flex-col gap-3">
        <UFormField label="People Group">
          <USelectMenu
            v-model="addAdoptionPeopleGroupId"
            :items="peopleGroupOptions"
            value-key="value"
            placeholder="Select a people group..."
            virtualize
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="showAddAdoptionModal = false">Cancel</UButton>
          <UButton type="submit" :disabled="!addAdoptionPeopleGroupId">Add</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <!-- Delete Group Modal -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Group"
    :message="selectedGroup ? `Are you sure you want to delete &quot;${selectedGroup.name}&quot;?` : ''"
    warning="This will remove all connections and adoptions for this group. This action cannot be undone."
    confirm-text="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="confirmDeleteGroup"
    @cancel="showDeleteModal = false"
  />

  <AdoptionSlideover
    v-model:open="showAdoptionSlideover"
    :adoption="selectedAdoption"
    @change="refreshGroup"
    @delete="deleteAdoption"
  />
</template>

<script setup lang="ts">
import type { Adoption } from '~/types/adoption'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface GroupWithDetails {
  id: number
  name: string
  primary_subscriber_id: number | null
  country: string | null
  primary_subscriber_name: string | null
  primary_subscriber_email: string | null
  subscriber_count: number
  adoption_count: number
  created_at: string
  updated_at: string
}

interface GroupSubscriber {
  subscriber_id: number
  name: string
  email: string | null
  phone: string | null
  role: string | null
  connection_type: string | null
}

interface SubscriberOption {
  id: number
  name: string
  primary_email: string | null
}

interface PeopleGroupOption {
  id: number
  name: string
}

const route = useRoute()
const toast = useToast()
const { countryOptions } = useLocalizedOptions()

const groups = ref<GroupWithDetails[]>([])
const selectedGroup = ref<GroupWithDetails | null>(null)
const groupSubscribers = ref<GroupSubscriber[]>([])
const groupAdoptions = ref<Adoption[]>([])
const allSubscribers = ref<SubscriberOption[]>([])
const allPeopleGroups = ref<PeopleGroupOption[]>([])

const loading = ref(true)
const error = ref('')
const saving = ref(false)
const creating = ref(false)
const deleting = ref(false)

const searchQuery = ref('')
const groupForm = ref({ name: '', primary_subscriber_id: null as number | null, country: null as string | null })

const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const showAddSubscriberModal = ref(false)
const showAddAdoptionModal = ref(false)
const showAdoptionSlideover = ref(false)
const selectedAdoption = ref<Adoption | null>(null)
const createGroupForm = ref({ name: '' })
const addSubscriberId = ref<number | null>(null)
const addAdoptionPeopleGroupId = ref<number | null>(null)

const slideoverOpen = ref(false)

const activityRef = ref<{ refresh: () => void } | null>(null)

const commentCount = ref(0)
const sideTabs = computed(() => [
  { label: 'Activity', slot: 'activity', icon: 'i-lucide-activity' },
  { label: 'Comments', slot: 'comments', icon: 'i-lucide-message-square', badge: commentCount.value || undefined }
])

watch(slideoverOpen, (open) => {
  if (!open) {
    deselectGroup()
  }
})

const filteredGroups = computed(() => {
  if (!searchQuery.value) return groups.value
  const q = searchQuery.value.toLowerCase()
  return groups.value.filter(g => g.name.toLowerCase().includes(q))
})

const primarySubscriberOptions = computed(() => {
  return [
    { label: 'None', value: null },
    ...groupSubscribers.value.map(s => ({
      label: `${s.name}${s.email ? ` (${s.email})` : ''}`,
      value: s.subscriber_id
    }))
  ]
})

const allSubscriberOptions = computed(() => {
  const linkedIds = new Set(groupSubscribers.value.map(s => s.subscriber_id))
  return allSubscribers.value
    .filter(s => !linkedIds.has(s.id))
    .map(s => ({
      label: `${s.name}${s.primary_email ? ` (${s.primary_email})` : ''}`,
      value: s.id
    }))
})

const peopleGroupOptions = computed(() => {
  const adoptedIds = new Set(groupAdoptions.value.map(a => a.people_group_id))
  return allPeopleGroups.value
    .filter(pg => !adoptedIds.has(pg.id))
    .map(pg => ({ label: pg.name, value: pg.id }))
})

async function loadData() {
  try {
    loading.value = true
    error.value = ''
    const [groupsRes, subscribersRes, pgRes] = await Promise.all([
      $fetch<{ groups: GroupWithDetails[] }>('/api/admin/groups'),
      $fetch<{ subscribers: SubscriberOption[] }>('/api/admin/subscribers'),
      $fetch<{ peopleGroups: PeopleGroupOption[] }>('/api/admin/people-groups')
    ])
    groups.value = groupsRes.groups
    allSubscribers.value = subscribersRes.subscribers
    allPeopleGroups.value = pgRes.peopleGroups
  } catch (err: any) {
    error.value = 'Failed to load groups'
  } finally {
    loading.value = false
  }
}

async function selectGroup(group: GroupWithDetails, updateUrl = true) {
  if (updateUrl && selectedGroup.value?.id === group.id && slideoverOpen.value) {
    slideoverOpen.value = false
    return
  }

  selectedGroup.value = group
  slideoverOpen.value = true
  groupForm.value = {
    name: group.name,
    primary_subscriber_id: group.primary_subscriber_id,
    country: group.country
  }
  if (updateUrl && import.meta.client) {
    window.history.replaceState({}, '', `/admin/groups/${group.id}`)
  }

  try {
    const res = await $fetch<{ group: any; subscribers: GroupSubscriber[]; adoptions: Adoption[] }>(`/api/admin/groups/${group.id}`)
    groupSubscribers.value = res.subscribers
    groupAdoptions.value = res.adoptions
  } catch {
    groupSubscribers.value = []
    groupAdoptions.value = []
  }
}

function deselectGroup() {
  selectedGroup.value = null
  if (import.meta.client) {
    window.history.replaceState({}, '', '/admin/groups')
  }
}

async function saveGroupChanges() {
  if (!selectedGroup.value) return
  try {
    saving.value = true
    await $fetch(`/api/admin/groups/${selectedGroup.value.id}`, {
      method: 'PUT',
      body: {
        name: groupForm.value.name,
        primary_subscriber_id: groupForm.value.primary_subscriber_id,
        country: groupForm.value.country
      }
    })
    await refreshGroup()
    activityRef.value?.refresh()
    toast.add({ title: 'Saved', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to save', color: 'error' })
  } finally {
    saving.value = false
  }
}

function resetForm() {
  if (selectedGroup.value) selectGroup(selectedGroup.value, false)
}

function openCreateModal() {
  createGroupForm.value = { name: '' }
  showCreateModal.value = true
}

async function createGroup() {
  if (!createGroupForm.value.name.trim()) return
  try {
    creating.value = true
    const res = await $fetch<{ group: any }>('/api/admin/groups', {
      method: 'POST',
      body: createGroupForm.value
    })
    await loadData()
    showCreateModal.value = false
    const created = groups.value.find(g => g.id === res.group.id)
    if (created) selectGroup(created)
    toast.add({ title: 'Group created', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to create', color: 'error' })
  } finally {
    creating.value = false
  }
}

function openDeleteGroupModal() {
  if (selectedGroup.value) showDeleteModal.value = true
}

async function confirmDeleteGroup() {
  if (!selectedGroup.value) return
  try {
    deleting.value = true
    await $fetch(`/api/admin/groups/${selectedGroup.value.id}`, { method: 'DELETE' })
    groups.value = groups.value.filter(g => g.id !== selectedGroup.value!.id)
    slideoverOpen.value = false
    showDeleteModal.value = false
    toast.add({ title: 'Group deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to delete', color: 'error' })
  } finally {
    deleting.value = false
  }
}

async function addSubscriberToGroup() {
  if (!selectedGroup.value || !addSubscriberId.value) return
  try {
    await $fetch(`/api/admin/groups/${selectedGroup.value.id}/subscribers`, {
      method: 'POST',
      body: { subscriber_id: addSubscriberId.value }
    })
    showAddSubscriberModal.value = false
    addSubscriberId.value = null
    await refreshGroup()
    toast.add({ title: 'Contact added', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to add contact', color: 'error' })
  }
}

async function removeSubscriber(subscriberId: number) {
  if (!selectedGroup.value) return
  try {
    await $fetch(`/api/admin/groups/${selectedGroup.value.id}/subscribers?subscriber_id=${subscriberId}`, {
      method: 'DELETE'
    })
    await refreshGroup()
    toast.add({ title: 'Contact removed', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to remove', color: 'error' })
  }
}

async function addAdoption() {
  if (!selectedGroup.value || !addAdoptionPeopleGroupId.value) return
  try {
    await $fetch(`/api/admin/groups/${selectedGroup.value.id}/adoptions`, {
      method: 'POST',
      body: { people_group_id: addAdoptionPeopleGroupId.value }
    })
    showAddAdoptionModal.value = false
    addAdoptionPeopleGroupId.value = null
    await refreshGroup()
    toast.add({ title: 'Adoption added', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to add adoption', color: 'error' })
  }
}

function openAdoptionSlideover(adoption: Adoption) {
  selectedAdoption.value = adoption
  showAdoptionSlideover.value = true
}

async function deleteAdoption(adoption: Adoption) {
  if (!selectedGroup.value) return
  try {
    await $fetch(`/api/admin/groups/${selectedGroup.value.id}/adoptions/${adoption.id}`, {
      method: 'DELETE'
    })
    await refreshGroup()
    toast.add({ title: 'Adoption removed', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to remove', color: 'error' })
  }
}

async function refreshGroup() {
  if (!selectedGroup.value) return
  await loadData()
  const updated = groups.value.find(g => g.id === selectedGroup.value!.id)
  if (updated) await selectGroup(updated, false)
}

function handleUrlSelection() {
  const idParam = route.params.id as string | undefined
  if (!idParam) return
  const group = groups.value.find(g => g.id === parseInt(idParam))
  if (group) selectGroup(group, false)
}

onMounted(async () => {
  await loadData()
  handleUrlSelection()
})
</script>

<style scoped>
.empty-list,
.empty-section {
  padding: 1rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.group-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.group-info {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 0.25rem;
}

.group-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.75rem;
}

.date {
  color: var(--ui-text-muted);
}

.subscribers-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.subscriber-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
}

.subscriber-row-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.subscriber-link {
  font-weight: 500;
  color: var(--ui-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.subscriber-email {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.adoptions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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

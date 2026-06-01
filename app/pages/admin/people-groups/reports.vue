<template>
  <CrmLayout
    :loading="loading"
    :error="error"
    v-model:open="slideoverOpen"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="xs" to="/admin/people-groups" />
          <h1>People Group Reports</h1>
        </div>
        <UButton icon="i-lucide-plus" @click="openCreateModal">New Report</UButton>
      </div>
    </template>

    <template #list-header>
      <CrmListPanel
        v-model="searchQuery"
        search-placeholder="Search by people group or reporter..."
        :total-count="reports.length"
      >
        <template #filters>
          <USelectMenu
            v-model="filterStatus"
            :items="statusOptions"
            value-key="value"
            placeholder="All Statuses"
            class="filter-select"
          />
        </template>
      </CrmListPanel>
    </template>

    <template #list>
      <template v-if="filteredReports.length === 0">
        <div class="empty-list">No reports found</div>
      </template>
      <CrmListItem
        v-else
        v-for="report in filteredReports"
        :key="report.id"
        :active="selectedReport?.id === report.id"
        @click="selectReport(report)"
      >
        <div class="report-name">{{ report.people_group_name }}</div>
        <div class="report-meta">
          <UBadge
            :label="report.status"
            :color="statusColor(report.status)"
            variant="subtle"
            size="xs"
          />
          <span class="reporter">{{ report.reporter_name }}</span>
        </div>
        <div class="report-date">
          {{ formatDate(report.created_at) }}
          <span class="field-count">{{ Object.keys(report.suggested_changes).length }} fields</span>
        </div>
      </CrmListItem>
    </template>

    <template v-if="selectedReport" #detail-header>
      <div class="header-info">
        <h2>{{ selectedReport.people_group_name }}</h2>
        <UButton
          size="xs"
          variant="outline"
          color="neutral"
          icon="i-lucide-external-link"
          :to="`/admin/people-groups/${selectedReport.people_group_id}`"
        />
      </div>
    </template>

    <template v-if="selectedReport" #detail-actions>
      <UBadge
        :label="selectedReport.status"
        :color="statusColor(selectedReport.status)"
        variant="subtle"
      />
    </template>

    <template #detail>
      <CrmDetailPanel v-if="selectedReport" :detail-tabs="detailTabs" :side-tabs="sideTabs">
        <template #detail-changes>
          <CrmFormSection title="Report Info">
            <div class="info-grid">
              <div><span class="info-label">Reporter</span> {{ selectedReport.reporter_name }}</div>
              <div v-if="selectedReport.reporter_email"><span class="info-label">Email</span> {{ selectedReport.reporter_email }}</div>
              <div><span class="info-label">Submitted</span> {{ formatDate(selectedReport.created_at) }}</div>
              <div v-if="selectedReport.reviewed_at"><span class="info-label">Reviewed</span> {{ formatDate(selectedReport.reviewed_at) }}</div>
            </div>
          </CrmFormSection>

          <CrmFormSection title="Suggested Changes">
            <div class="changes-list">
              <div v-for="(value, key) in selectedReport.suggested_changes" :key="key" class="change-row">
                <div class="change-field">{{ getFieldLabel(key as string) }}</div>
                <div class="change-values">
                  <div class="change-current">
                    <span class="value-label">{{ selectedReport.status === 'pending' ? 'Current' : 'Was' }}</span>
                    <span class="value-text">{{ getPreviousValue(key as string) || '—' }}</span>
                  </div>
                  <UIcon name="i-lucide-arrow-right" class="change-arrow" />
                  <div class="change-proposed">
                    <span class="value-label">{{ selectedReport.status === 'accepted' ? 'Applied' : 'Proposed' }}</span>
                    <span class="value-text proposed">{{ formatFieldValue(key as string, value) || '—' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </CrmFormSection>

          <CrmFormSection v-if="selectedReport.notes" title="Notes">
            <p class="review-notes-text">{{ selectedReport.notes }}</p>
          </CrmFormSection>

          <div v-if="selectedReport.status === 'pending'" class="review-actions">
            <UButton
              color="success"
              icon="i-lucide-check"
              label="Accept"
              :loading="accepting"
              @click="confirmAccept"
            />
            <UButton
              color="error"
              variant="outline"
              icon="i-lucide-x"
              label="Deny"
              :loading="denying"
              @click="denyReport"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              label="Delete"
              @click="confirmDelete"
            />
          </div>
        </template>

        <template #side-comments>
          <RecordComments v-if="selectedReport" record-type="people_group_report" :record-id="selectedReport.id" @update:count="commentCount = $event" />
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <!-- Accept Confirmation Modal -->
  <UModal v-model:open="showAcceptModal" title="Accept Report">
    <template #body>
      <p>This will apply the suggested changes to <strong>{{ selectedReport?.people_group_name }}</strong>. Continue?</p>
      <div class="flex justify-end gap-2 mt-4">
        <UButton variant="outline" @click="showAcceptModal = false">Cancel</UButton>
        <UButton color="success" :loading="accepting" @click="acceptReport">Accept</UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete Confirmation Modal -->
  <UModal v-model:open="showDeleteModal" title="Delete Report">
    <template #body>
      <p>Are you sure you want to delete this report?</p>
      <div class="flex justify-end gap-2 mt-4">
        <UButton variant="outline" @click="showDeleteModal = false">Cancel</UButton>
        <UButton color="error" :loading="deleting" @click="deleteReport">Delete</UButton>
      </div>
    </template>
  </UModal>

  <!-- Create Report Modal -->
  <UModal v-model:open="showCreateModal" title="New People Group Report">
    <template #body>
      <form @submit.prevent="submitReport" class="flex flex-col gap-4">
        <UFormField label="Paste Report for AI Parsing">
          <UTextarea
            v-model="aiInputText"
            placeholder="Paste a field report here to auto-fill the form..."
            :rows="6"
            class="w-full"
          />
          <template #hint>
            <UButton
              icon="i-lucide-sparkles"
              label="Parse with AI"
              size="xs"
              :loading="aiParsing"
              :disabled="!aiInputText.trim()"
              @click="parseWithAi"
              class="mt-1"
            />
          </template>
        </UFormField>

        <USeparator />

        <UFormField label="People Group" required>
          <USelectMenu
            v-model="createForm.people_group_id"
            :items="peopleGroupOptions"
            value-key="value"
            placeholder="Select a people group..."
            :search-input="{ placeholder: 'Search...' }"
            virtualize
            class="w-full"
            @update:model-value="onPeopleGroupSelected"
          />
        </UFormField>

        <UFormField label="Reporter Name" required>
          <UInput v-model="createForm.reporter_name" placeholder="Your name" class="w-full" />
        </UFormField>

        <UFormField label="Reporter Email">
          <UInput v-model="createForm.reporter_email" type="email" placeholder="Email (optional)" class="w-full" />
        </UFormField>

        <template v-if="createForm.people_group_id">
          <USeparator label="Field Updates" />

          <div v-for="fieldKey in activeFieldKeys" :key="fieldKey" class="field-update-row">
            <div class="field-update-header">
              <span class="field-update-label">{{ getFieldLabel(fieldKey) }}</span>
              <UButton
                v-if="!defaultReportFieldKeys.includes(fieldKey)"
                icon="i-lucide-x"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="removeField(fieldKey)"
              />
            </div>
            <div class="field-update-current">
              Current: <span>{{ formatCurrentValue(fieldKey) }}</span>
            </div>

            <USelectMenu
              v-if="getFieldDef(fieldKey)?.type === 'select' && getFieldDef(fieldKey)?.options"
              :model-value="createForm.suggested_changes[fieldKey]"
              @update:model-value="createForm.suggested_changes[fieldKey] = $event"
              :items="getSelectOptions(fieldKey)"
              value-key="value"
              :placeholder="`Select ${getFieldLabel(fieldKey)}...`"
              :search-input="{ placeholder: 'Search...' }"
              class="w-full"
            />

            <UInput
              v-else-if="getFieldDef(fieldKey)?.type === 'number'"
              type="number"
              :model-value="createForm.suggested_changes[fieldKey]"
              @update:model-value="createForm.suggested_changes[fieldKey] = $event"
              :placeholder="getFieldLabel(fieldKey)"
              class="w-full"
            />

            <UTextarea
              v-else-if="getFieldDef(fieldKey)?.type === 'textarea'"
              :model-value="createForm.suggested_changes[fieldKey]"
              @update:model-value="createForm.suggested_changes[fieldKey] = $event"
              :rows="3"
              :placeholder="getFieldLabel(fieldKey)"
              class="w-full"
            />

            <USwitch
              v-else-if="getFieldDef(fieldKey)?.type === 'boolean'"
              :model-value="createForm.suggested_changes[fieldKey] === true || createForm.suggested_changes[fieldKey] === '1'"
              @update:model-value="createForm.suggested_changes[fieldKey] = $event"
            />

            <UInput
              v-else
              :model-value="createForm.suggested_changes[fieldKey]"
              @update:model-value="createForm.suggested_changes[fieldKey] = $event"
              :placeholder="getFieldLabel(fieldKey)"
              class="w-full"
            />
          </div>

          <UButton
            icon="i-lucide-plus"
            variant="outline"
            size="sm"
            label="Add Field"
            @click="showFieldPicker = !showFieldPicker"
          />

          <USelectMenu
            v-if="showFieldPicker"
            :items="availableFieldOptions"
            value-key="value"
            placeholder="Select a field to add..."
            :search-input="{ placeholder: 'Search fields...' }"
            class="w-full"
            @update:model-value="addField"
          />
        </template>

        <UFormField v-if="createForm.people_group_id" label="Notes">
          <UTextarea v-model="createForm.notes" placeholder="Additional context..." :rows="2" class="w-full" />
        </UFormField>

        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="showCreateModal = false">Cancel</UButton>
          <UButton type="submit" :loading="creating" :disabled="!canSubmit">Submit Report</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { allFields, getField, isTableColumn, type FieldDefinition } from '~/utils/people-group-fields'
import { defaultReportFieldKeys } from '~/utils/people-group-report-defaults'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface Report {
  id: number
  people_group_id: number
  reporter_name: string
  reporter_email: string | null
  suggested_changes: Record<string, any>
  previous_values: Record<string, any> | null
  status: 'pending' | 'accepted' | 'denied'
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  people_group_name: string
  people_group_slug: string | null
  created_at: string
  updated_at: string
}

interface PeopleGroupSummary {
  id: number
  name: string
  slug: string | null
  metadata: Record<string, any>
  [key: string]: any
}

const route = useRoute()
const toast = useToast()
const { t } = useI18n()
const { user } = useAuth()

// State
const loading = ref(true)
const error = ref('')
const reports = ref<Report[]>([])
const selectedReport = ref<Report | null>(null)
const currentPeopleGroup = ref<PeopleGroupSummary | null>(null)
const slideoverOpen = ref(false)
const searchQuery = ref('')
const filterStatus = ref<string | null>(null)

const commentCount = ref(0)

// AI parsing
const aiInputText = ref('')
const aiParsing = ref(false)
const aiOriginalText = ref('')

// Action states
const accepting = ref(false)
const denying = ref(false)
const deleting = ref(false)
const creating = ref(false)

// Modals
const showAcceptModal = ref(false)
const showDeleteModal = ref(false)
const showCreateModal = ref(false)
const showFieldPicker = ref(false)

// People groups for create form
const peopleGroups = ref<PeopleGroupSummary[]>([])
const createPeopleGroup = ref<PeopleGroupSummary | null>(null)

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Pending', value: 'pending' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Denied', value: 'denied' }
]

const detailTabs = [
  { label: 'Changes', slot: 'changes', icon: 'i-lucide-file-diff' }
]
const sideTabs = computed(() => [
  { label: 'Comments', slot: 'comments', icon: 'i-lucide-message-square', badge: commentCount.value || undefined }
])

// Create form
const createForm = ref({
  people_group_id: undefined as number | undefined,
  reporter_name: '',
  reporter_email: '',
  suggested_changes: {} as Record<string, any>,
  notes: ''
})

const extraFieldKeys = ref<string[]>([])

const activeFieldKeys = computed(() => {
  return [...defaultReportFieldKeys, ...extraFieldKeys.value]
})

const canSubmit = computed(() => {
  return createForm.value.people_group_id &&
    createForm.value.reporter_name.trim() &&
    Object.keys(createForm.value.suggested_changes).some(k => createForm.value.suggested_changes[k] !== '' && createForm.value.suggested_changes[k] != null)
})

// Filter
const filteredReports = computed(() => {
  let filtered = reports.value
  if (filterStatus.value) {
    filtered = filtered.filter(r => r.status === filterStatus.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(r =>
      r.people_group_name.toLowerCase().includes(q) ||
      r.reporter_name.toLowerCase().includes(q)
    )
  }
  return filtered
})

// People group options for create form
const peopleGroupOptions = computed(() => {
  return peopleGroups.value.map(pg => ({
    label: pg.name,
    value: pg.id
  }))
})

// Available fields to add (exclude hidden, already selected)
const availableFieldOptions = computed(() => {
  const usedKeys = new Set(activeFieldKeys.value)
  return allFields
    .filter(f => !f.hidden && !usedKeys.has(f.key))
    .map(f => ({
      label: t(f.labelKey),
      value: f.key
    }))
})

function statusColor(status: string) {
  switch (status) {
    case 'pending': return 'warning'
    case 'accepted': return 'success'
    case 'denied': return 'error'
    default: return 'neutral'
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getFieldLabel(key: string): string {
  const field = getField(key)
  return field ? t(field.labelKey) : key
}

function getFieldDef(key: string): FieldDefinition | undefined {
  return getField(key)
}

function getCurrentValue(key: string): string {
  if (!currentPeopleGroup.value) return ''
  if (isTableColumn(key)) {
    return String((currentPeopleGroup.value as any)[key] ?? '')
  }
  return String((currentPeopleGroup.value.metadata || {})[key] ?? '')
}

function getPreviousValue(key: string): string {
  // For non-pending reports with stored previous values, use the snapshot
  if (selectedReport.value?.previous_values && selectedReport.value.status !== 'pending') {
    const val = selectedReport.value.previous_values[key]
    return formatFieldValue(key, val)
  }
  // For pending reports, show live current value
  return formatFieldValue(key, getCurrentValue(key)) || getCurrentValue(key)
}

function getCurrentValueForCreate(key: string): string {
  if (!createPeopleGroup.value) return ''
  if (isTableColumn(key)) {
    return String((createPeopleGroup.value as any)[key] ?? '')
  }
  return String((createPeopleGroup.value.metadata || {})[key] ?? '')
}

function formatFieldValue(key: string, value: any): string {
  if (value == null) return ''
  const field = getField(key)
  if (field?.options) {
    const opt = field.options.find(o => o.value === String(value))
    if (opt) return opt.label || (opt.labelKey ? t(opt.labelKey) : String(value))
  }
  return String(value)
}

function formatCurrentValue(key: string): string {
  const raw = getCurrentValueForCreate(key)
  const field = getFieldDef(key)
  if (field?.type === 'boolean') {
    return raw === 'true' || raw === '1' ? 'Yes' : 'No'
  }
  if (field?.type === 'select' && field.options && raw) {
    const opt = field.options.find(o => o.value === raw)
    if (opt) return opt.label || (opt.labelKey ? t(opt.labelKey) : raw)
  }
  return raw || '—'
}

function getSelectOptions(key: string): { value: string; label: string }[] {
  const field = getFieldDef(key)
  if (!field?.options) return []
  return field.options.map(opt => ({
    value: opt.value,
    label: opt.label || (opt.labelKey ? t(opt.labelKey) : opt.value)
  }))
}

function addField(fieldKey: string) {
  if (!extraFieldKeys.value.includes(fieldKey)) {
    extraFieldKeys.value.push(fieldKey)
  }
  showFieldPicker.value = false
}

function removeField(fieldKey: string) {
  extraFieldKeys.value = extraFieldKeys.value.filter(k => k !== fieldKey)
  delete createForm.value.suggested_changes[fieldKey]
}

// Data loading
async function loadReports() {
  try {
    loading.value = true
    error.value = ''
    const response = await $fetch<{ reports: Report[]; total: number }>(
      '/api/admin/people-group-reports'
    )
    reports.value = response.reports
  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to load reports'
  } finally {
    loading.value = false
  }
}

async function selectReport(report: Report) {
  if (selectedReport.value?.id === report.id && slideoverOpen.value) {
    slideoverOpen.value = false
    return
  }

  selectedReport.value = report
  slideoverOpen.value = true

  try {
    const res = await $fetch<{ report: Report; peopleGroup: PeopleGroupSummary | null }>(
      `/api/admin/people-group-reports/${report.id}`
    )
    selectedReport.value = res.report
    currentPeopleGroup.value = res.peopleGroup
  } catch {
    currentPeopleGroup.value = null
  }
}

watch(slideoverOpen, (open) => {
  if (!open) {
    selectedReport.value = null
    currentPeopleGroup.value = null
  }
})

// Actions
function confirmAccept() {
  showAcceptModal.value = true
}

async function acceptReport() {
  if (!selectedReport.value) return
  try {
    accepting.value = true
    const res = await $fetch<{ report: Report }>(`/api/admin/people-group-reports/${selectedReport.value.id}/accept`, {
      method: 'POST',
      body: {}
    })
    toast.add({ title: 'Report accepted', description: 'Changes applied to people group', color: 'success' })
    showAcceptModal.value = false
    selectedReport.value = res.report
    await loadReports()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to accept report', color: 'error' })
  } finally {
    accepting.value = false
  }
}

async function denyReport() {
  if (!selectedReport.value) return
  try {
    denying.value = true
    const res = await $fetch<{ report: Report }>(`/api/admin/people-group-reports/${selectedReport.value.id}/deny`, {
      method: 'POST',
      body: {}
    })
    toast.add({ title: 'Report denied', color: 'warning' })
    selectedReport.value = res.report
    await loadReports()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to deny report', color: 'error' })
  } finally {
    denying.value = false
  }
}

function confirmDelete() {
  showDeleteModal.value = true
}

async function deleteReport() {
  if (!selectedReport.value) return
  try {
    deleting.value = true
    await $fetch(`/api/admin/people-group-reports/${selectedReport.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Report deleted', color: 'success' })
    showDeleteModal.value = false
    slideoverOpen.value = false
    await loadReports()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to delete', color: 'error' })
  } finally {
    deleting.value = false
  }
}

// Create
function openCreateModal() {
  createForm.value = {
    people_group_id: undefined,
    reporter_name: user.value?.display_name || '',
    reporter_email: user.value?.email || '',
    suggested_changes: {},
    notes: ''
  }
  extraFieldKeys.value = []
  createPeopleGroup.value = null
  showFieldPicker.value = false
  aiInputText.value = ''
  aiOriginalText.value = ''
  showCreateModal.value = true
}

function matchPeopleGroup(name: string | null, uid: string | null): PeopleGroupSummary | null {
  if (!name && !uid) return null

  if (uid) {
    const byUid = peopleGroups.value.find(pg =>
      pg.metadata?.doxa_masteruid === uid ||
      pg.metadata?.imb_uid === uid
    )
    if (byUid) return byUid
  }

  if (name) {
    const normalized = name.toLowerCase().trim()
    const exact = peopleGroups.value.find(pg => pg.name.toLowerCase().trim() === normalized)
    if (exact) return exact

    const partial = peopleGroups.value.find(pg =>
      pg.name.toLowerCase().includes(normalized) ||
      normalized.includes(pg.name.toLowerCase())
    )
    if (partial) return partial
  }

  return null
}

async function parseWithAi() {
  if (!aiInputText.value.trim()) return
  aiParsing.value = true
  try {
    const { parsed } = await $fetch<{ parsed: {
      people_group_name: string | null
      people_group_uid: string | null
      reporter_name: string | null
      reporter_email: string | null
      suggested_changes: Record<string, any>
      notes: string | null
    } }>('/api/admin/people-group-reports/parse', {
      method: 'POST',
      body: { text: aiInputText.value }
    })

    aiOriginalText.value = aiInputText.value

    if (parsed.reporter_name) createForm.value.reporter_name = parsed.reporter_name
    if (parsed.reporter_email) createForm.value.reporter_email = parsed.reporter_email

    const matched = matchPeopleGroup(parsed.people_group_name, parsed.people_group_uid)
    if (matched) {
      createForm.value.people_group_id = matched.id
      await onPeopleGroupSelected(matched.id)
    }

    if (parsed.suggested_changes) {
      for (const [key, value] of Object.entries(parsed.suggested_changes)) {
        createForm.value.suggested_changes[key] = value
        if (!defaultReportFieldKeys.includes(key) && !extraFieldKeys.value.includes(key)) {
          extraFieldKeys.value.push(key)
        }
      }
    }

    if (parsed.notes) {
      createForm.value.notes = parsed.notes
    }

    toast.add({ title: 'Report parsed', description: 'Fields auto-filled from AI analysis', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Parse failed', description: err.data?.statusMessage || 'Failed to parse report', color: 'error' })
  } finally {
    aiParsing.value = false
  }
}

async function onPeopleGroupSelected(pgId: number) {
  if (!pgId) {
    createPeopleGroup.value = null
    return
  }
  try {
    const res = await $fetch<{ peopleGroup: PeopleGroupSummary }>(`/api/admin/people-groups/${pgId}`)
    createPeopleGroup.value = res.peopleGroup
    // Pre-fill current values into suggested_changes for default fields
    createForm.value.suggested_changes = {}
    for (const key of defaultReportFieldKeys) {
      const currentVal = isTableColumn(key)
        ? (res.peopleGroup as any)[key]
        : (res.peopleGroup.metadata || {})[key]
      createForm.value.suggested_changes[key] = currentVal ?? ''
    }
  } catch {
    createPeopleGroup.value = null
  }
}

async function submitReport() {
  if (!canSubmit.value) return
  try {
    creating.value = true
    // Only include fields that differ from current values
    const changes: Record<string, any> = {}
    for (const [key, value] of Object.entries(createForm.value.suggested_changes)) {
      const current = getCurrentValueForCreate(key)
      if (String(value ?? '') !== String(current ?? '')) {
        changes[key] = value
      }
    }

    if (Object.keys(changes).length === 0) {
      toast.add({ title: 'No changes', description: 'No field values differ from current data', color: 'warning' })
      creating.value = false
      return
    }

    await $fetch('/api/admin/people-group-reports', {
      method: 'POST',
      body: {
        people_group_id: createForm.value.people_group_id,
        reporter_name: createForm.value.reporter_name.trim(),
        reporter_email: createForm.value.reporter_email?.trim() || undefined,
        suggested_changes: changes,
        notes: createForm.value.notes?.trim() || undefined,
        ai_input_text: aiOriginalText.value?.trim() || undefined
      }
    })
    toast.add({ title: 'Report submitted', color: 'success' })
    showCreateModal.value = false
    await loadReports()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to submit report', color: 'error' })
  } finally {
    creating.value = false
  }
}

// Load people groups list for the create form selector
async function loadPeopleGroups() {
  try {
    const res = await $fetch<{ peopleGroups: PeopleGroupSummary[] }>('/api/admin/people-groups')
    peopleGroups.value = res.peopleGroups
  } catch {
    // silently fail, user can retry
  }
}

onMounted(async () => {
  await Promise.all([loadReports(), loadPeopleGroups()])

  const idParam = route.query.id as string | undefined
  if (idParam) {
    const report = reports.value.find(r => r.id === parseInt(idParam))
    if (report) selectReport(report)
  }
})
</script>

<style scoped>
.empty-list {
  padding: 2rem;
  text-align: center;
  color: var(--ui-text-muted);
}

.report-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.report-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.reporter {
  color: var(--ui-text-muted);
}

.report-date {
  display: flex;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--ui-text-muted);
  margin-top: 0.25rem;
}

.field-count {
  color: var(--ui-text-dimmed);
}

.header-info {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}


.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  font-size: 0.875rem;
}

.info-label {
  font-weight: 500;
  margin-right: 0.5rem;
  color: var(--ui-text-muted);
}

.changes-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.change-row {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 0.75rem;
}

.change-field {
  font-weight: 500;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
  color: var(--ui-text-muted);
}

.change-values {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.change-current,
.change-proposed {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.value-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
  letter-spacing: 0.05em;
}

.value-text {
  font-size: 0.875rem;
  word-break: break-word;
}

.value-text.proposed {
  font-weight: 500;
  color: var(--ui-color-success);
}

.change-arrow {
  flex-shrink: 0;
  color: var(--ui-text-dimmed);
}

.review-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.review-notes-text {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  white-space: pre-wrap;
}

.field-update-row {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-update-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.field-update-label {
  font-weight: 500;
  font-size: 0.875rem;
}

.field-update-current {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.field-update-current span {
  color: var(--ui-text);
}

.filter-select {
  flex: 1;
  min-width: 120px;
}

@media (max-width: 640px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  .change-values {
    flex-direction: column;
    align-items: stretch;
  }
  .change-arrow {
    transform: rotate(90deg);
    align-self: center;
  }
}
</style>

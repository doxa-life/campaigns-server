<template>
  <USlideover v-model:open="isOpen" side="right" title="Adopted by">
    <template #body>
      <div v-if="adoption" class="slideover-body">
        <NuxtLink v-if="linkTo" :to="linkTo" class="adoption-link">
          {{ title }}
        </NuxtLink>

        <UFormField label="Status">
          <USelect
            :model-value="adoption.status"
            :items="statusOptions"
            value-key="value"
            class="w-full"
            @update:model-value="updateStatus($event as string)"
          />
        </UFormField>

        <UFormField label="Show Publicly">
          <UCheckbox
            :model-value="adoption.show_publicly"
            label="Show church name on people group page"
            @update:model-value="updateField('show_publicly', $event)"
          />
        </UFormField>

        <div v-if="adoption.adopted_at" class="info-row">
          <span class="label">Adopted:</span>
          <span class="value">{{ formatDate(adoption.adopted_at) }}</span>
        </div>

        <div class="info-row">
          <span class="label">Update Link:</span>
          <div class="link-container">
            <span class="value link-text">{{ updateUrl }}</span>
            <UButton size="xs" variant="ghost" icon="i-lucide-copy" @click="copyLink" />
          </div>
        </div>

        <UButton
          variant="outline"
          icon="i-lucide-send"
          :loading="sendingReminder"
          @click="sendReminder"
        >
          Send Update Request
        </UButton>

        <div class="reports-section">
          <div class="reports-header">
            <span class="label">Reports ({{ adoption.report_count }})</span>
            <UButton v-if="adoption.report_count > 0" size="xs" variant="outline" @click="loadReports">
              {{ reports ? 'Refresh' : 'Load' }}
            </UButton>
          </div>

          <div v-if="reports" class="reports-list">
            <div v-for="report in reports" :key="report.id" class="report-item">
              <div class="report-header">
                <UBadge
                  :label="report.status"
                  :color="report.status === 'approved' ? 'success' : report.status === 'rejected' ? 'error' : 'warning'"
                  size="xs"
                />
                <span class="report-date">{{ formatDateTime(report.submitted_at) }}</span>
              </div>
              <div v-if="report.praying_count" class="report-field">
                Praying: {{ report.praying_count }}
              </div>
              <div v-if="report.stories" class="report-field">
                Stories: {{ report.stories }}
              </div>
              <div v-if="report.comments" class="report-field">
                Comments: {{ report.comments }}
              </div>
              <div class="report-actions">
                <UButton
                  v-if="report.status !== 'approved'"
                  size="xs" variant="outline" color="success"
                  @click="updateReportStatus(report.id, 'approved')"
                >Approve</UButton>
                <UButton
                  v-if="report.status !== 'rejected'"
                  size="xs" variant="outline" color="error"
                  @click="updateReportStatus(report.id, 'rejected')"
                >Reject</UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="slideover-footer">
        <UButton variant="outline" color="error" @click="showDeleteConfirm = true">
          Remove Adoption
        </UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="showDeleteConfirm" title="Remove Adoption">
    <template #body>
      <div class="confirm-body">
        <p>This will permanently remove this adoption and all associated reports.</p>
        <p class="confirm-suggestion">Consider making the adoption inactive instead to preserve the history.</p>
      </div>
    </template>
    <template #footer>
      <div class="confirm-actions">
        <UButton variant="outline" @click="showDeleteConfirm = false">Cancel</UButton>
        <UButton variant="outline" @click="makeInactive">Make Inactive</UButton>
        <UButton color="error" @click="handleDelete">Remove</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { Adoption, AdoptionReport } from '~/types/adoption'

const props = defineProps<{
  adoption: Adoption | null
  title?: string
  linkTo?: string
}>()

const isOpen = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  change: []
  delete: [adoption: Adoption]
}>()

const toast = useToast()
const reports = ref<AdoptionReport[] | null>(null)
const sendingReminder = ref(false)
const showDeleteConfirm = ref(false)

const statusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
]

const updateUrl = computed(() => {
  if (!props.adoption) return ''
  const baseUrl = import.meta.client ? window.location.origin : ''
  return `${baseUrl}/adoption/update/${props.adoption.update_token}`
})

watch(() => props.adoption?.id, () => {
  reports.value = null
})

async function updateStatus(status: string) {
  if (!props.adoption) return
  try {
    await $fetch(`/api/admin/groups/${props.adoption.group_id}/adoptions/${props.adoption.id}`, {
      method: 'PUT',
      body: { status }
    })
    emit('change')
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update', color: 'error' })
  }
}

async function updateField(field: string, value: any) {
  if (!props.adoption) return
  try {
    await $fetch(`/api/admin/groups/${props.adoption.group_id}/adoptions/${props.adoption.id}`, {
      method: 'PUT',
      body: { [field]: value }
    })
    emit('change')
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update', color: 'error' })
  }
}

async function loadReports() {
  if (!props.adoption) return
  try {
    const res = await $fetch<{ reports: AdoptionReport[] }>(
      `/api/admin/groups/${props.adoption.group_id}/adoptions/${props.adoption.id}/reports`
    )
    reports.value = res.reports
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to load reports', color: 'error' })
  }
}

async function updateReportStatus(reportId: number, status: string) {
  try {
    await $fetch(`/api/admin/adoption-reports/${reportId}`, {
      method: 'PUT',
      body: { status }
    })
    await loadReports()
    toast.add({ title: 'Report updated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update', color: 'error' })
  }
}

async function sendReminder() {
  if (!props.adoption) return
  try {
    sendingReminder.value = true
    const res = await $fetch<{ sentTo: string }>(
      `/api/admin/groups/${props.adoption.group_id}/adoptions/${props.adoption.id}/send-reminder`,
      { method: 'POST' }
    )
    toast.add({ title: 'Update request sent', description: `Email sent to ${res.sentTo}`, color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to send', color: 'error' })
  } finally {
    sendingReminder.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(updateUrl.value)
    toast.add({ title: 'Copied!', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to copy', color: 'error' })
  }
}

function handleDelete() {
  if (!props.adoption) return
  showDeleteConfirm.value = false
  isOpen.value = false
  emit('delete', props.adoption)
}

async function makeInactive() {
  if (!props.adoption) return
  showDeleteConfirm.value = false
  await updateStatus('inactive')
}

</script>

<style scoped>
.slideover-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.adoption-link {
  font-weight: 500;
  color: var(--ui-text);
  text-decoration: underline;
  text-underline-offset: 2px;
  font-size: 1rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ui-border);
  font-size: 0.875rem;
}

.info-row .label { font-weight: 500; }
.info-row .value { color: var(--ui-text-muted); }

.link-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.link-text {
  font-size: 0.75rem;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reports-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reports-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
  font-weight: 500;
}

.reports-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.report-item {
  padding: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  font-size: 0.8125rem;
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.report-date {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.report-field {
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  margin-bottom: 0.25rem;
}

.report-actions {
  display: flex;
  gap: 0.375rem;
  margin-top: 0.375rem;
}

.slideover-footer {
  display: flex;
  justify-content: flex-end;
}

.confirm-body p {
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

.confirm-body p:last-child {
  margin-bottom: 0;
}

.confirm-suggestion {
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  width: 100%;
}
</style>

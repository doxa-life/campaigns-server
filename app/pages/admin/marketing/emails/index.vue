<template>
  <div class="emails-page">
    <div class="page-header">
      <div>
        <h1>Marketing Emails</h1>
        <p class="subtitle">Create and manage marketing emails</p>
      </div>
      <UButton @click="navigateTo('/admin/marketing/emails/new')" size="lg">
        + New Email
      </UButton>
    </div>

    <div class="filters">
      <USelect
        v-model="statusFilter"
        :items="statusOptions"
        placeholder="All statuses"
        class="filter-select"
      />
    </div>

    <div v-if="loading" class="loading">Loading emails...</div>

    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else-if="filteredEmails.length === 0" class="empty-state">
      <p>No emails yet. Create your first marketing email to get started.</p>
      <UButton @click="navigateTo('/admin/marketing/emails/new')" size="lg">
        Create Email
      </UButton>
    </div>

    <div v-else class="emails-table-container">
      <table class="emails-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Audience</th>
            <th>Status</th>
            <th>Recipients</th>
            <th>Unsubscribes</th>
            <th>Author</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="email in filteredEmails"
            :key="email.id"
            class="email-row"
            @click="navigateTo(`/admin/marketing/emails/${email.id}`)"
          >
            <td class="subject-cell">{{ email.subject }}</td>
            <td class="audience-cell">
              <UBadge
                :label="audienceLabel(email)"
                variant="subtle"
                color="neutral"
              />
            </td>
            <td>
              <UBadge
                :label="email.status"
                :color="getStatusColor(email.status)"
                :variant="email.status === 'draft' ? 'outline' : 'solid'"
              />
            </td>
            <td class="recipients-cell">
              <template v-if="email.status === 'draft'">-</template>
              <template v-else>
                {{ email.sent_count }}/{{ email.recipient_count }}
                <span v-if="email.failed_count > 0" class="failed-count">({{ email.failed_count }} failed)</span>
              </template>
            </td>
            <td class="recipients-cell">
              <template v-if="email.status === 'draft'">-</template>
              <template v-else>{{ email.unsubscribe_count }}</template>
            </td>
            <td class="author-cell">
              <div class="author-info">
                <div class="author-row" :title="email.created_by_email">
                  <span class="author-label">Created:</span>
                  <span class="author-name">{{ email.created_by_name || email.created_by_email || '-' }}</span>
                </div>
                <div v-if="(email.updated_by_name || email.updated_by_email) && email.updated_by_email !== email.created_by_email" class="author-row" :title="email.updated_by_email">
                  <span class="author-label">Edited:</span>
                  <span class="author-name">{{ email.updated_by_name || email.updated_by_email }}</span>
                </div>
                <div v-if="email.sent_by_name || email.sent_by_email" class="author-row" :title="email.sent_by_email">
                  <span class="author-label">Sent:</span>
                  <span class="author-name">{{ email.sent_by_name || email.sent_by_email }}</span>
                </div>
              </div>
            </td>
            <td class="date-cell">{{ formatDate(email.updated_at) }}</td>
            <td class="actions-cell">
              <UButton
                @click.stop="navigateTo(`/admin/marketing/emails/${email.id}`)"
                variant="link"
                size="sm"
              >
                {{ email.status === 'draft' ? 'Edit' : 'View' }}
              </UButton>
              <UButton
                v-if="email.status === 'draft'"
                @click.stop="deleteEmail(email)"
                variant="link"
                size="sm"
                color="neutral"
                class="delete-btn"
              >
                Delete
              </UButton>
              <UButton
                v-if="email.status === 'queued' || email.status === 'sending'"
                @click.stop="stopEmail(email)"
                variant="link"
                size="sm"
                color="error"
              >
                Stop
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmModal
      v-model:open="showDeleteModal"
      title="Delete Email"
      :message="emailToDelete ? `Are you sure you want to delete &quot;${emailToDelete.subject}&quot;?` : ''"
      warning="This action cannot be undone."
      confirm-text="Delete"
      confirm-color="primary"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />

    <ConfirmModal
      v-model:open="showStopModal"
      title="Stop sending?"
      :message="emailToStop ? `Stop sending &quot;${emailToStop.subject}&quot;? Recipients not yet emailed won't receive it.` : ''"
      warning="Emails already in flight may still go out."
      confirm-text="Stop sending"
      confirm-color="error"
      :loading="stopping"
      @confirm="confirmStop"
      @cancel="cancelStop"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface MarketingEmail {
  id: number
  subject: string
  content_json: string
  audience_type: 'doxa' | 'people_group' | 'admins' | 'doxa_active_pg' | 'active_pg' | 'pick'
  people_group_id: number | null
  people_group_name?: string
  recipient_contact_method_ids?: number[] | null
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'
  recipient_count: number
  sent_count: number
  failed_count: number
  unsubscribe_count: number
  created_at: string
  updated_at: string
  created_by_name?: string
  created_by_email?: string
  updated_by_name?: string
  updated_by_email?: string
  sent_by_name?: string
  sent_by_email?: string
}

const emails = ref<MarketingEmail[]>([])
const loading = ref(true)
const error = ref('')

function audienceLabel(email: MarketingEmail): string {
  switch (email.audience_type) {
    case 'doxa': return 'DOXA'
    case 'doxa_active_pg': return 'Active Subscribers with Doxa General Consent'
    case 'active_pg': return 'All Active Subscribers'
    case 'pick': return `Picked Contacts (${email.recipient_contact_method_ids?.length ?? 0})`
    case 'admins': return 'Admins (test)'
    default: return email.people_group_name || 'People Group'
  }
}
const statusFilter = ref('all')
const toast = useToast()

const showDeleteModal = ref(false)
const emailToDelete = ref<MarketingEmail | null>(null)
const deleting = ref(false)

const showStopModal = ref(false)
const emailToStop = ref<MarketingEmail | null>(null)
const stopping = ref(false)

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Queued', value: 'queued' },
  { label: 'Sending', value: 'sending' },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' }
]

const filteredEmails = computed(() => {
  if (statusFilter.value === 'all') return emails.value
  return emails.value.filter(e => e.status === statusFilter.value)
})

type BadgeColor = 'error' | 'info' | 'primary' | 'secondary' | 'success' | 'warning' | 'neutral'

function getStatusColor(status: string): BadgeColor {
  const colors: Record<string, BadgeColor> = {
    draft: 'neutral',
    queued: 'warning',
    sending: 'info',
    sent: 'success',
    failed: 'error',
    cancelled: 'neutral'
  }
  return colors[status] || 'neutral'
}

async function loadEmails() {
  try {
    loading.value = true
    error.value = ''
    const response = await $fetch<{ emails: MarketingEmail[] }>('/api/admin/marketing/emails')
    emails.value = response.emails
  } catch (err: any) {
    error.value = 'Failed to load emails'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function deleteEmail(email: MarketingEmail) {
  emailToDelete.value = email
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!emailToDelete.value) return

  try {
    deleting.value = true
    await $fetch(`/api/admin/marketing/emails/${emailToDelete.value.id}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Email deleted',
      description: 'The email draft has been deleted.',
      color: 'success'
    })

    showDeleteModal.value = false
    emailToDelete.value = null
    await loadEmails()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to delete email',
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

function cancelDelete() {
  showDeleteModal.value = false
  emailToDelete.value = null
}

function stopEmail(email: MarketingEmail) {
  emailToStop.value = email
  showStopModal.value = true
}

async function confirmStop() {
  if (!emailToStop.value) return

  try {
    stopping.value = true
    await $fetch(`/api/admin/marketing/emails/${emailToStop.value.id}/cancel`, {
      method: 'POST'
    })

    toast.add({
      title: 'Sending stopped',
      description: 'No further recipients will be emailed.',
      color: 'success'
    })

    showStopModal.value = false
    emailToStop.value = null
    await loadEmails()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to stop sending',
      color: 'error'
    })
  } finally {
    stopping.value = false
  }
}

function cancelStop() {
  showStopModal.value = false
  emailToStop.value = null
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString()
}

// Auto-refresh when emails are being processed
const hasEmailsInProgress = computed(() => {
  return emails.value.some(e => e.status === 'queued' || e.status === 'sending')
})

let refreshInterval: ReturnType<typeof setInterval> | null = null

function startAutoRefresh() {
  if (refreshInterval) return
  refreshInterval = setInterval(async () => {
    if (hasEmailsInProgress.value) {
      await loadEmails()
    } else {
      stopAutoRefresh()
    }
  }, 5000) // Refresh every 5 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

watch(hasEmailsInProgress, (inProgress) => {
  if (inProgress) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

onMounted(() => {
  loadEmails()
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.emails-page {
  max-width: 1200px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  margin: 0 0 0.5rem;
}

.subtitle {
  margin: 0;
  color: var(--ui-text-muted);
}

.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.filter-select {
  width: 200px;
}

.loading, .error {
  text-align: center;
  padding: 2rem;
}

.error {
  color: var(--text-muted);
}

.empty-state {
  text-align: center;
  padding: 3rem;
}

.empty-state p {
  margin-bottom: 1.5rem;
  color: var(--ui-text-muted);
}

.emails-table-container {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
}

.emails-table {
  width: 100%;
  border-collapse: collapse;
}

.emails-table thead {
  background-color: var(--ui-bg-elevated);
  border-bottom: 2px solid var(--ui-border);
}

.emails-table th {
  text-align: left;
  padding: 1rem;
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.emails-table tbody tr {
  border-bottom: 1px solid var(--ui-border);
  transition: background-color 0.2s;
  cursor: pointer;
}

.emails-table tbody tr:hover {
  background-color: var(--ui-bg-elevated);
}

.emails-table tbody tr:last-child {
  border-bottom: none;
}

.emails-table td {
  padding: 1rem;
  vertical-align: middle;
}

.subject-cell {
  font-weight: 500;
}

.audience-cell {
  font-size: 0.875rem;
}

.recipients-cell {
  font-size: 0.875rem;
}

.failed-count {
  color: var(--color-error);
}

.author-cell {
  font-size: 0.875rem;
}

.author-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.author-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.author-label {
  color: var(--ui-text-muted);
  font-size: 0.75rem;
  min-width: 50px;
}

.author-name {
  color: var(--ui-text);
}

.date-cell {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.actions-cell {
  white-space: nowrap;
  display: flex;
  gap: 0.25rem;
}

.delete-btn {
  color: var(--ui-text-muted);
}
</style>

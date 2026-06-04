<template>
  <div class="editor-page">
    <div v-if="loading" class="loading-state">Loading email...</div>

    <div v-else-if="error" class="error-state">{{ error }}</div>

    <template v-else-if="email">
      <div class="editor-header">
        <NuxtLink to="/admin/marketing/emails" class="back-link">
          ← Back to Emails
        </NuxtLink>
        <div class="flex gap-2" v-if="isDraft">
          <UButton @click="navigateTo('/admin/marketing/emails')" variant="outline">
            Cancel
          </UButton>
          <UButton @click="previewEmail" variant="outline" :disabled="!canPreview">
            Preview
          </UButton>
          <UButton @click="saveEmail" :loading="saving" :disabled="!canSave">
            Save Draft
          </UButton>
          <UButton @click="sendEmail" :loading="sending" :disabled="!canSend" color="primary">
            Send Now
          </UButton>
        </div>
        <div v-else>
          <UBadge
            :label="email.status"
            :color="getStatusColor(email.status)"
            size="lg"
          />
        </div>
      </div>

      <!-- Draft: Editable Form -->
      <div v-if="isDraft" class="editor-container">
        <div class="editor-main">
          <div class="editor-details">
            Edit Email
          </div>

          <div class="form-section">
            <UFormField label="Subject" required>
              <UInput
                v-model="form.subject"
                placeholder="Enter email subject"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="form-section" v-if="senderOptions.length">
            <UFormField label="From" :help="senderHelp">
              <USelect
                v-model="form.sender_id"
                :items="senderOptions"
                value-key="value"
                placeholder="Select a sender"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="form-section">
            <UFormField label="Audience" required>
              <div class="audience-options">
                <div
                  v-if="isAdmin"
                  class="audience-option"
                  :class="{ selected: form.audience_type === 'doxa' }"
                  @click="selectAudience('doxa')"
                >
                  <input type="radio" v-model="form.audience_type" value="doxa" />
                  <span class="option-title">DOXA General</span>
                  <span class="option-description">All subscribers who opted in to DOXA updates</span>
                  <span class="option-count" v-if="doxaCount !== null">{{ doxaCount }} recipients</span>
                </div>

                <div
                  class="audience-option"
                  :class="{ selected: form.audience_type === 'people_group' }"
                  @click="selectAudience('people_group')"
                >
                  <input type="radio" v-model="form.audience_type" value="people_group" />
                  <span class="option-title">People Group</span>
                  <USelectMenu
                    v-if="form.audience_type === 'people_group'"
                    v-model="form.people_group_id"
                    :items="peopleGroupOptions"
                    placeholder="Select a people group"
                    class="people-group-select"
                    virtualize
                    value-key="value"
                    @update:model-value="loadPeopleGroupCount"
                  />
                  <span v-else class="option-description">Subscribers who opted in to a specific people group</span>
                  <span class="option-count" v-if="form.audience_type === 'people_group' && peopleGroupCount !== null">
                    {{ peopleGroupCount }} recipients
                  </span>
                </div>

                <div
                  class="audience-option"
                  :class="{ selected: form.audience_type === 'admins' }"
                  @click="selectAudience('admins')"
                >
                  <input type="radio" v-model="form.audience_type" value="admins" />
                  <span class="option-title">Admins</span>
                  <span class="option-description">Send only to admin users — for testing</span>
                  <span class="option-count" v-if="adminCount !== null">{{ adminCount }} recipients</span>
                </div>
              </div>
            </UFormField>
          </div>

          <div class="form-section">
            <UFormField label="Content" required>
              <RichTextEditor v-model="form.content" />
            </UFormField>
          </div>
        </div>
      </div>

      <!-- Sent/Queued: Read-only View -->
      <div v-else class="editor-container">
        <div class="editor-main">
          <div class="editor-details">
            {{ email.status === 'sent' ? 'Sent' : email.status === 'sending' ? 'Sending' : 'Queued' }}
            <span v-if="email.sent_at"> • {{ formatDateTime(email.sent_at) }}</span>
          </div>

          <div class="view-section">
            <label>Subject</label>
            <p class="view-value">{{ email.subject }}</p>
          </div>

          <div class="view-section">
            <label>Audience</label>
            <p class="view-value">
              <UBadge
                :label="email.audience_type === 'doxa' ? 'Doxa General' : email.audience_type === 'admins' ? 'Admins (test)' : email.people_group_name || 'People Group'"
                variant="subtle"
                color="neutral"
              />
            </p>
          </div>

          <div class="view-section" v-if="email.sender_name">
            <label>From</label>
            <p class="view-value">{{ email.sender_name }} &lt;{{ email.sender_local_part }}@{{ senderDomain || '…' }}&gt;</p>
          </div>

          <div class="view-section" v-if="queueStats">
            <label>Delivery Stats</label>
            <div class="stats-grid">
              <div class="stat">
                <span class="stat-value">{{ queueStats.total }}</span>
                <span class="stat-label">Total</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ queueStats.sent }}</span>
                <span class="stat-label">Sent</span>
              </div>
              <div class="stat" v-if="queueStats.pending > 0 || queueStats.processing > 0">
                <span class="stat-value">{{ queueStats.pending + queueStats.processing }}</span>
                <span class="stat-label">Pending</span>
              </div>
              <div class="stat" v-if="queueStats.failed > 0">
                <span class="stat-value error">{{ queueStats.failed }}</span>
                <span class="stat-label">Failed</span>
              </div>
            </div>
          </div>

          <div class="view-section">
            <label>Content Preview</label>
            <div class="content-preview" v-html="previewHtml"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- Preview Modal -->
    <UModal v-model:open="showPreview" title="Email Preview" :ui="{ content: 'max-w-4xl' }">
      <template #body>
        <div class="preview-content">
          <div class="preview-subject">
            <strong>Subject:</strong> {{ form.subject }}
          </div>
          <div class="preview-frame" v-html="modalPreviewHtml"></div>
        </div>
      </template>
      <template #footer>
        <UButton @click="showPreview = false">Close</UButton>
      </template>
    </UModal>

    <!-- Unsaved Changes Modal -->
    <ConfirmModal
      v-model:open="showUnsavedChangesModal"
      title="Leave Without Saving?"
      message="Your changes will be lost."
      confirm-text="Leave"
      confirm-color="primary"
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const route = useRoute()
const { isAdmin } = useAuthUser()
const toast = useToast()

interface MarketingEmail {
  id: number
  subject: string
  content_json: string
  audience_type: 'doxa' | 'people_group' | 'admins'
  people_group_id: number | null
  people_group_name?: string
  sender_id: number | null
  sender_name?: string
  sender_local_part?: string
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'failed'
  sent_at: string | null
  created_at: string
  updated_at: string
}

interface QueueStats {
  total: number
  pending: number
  processing: number
  sent: number
  failed: number
}

const email = ref<MarketingEmail | null>(null)
const queueStats = ref<QueueStats | null>(null)
const loading = ref(true)
const error = ref('')

const form = ref({
  subject: '',
  audience_type: '' as 'doxa' | 'people_group' | 'admins' | '',
  people_group_id: undefined as number | undefined,
  sender_id: undefined as number | undefined,
  content: { type: 'doc', content: [{ type: 'paragraph' }] } as any
})

const originalForm = ref<string>('')

const peopleGroups = ref<{ id: number; title: string }[]>([])
const doxaCount = ref<number | null>(null)
const peopleGroupCount = ref<number | null>(null)
const adminCount = ref<number | null>(null)

interface Sender { id: number; name: string; local_part: string }
const senders = ref<Sender[]>([])
const senderDomain = ref('')

const senderOptions = computed(() =>
  senders.value.map(s => ({ label: `${s.name} (${s.local_part}@${senderDomain.value || '…'})`, value: s.id }))
)

const senderHelp = computed(() =>
  senderDomain.value ? '' : 'Marketing domain not configured — sends fall back to the default From.'
)
const saving = ref(false)
const sending = ref(false)
const showPreview = ref(false)
const modalPreviewHtml = ref('')
const previewHtml = ref('')
const isSaved = ref(false)
const showUnsavedChangesModal = ref(false)
const pendingNavigation = ref<any>(null)

const isDraft = computed(() => email.value?.status === 'draft')

const peopleGroupOptions = computed(() => {
  return peopleGroups.value.map(c => ({
    label: c.title,
    value: c.id
  }))
})

const canPreview = computed(() => {
  return form.value.subject && form.value.content
})

const canSave = computed(() => {
  if (!form.value.subject || !form.value.audience_type || !form.value.content) return false
  if (form.value.audience_type === 'people_group') return !!form.value.people_group_id
  return true
})

const canSend = computed(() => {
  if (!canSave.value) return false
  if (senderOptions.value.length > 0 && !form.value.sender_id) return false
  if (form.value.audience_type === 'doxa') return !!(doxaCount.value && doxaCount.value > 0)
  if (form.value.audience_type === 'people_group') return !!(peopleGroupCount.value && peopleGroupCount.value > 0)
  if (form.value.audience_type === 'admins') return !!(adminCount.value && adminCount.value > 0)
  return false
})

const hasUnsavedChanges = computed(() => {
  return JSON.stringify(form.value) !== originalForm.value
})

type BadgeColor = 'error' | 'info' | 'primary' | 'secondary' | 'success' | 'warning' | 'neutral'

function getStatusColor(status: string): BadgeColor {
  const colors: Record<string, BadgeColor> = {
    draft: 'neutral',
    queued: 'warning',
    sending: 'info',
    sent: 'success',
    failed: 'error'
  }
  return colors[status] || 'neutral'
}

function selectAudience(type: 'doxa' | 'people_group' | 'admins') {
  form.value.audience_type = type
  if (type !== 'people_group') {
    form.value.people_group_id = undefined
    peopleGroupCount.value = null
  }
}

async function loadEmail() {
  const id = route.params.id
  try {
    loading.value = true
    error.value = ''

    const response = await $fetch<{ email: MarketingEmail; queueStats?: QueueStats }>(`/api/admin/marketing/emails/${id}`)
    email.value = response.email
    queueStats.value = response.queueStats || null

    if (response.email.status === 'draft') {
      form.value = {
        subject: response.email.subject,
        audience_type: response.email.audience_type,
        people_group_id: response.email.people_group_id ?? undefined,
        sender_id: response.email.sender_id ?? undefined,
        content: response.email.content_json
      }
      originalForm.value = JSON.stringify(form.value)
      applySingleSenderDefault()

      if (response.email.audience_type === 'people_group' && response.email.people_group_id) {
        void loadPeopleGroupCount()
      }
    } else {
      const previewResponse = await $fetch<{ html: string }>(`/api/admin/marketing/emails/${id}/preview`)
      previewHtml.value = previewResponse.html
    }
  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to load email'
  } finally {
    loading.value = false
  }
}

async function loadPeopleGroups() {
  try {
    const response = await $fetch<{ peopleGroups: { id: number; name: string }[] }>('/api/admin/people-groups')
    peopleGroups.value = response.peopleGroups.map(pg => ({ id: pg.id, title: pg.name }))
  } catch (error) {
    console.error('Failed to load people groups:', error)
  }
}

async function loadDoxaCount() {
  if (!isAdmin.value) return
  try {
    const response = await $fetch<{ count: number }>('/api/admin/marketing/audience/doxa')
    doxaCount.value = response.count
  } catch (error) {
    console.error('Failed to load Doxa count:', error)
  }
}

async function loadAdminCount() {
  try {
    const response = await $fetch<{ count: number }>('/api/admin/marketing/audience/admins')
    adminCount.value = response.count
  } catch (error) {
    console.error('Failed to load admin count:', error)
  }
}

// No default sender: only auto-select when there's a single sender. Called after
// both the email and the sender list load, since either may resolve first.
function applySingleSenderDefault() {
  const [onlySender] = senders.value
  if (!form.value.sender_id && senders.value.length === 1 && onlySender) {
    form.value.sender_id = onlySender.id
  }
}

async function loadSenders() {
  try {
    const response = await $fetch<{ senders: Sender[]; domain: string }>('/api/admin/marketing/senders')
    senders.value = response.senders || []
    senderDomain.value = response.domain || ''
    applySingleSenderDefault()
  } catch (error) {
    console.error('Failed to load senders:', error)
  }
}

async function loadPeopleGroupCount() {
  if (!form.value.people_group_id) {
    peopleGroupCount.value = null
    return
  }
  try {
    const response = await $fetch<{ count: number }>(`/api/admin/marketing/audience/people-group/${form.value.people_group_id}`)
    peopleGroupCount.value = response.count
  } catch (error) {
    console.error('Failed to load people group count:', error)
  }
}

async function saveEmail() {
  if (!canSave.value || !email.value) return

  try {
    saving.value = true

    await $fetch(`/api/admin/marketing/emails/${email.value.id}`, {
      method: 'PUT',
      body: {
        subject: form.value.subject,
        content_json: form.value.content,
        audience_type: form.value.audience_type,
        people_group_id: form.value.people_group_id,
        sender_id: form.value.sender_id
      }
    })

    originalForm.value = JSON.stringify(form.value)
    isSaved.value = true

    toast.add({
      title: 'Draft saved',
      description: 'Your changes have been saved.',
      color: 'success'
    })

    await loadEmail()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to save email',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function sendEmail() {
  if (!canSend.value || !email.value) return

  try {
    saving.value = true

    await $fetch(`/api/admin/marketing/emails/${email.value.id}`, {
      method: 'PUT',
      body: {
        subject: form.value.subject,
        content_json: form.value.content,
        audience_type: form.value.audience_type,
        people_group_id: form.value.people_group_id,
        sender_id: form.value.sender_id
      }
    })

    saving.value = false
    sending.value = true

    const sendResponse = await $fetch<{ success: boolean; recipient_count: number }>(`/api/admin/marketing/emails/${email.value.id}/send`, {
      method: 'POST'
    })

    isSaved.value = true

    toast.add({
      title: 'Email queued',
      description: `Your email is being sent to ${sendResponse.recipient_count} recipients.`,
      color: 'success'
    })

    navigateTo('/admin/marketing/emails')
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to send email',
      color: 'error'
    })
  } finally {
    saving.value = false
    sending.value = false
  }
}

async function previewEmail() {
  if (!canPreview.value || !email.value) return

  try {
    await $fetch(`/api/admin/marketing/emails/${email.value.id}`, {
      method: 'PUT',
      body: {
        subject: form.value.subject,
        content_json: form.value.content,
        audience_type: form.value.audience_type || 'doxa',
        people_group_id: form.value.people_group_id,
        sender_id: form.value.sender_id
      }
    })

    const previewResponse = await $fetch<{ html: string }>(`/api/admin/marketing/emails/${email.value.id}/preview`)
    modalPreviewHtml.value = previewResponse.html
    showPreview.value = true
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to preview email',
      color: 'error'
    })
  }
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString()
}

function confirmLeave() {
  isSaved.value = true
  showUnsavedChangesModal.value = false
  if (pendingNavigation.value) {
    pendingNavigation.value()
  }
}

function cancelLeave() {
  showUnsavedChangesModal.value = false
  pendingNavigation.value = null
}

onBeforeRouteLeave((_to, _from, next) => {
  if (isSaved.value || !isDraft.value || !hasUnsavedChanges.value) {
    next()
  } else {
    pendingNavigation.value = next
    showUnsavedChangesModal.value = true
  }
})

onMounted(() => {
  loadEmail()
  loadPeopleGroups()
  loadAdminCount()
  loadSenders()
  if (isAdmin.value) {
    loadDoxaCount()
  }
})
</script>

<style scoped>
.editor-page {
  position: fixed;
  top: 0;
  left: 250px;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg);
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ui-text-muted);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.back-link {
  color: var(--ui-text-muted);
  text-decoration: none;
  font-size: 0.875rem;
}

.back-link:hover {
  color: var(--ui-text);
}

.editor-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-main {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.editor-details {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.form-section {
  margin-bottom: 1.5rem;
}

.audience-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.audience-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 0.625rem 0.875rem;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.audience-option:hover {
  border-color: var(--ui-text-muted);
}

.audience-option.selected {
  border-color: var(--ui-text);
  background-color: var(--ui-bg-elevated);
}

.option-title {
  font-weight: 600;
  white-space: nowrap;
}

.option-description {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-count {
  margin: 0;
  margin-left: auto;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

.people-group-select {
  flex: 1;
  min-width: 200px;
  margin: 0;
}

.view-section {
  margin-bottom: 1.5rem;
}

.view-section label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  color: var(--ui-text-muted);
  margin-bottom: 0.5rem;
}

.view-value {
  margin: 0;
  font-size: 1rem;
}

.stats-grid {
  display: flex;
  gap: 2rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 600;
}

.stat-value.error {
  color: var(--color-error);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.content-preview {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  max-height: 500px;
  overflow-y: auto;
}

.preview-content {
  padding: 1rem;
}

.preview-subject {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.preview-frame {
  max-height: 500px;
  overflow-y: auto;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
}

@media (max-width: 768px) {
  .editor-page {
    left: 0;
  }
}
</style>

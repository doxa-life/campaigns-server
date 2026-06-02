<template>
  <div class="editor-page">
    <div class="editor-header">
      <NuxtLink to="/admin/marketing/emails" class="back-link">
        ← Back to Emails
      </NuxtLink>
      <div class="flex gap-2">
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
    </div>

    <div class="editor-container">
      <div class="editor-main">
        <div class="editor-details">
          New Email
        </div>

        <div class="form-section" v-if="templateOptions.length > 1">
          <UFormField label="Template">
            <USelect
              v-model="form.template"
              :items="templateOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="form-section" v-if="form.template === 'default'">
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
                v-if="isAdmin"
                class="audience-option"
                :class="{ selected: form.audience_type === 'doxa_active_pg' }"
                @click="selectAudience('doxa_active_pg')"
              >
                <input type="radio" v-model="form.audience_type" value="doxa_active_pg" />
                <span class="option-title">Doxa Active People Group Subscribers</span>
                <span class="option-description">Opted in to DOXA updates and have an active people group subscription</span>
                <span class="option-count" v-if="doxaActivePgCount !== null">{{ doxaActivePgCount }} recipients</span>
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
                v-if="isAdmin"
                class="audience-option"
                :class="{ selected: form.audience_type === 'pick' }"
                @click="selectAudience('pick')"
              >
                <input type="radio" v-model="form.audience_type" value="pick" />
                <span class="option-title">Pick contacts</span>
                <USelectMenu
                  v-if="form.audience_type === 'pick'"
                  v-model="pickedContacts"
                  :items="contactItems"
                  multiple
                  :ignore-filter="true"
                  :loading="contactSearchLoading"
                  placeholder="Search subscribers by name or email"
                  class="contact-select"
                  :ui="{ base: 'min-w-0', value: 'min-w-0' }"
                  @update:search-term="onContactSearch"
                />
                <span v-else class="option-description">Choose specific subscribers to send to</span>
                <span class="option-count" v-if="form.audience_type === 'pick'">{{ pickedContacts.length }} selected</span>
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

        <div class="form-section" v-if="form.template === 'default'">
          <UFormField label="Content" required>
            <RichTextEditor v-model="form.content" />
          </UFormField>
        </div>

        <div class="form-section" v-else>
          <UAlert
            icon="i-lucide-info"
            color="info"
            variant="soft"
            title="Predefined template"
            description="This email uses a predefined template. Its subject and content are set automatically and sent in each subscriber's language. Use Preview to see it."
          />
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
    <UModal v-model:open="showPreview" title="Email Preview" :ui="{ content: 'max-w-4xl' }">
      <template #body>
        <div class="preview-content">
          <div class="preview-subject">
            <strong>Subject:</strong> {{ form.subject }}
          </div>
          <div class="preview-frame" v-html="previewHtml"></div>
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

const router = useRouter()
const { isAdmin } = useAuthUser()
const toast = useToast()

type AudienceType = 'doxa' | 'people_group' | 'admins' | 'doxa_active_pg' | 'pick'

const form = ref({
  subject: '',
  template: 'default',
  audience_type: '' as AudienceType | '',
  people_group_id: undefined as number | undefined,
  sender_id: undefined as number | undefined,
  content: { type: 'doc', content: [{ type: 'paragraph' }] }
})

interface ContactOption { label: string; value: number; email: string }
const doxaActivePgCount = ref<number | null>(null)
const pickedContacts = ref<ContactOption[]>([])
const contactItems = ref<ContactOption[]>([])
const contactSearchLoading = ref(false)
let contactSearchTimer: ReturnType<typeof setTimeout> | null = null
const pickedContactIds = computed(() => [...new Set(pickedContacts.value.map(c => c.value))])

interface EmailTemplate { key: string; label: string; subject?: string }
const templates = ref<EmailTemplate[]>([{ key: 'default', label: 'Default (write your own)' }])
const templateOptions = computed(() =>
  templates.value.map(t => ({ label: t.label, value: t.key }))
)

const peopleGroups = ref<{ id: number; title: string }[]>([])
const doxaCount = ref<number | null>(null)
const peopleGroupCount = ref<number | null>(null)
const adminCount = ref<number | null>(null)

interface Sender { id: number; name: string; local_part: string; is_default: boolean }
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
const previewHtml = ref('')
const isSaved = ref(false)
const showUnsavedChangesModal = ref(false)
const pendingNavigation = ref<any>(null)

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
  if (form.value.audience_type === 'doxa') return !!(doxaCount.value && doxaCount.value > 0)
  if (form.value.audience_type === 'doxa_active_pg') return !!(doxaActivePgCount.value && doxaActivePgCount.value > 0)
  if (form.value.audience_type === 'people_group') return !!(peopleGroupCount.value && peopleGroupCount.value > 0)
  if (form.value.audience_type === 'admins') return !!(adminCount.value && adminCount.value > 0)
  if (form.value.audience_type === 'pick') return pickedContacts.value.length > 0
  return false
})

const hasActualContent = computed(() => {
  return form.value.subject.trim().length > 0
})

function selectAudience(type: AudienceType) {
  form.value.audience_type = type
  if (type !== 'people_group') {
    form.value.people_group_id = undefined
    peopleGroupCount.value = null
  }
  if (type === 'pick' && contactItems.value.length === 0) {
    onContactSearch('')
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

async function loadAdminCount() {
  try {
    const response = await $fetch<{ count: number }>('/api/admin/marketing/audience/admins')
    adminCount.value = response.count
  } catch (error) {
    console.error('Failed to load admin count:', error)
  }
}

async function loadDoxaActivePgCount() {
  if (!isAdmin.value) return
  try {
    const response = await $fetch<{ count: number }>('/api/admin/marketing/audience/doxa-active-pg')
    doxaActivePgCount.value = response.count
  } catch (error) {
    console.error('Failed to load active PG subscriber count:', error)
  }
}

function onContactSearch(term: string) {
  if (contactSearchTimer) clearTimeout(contactSearchTimer)
  contactSearchTimer = setTimeout(async () => {
    contactSearchLoading.value = true
    try {
      const response = await $fetch<{ contacts: { id: number; value: string; name: string }[] }>(
        '/api/admin/marketing/contacts/search',
        { query: { q: term } }
      )
      contactItems.value = response.contacts.map(c => ({
        label: c.name ? `${c.name} (${c.value})` : c.value,
        value: c.id,
        email: c.value
      }))
    } catch (error) {
      console.error('Failed to search contacts:', error)
    } finally {
      contactSearchLoading.value = false
    }
  }, 250)
}

async function loadSenders() {
  try {
    const response = await $fetch<{ senders: Sender[]; domain: string }>('/api/admin/marketing/senders')
    senders.value = response.senders || []
    senderDomain.value = response.domain || ''
    if (!form.value.sender_id) {
      const def = senders.value.find(s => s.is_default)
      if (def) form.value.sender_id = def.id
    }
  } catch (error) {
    console.error('Failed to load senders:', error)
  }
}

async function saveEmail() {
  if (!canSave.value) return

  try {
    saving.value = true

    const response = await $fetch<{ success: boolean; email: { id: number } }>('/api/admin/marketing/emails', {
      method: 'POST',
      body: {
        subject: form.value.subject,
        content_json: form.value.content,
        template: form.value.template,
        audience_type: form.value.audience_type,
        people_group_id: form.value.people_group_id,
        recipient_contact_method_ids: pickedContactIds.value,
        sender_id: form.value.sender_id
      }
    })

    isSaved.value = true

    toast.add({
      title: 'Draft saved',
      description: 'Your email has been saved as a draft.',
      color: 'success'
    })

    navigateTo(`/admin/marketing/emails/${response.email.id}`)
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
  if (!canSend.value) return

  try {
    saving.value = true

    const createResponse = await $fetch<{ success: boolean; email: { id: number } }>('/api/admin/marketing/emails', {
      method: 'POST',
      body: {
        subject: form.value.subject,
        content_json: form.value.content,
        template: form.value.template,
        audience_type: form.value.audience_type,
        people_group_id: form.value.people_group_id,
        recipient_contact_method_ids: pickedContactIds.value,
        sender_id: form.value.sender_id
      }
    })

    saving.value = false
    sending.value = true

    const sendResponse = await $fetch<{ success: boolean; recipient_count: number }>(`/api/admin/marketing/emails/${createResponse.email.id}/send`, {
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
  if (!canPreview.value) return

  try {
    const tempResponse = await $fetch<{ success: boolean; email: { id: number } }>('/api/admin/marketing/emails', {
      method: 'POST',
      body: {
        subject: form.value.subject,
        content_json: form.value.content,
        template: form.value.template,
        audience_type: form.value.audience_type || 'doxa',
        people_group_id: form.value.people_group_id,
        recipient_contact_method_ids: pickedContactIds.value,
        sender_id: form.value.sender_id
      }
    })

    const previewResponse = await $fetch<{ html: string }>(`/api/admin/marketing/emails/${tempResponse.email.id}/preview`)
    previewHtml.value = previewResponse.html
    showPreview.value = true

    await $fetch(`/api/admin/marketing/emails/${tempResponse.email.id}`, {
      method: 'DELETE'
    })
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to preview email',
      color: 'error'
    })
  }
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
  if (isSaved.value || !hasActualContent.value) {
    next()
  } else {
    pendingNavigation.value = next
    showUnsavedChangesModal.value = true
  }
})

async function loadTemplates() {
  try {
    const response = await $fetch<{ templates: EmailTemplate[] }>('/api/admin/marketing/templates')
    if (response.templates?.length) templates.value = response.templates
    // Preselect a template passed via ?template= (e.g. from the survey builder).
    const requested = useRoute().query.template
    if (typeof requested === 'string' && templates.value.some(t => t.key === requested)) {
      form.value.template = requested
    }
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

// A predefined template supplies its own localized subject/content at send time,
// so fill the stored fields from the template and lock editing.
watch(() => form.value.template, (templateKey) => {
  if (templateKey === 'default') return
  const selected = templates.value.find(t => t.key === templateKey)
  form.value.subject = selected?.subject || selected?.label || 'Survey'
  form.value.content = { type: 'doc', content: [{ type: 'paragraph' }] }
})

onMounted(() => {
  loadPeopleGroups()
  loadAdminCount()
  loadSenders()
  loadTemplates()
  if (isAdmin.value) {
    loadDoxaCount()
    loadDoxaActivePgCount()
  } else {
    form.value.audience_type = 'people_group'
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

/* Multi-select can hold many tags; allow it to shrink and stay within the row. */
.contact-select {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  margin: 0;
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

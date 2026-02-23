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

        <div class="form-section">
          <UFormField label="Subject" required>
            <UInput
              v-model="form.subject"
              placeholder="Enter email subject"
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
                <div class="option-header">
                  <input type="radio" v-model="form.audience_type" value="doxa" />
                  <span class="option-title">DOXA General</span>
                </div>
                <p class="option-description">Send to all subscribers who opted in to DOXA updates</p>
                <p class="option-count" v-if="doxaCount !== null">{{ doxaCount }} recipients</p>
              </div>

              <div
                class="audience-option"
                :class="{ selected: form.audience_type === 'people_group' }"
                @click="selectAudience('people_group')"
              >
                <div class="option-header">
                  <input type="radio" v-model="form.audience_type" value="people_group" />
                  <span class="option-title">People Group</span>
                </div>
                <p class="option-description">Send to subscribers who opted in to a specific people group</p>

                <USelectMenu
                  v-show="form.audience_type === 'people_group'"
                  v-model="form.people_group_id"
                  :items="peopleGroupOptions"
                  placeholder="Select a people group"
                  class="people-group-select"
                  virtualize
                  value-key="value"
                  @update:model-value="loadPeopleGroupCount"
                />
                <p class="option-count" v-if="form.audience_type === 'people_group' && peopleGroupCount !== null">
                  {{ peopleGroupCount }} recipients
                </p>
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

const form = ref({
  subject: '',
  audience_type: '' as 'doxa' | 'people_group' | '',
  people_group_id: undefined as number | undefined,
  content: { type: 'doc', content: [{ type: 'paragraph' }] }
})

const peopleGroups = ref<{ id: number; title: string }[]>([])
const doxaCount = ref<number | null>(null)
const peopleGroupCount = ref<number | null>(null)
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
  return form.value.subject && form.value.audience_type && form.value.content
    && (form.value.audience_type === 'doxa' || form.value.people_group_id)
})

const canSend = computed(() => {
  return canSave.value && (
    (form.value.audience_type === 'doxa' && doxaCount.value && doxaCount.value > 0) ||
    (form.value.audience_type === 'people_group' && peopleGroupCount.value && peopleGroupCount.value > 0)
  )
})

const hasActualContent = computed(() => {
  return form.value.subject.trim().length > 0
})

function selectAudience(type: 'doxa' | 'people_group') {
  form.value.audience_type = type
  if (type === 'doxa') {
    form.value.people_group_id = undefined
    peopleGroupCount.value = null
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

async function saveEmail() {
  if (!canSave.value) return

  try {
    saving.value = true

    const response = await $fetch<{ success: boolean; email: { id: number } }>('/api/admin/marketing/emails', {
      method: 'POST',
      body: {
        subject: form.value.subject,
        content_json: JSON.stringify(form.value.content),
        audience_type: form.value.audience_type,
        people_group_id: form.value.people_group_id
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
        content_json: JSON.stringify(form.value.content),
        audience_type: form.value.audience_type,
        people_group_id: form.value.people_group_id
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
        content_json: JSON.stringify(form.value.content),
        audience_type: form.value.audience_type || 'doxa',
        people_group_id: form.value.people_group_id
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

onMounted(() => {
  loadPeopleGroups()
  if (isAdmin.value) {
    loadDoxaCount()
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
  gap: 1rem;
}

.audience-option {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1rem;
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

.option-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.option-title {
  font-weight: 600;
}

.option-description {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.option-count {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.people-group-select {
  margin-top: 0.75rem;
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

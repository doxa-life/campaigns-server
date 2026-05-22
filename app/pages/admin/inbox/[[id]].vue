<template>
  <CrmLayout :loading="loading" :error="error" v-model:open="slideoverOpen">
    <template #header>
      <div>
        <h1>Inbox</h1>
      </div>
      <UButton icon="i-lucide-book-open" variant="outline" @click="openCannedModal">
        Canned Responses
      </UButton>
    </template>

    <template #list-header>
      <CrmListPanel
        v-model="search"
        search-placeholder="Search conversations..."
        :total-count="total"
      >
        <template #filters>
          <div class="quick-filters">
            <UButton
              v-for="item in quickFilters"
              :key="item.key"
              size="xs"
              :variant="activeFilter === item.key ? 'solid' : 'outline'"
              @click="setFilter(item.key)"
            >
              {{ item.label }}
            </UButton>
          </div>
        </template>
      </CrmListPanel>
    </template>

    <template #list>
      <div v-if="conversations.length === 0" class="empty-list">No conversations found</div>
      <CrmListItem
        v-for="conversation in conversations"
        v-else
        :key="conversation.id"
        :active="selectedConversation?.id === conversation.id"
        @click="selectConversation(conversation)"
      >
        <div class="conversation-row">
          <div class="conversation-title">
            <span>{{ conversation.subject || 'No subject' }}</span>
            <UBadge :label="conversation.status" :color="statusColor(conversation.status)" size="xs" variant="subtle" />
            <UBadge v-if="conversation.needs_review" label="Held" color="warning" size="xs" variant="subtle" />
          </div>
          <div class="conversation-contact">
            {{ conversation.subscriber_name || conversation.subscriber_email || 'Unknown contact' }}
            <template v-if="conversation.assignee_name"> · {{ conversation.assignee_name }}</template>
          </div>
          <div class="conversation-preview">{{ conversation.latest_body || 'No messages yet' }}</div>
        </div>
      </CrmListItem>
    </template>

    <template v-if="selectedConversation" #detail-header>
      <h2>{{ selectedConversation.subject || 'Conversation' }}</h2>
    </template>

    <template v-if="selectedConversation" #detail-actions>
      <UButton size="sm" variant="outline" @click="updateConversation({ status: selectedConversation.status === 'closed' ? 'open' : 'closed' })">
        {{ selectedConversation.status === 'closed' ? 'Reopen' : 'Close' }}
      </UButton>
      <UButton size="sm" color="error" variant="outline" @click="markSpam">
        Spam
      </UButton>
    </template>

    <template #detail>
      <CrmDetailPanel
        v-if="selectedConversation"
        :side-tabs="[
          { label: 'Notes', slot: 'notes', icon: 'i-lucide-message-square' },
          { label: 'Activity', slot: 'activity', icon: 'i-lucide-activity' }
        ]"
      >
        <template #details>
          <div class="thread">
            <div v-for="message in messages" :key="message.id" class="message" :class="message.direction">
              <div class="message-meta">
                <strong>{{ message.direction === 'outbound' ? (message.from_name || message.from_email || 'Doxa') : (message.from_name || message.from_email || 'Contact') }}</strong>
                <UBadge :label="message.status" size="xs" variant="subtle" />
                <UBadge v-if="message.authenticated" label="Authenticated" color="success" size="xs" variant="subtle" />
                <UBadge v-if="message.hold_reason" :label="message.hold_reason" color="warning" size="xs" variant="subtle" />
              </div>
              <div class="message-body" v-html="message.body_stripped_html || escapeText(message.body_text)" />
              <UButton
                v-if="message.body_stripped_html && message.body_html && message.body_html !== message.body_stripped_html"
                size="xs"
                variant="ghost"
                @click="toggleQuoted(message.id)"
              >
                {{ shownQuoted.has(message.id) ? 'Hide quoted' : 'Show quoted' }}
              </UButton>
              <div v-if="shownQuoted.has(message.id)" class="quoted" v-html="message.body_html" />
              <div v-if="attachmentsFor(message.id).length > 0" class="attachments">
                <a
                  v-for="attachment in attachmentsFor(message.id)"
                  :key="attachment.id"
                  class="attachment-link"
                  :href="attachment.url || undefined"
                  target="_blank"
                  rel="noopener"
                >
                  <UIcon name="i-lucide-paperclip" />
                  <span>{{ attachment.filename }}</span>
                  <small v-if="attachment.size_bytes">{{ formatBytes(attachment.size_bytes) }}</small>
                </a>
              </div>
            </div>
          </div>

          <form class="composer" @submit.prevent="sendReply(false)">
            <UFormField label="Subject">
              <UInput v-model="composer.subject" class="w-full" />
            </UFormField>
            <UFormField v-if="cannedResponses.length > 0" label="Canned Response">
              <USelectMenu
                v-model="selectedCannedResponseId"
                :items="cannedResponseOptions"
                value-key="value"
                placeholder="Insert response..."
                class="w-full"
                @update:model-value="insertCannedResponse"
              />
            </UFormField>
            <UFormField label="Reply">
              <RichTextEditor v-model="composer.content" />
            </UFormField>
            <UFormField label="Attachments">
              <input type="file" multiple class="file-input" @change="onAttachmentChange" />
              <div v-if="composer.files.length > 0" class="selected-files">
                <UBadge
                  v-for="file in composer.files"
                  :key="`${file.name}-${file.size}`"
                  :label="`${file.name} (${formatBytes(file.size)})`"
                  variant="subtle"
                  color="neutral"
                />
              </div>
            </UFormField>
            <div class="composer-actions">
              <UButton type="button" variant="outline" :loading="sending" @click="sendReply(true)">Save Draft</UButton>
              <UButton type="submit" :loading="sending">Send</UButton>
            </div>
          </form>
        </template>

        <template #side-notes>
          <RecordComments record-type="conversation" :record-id="selectedConversation.id" />
        </template>

        <template #side-activity>
          <RecordActivity table-name="conversations" :record-id="selectedConversation.id" />
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <UModal v-model:open="showCannedModal" title="Canned Responses">
    <template #body>
      <div class="canned-manager">
        <div class="canned-list">
          <button
            v-for="response in cannedResponses"
            :key="response.id"
            type="button"
            class="canned-row"
            :class="{ active: editingCanned?.id === response.id }"
            @click="editCanned(response)"
          >
            {{ response.title }}
          </button>
          <UButton icon="i-lucide-plus" variant="outline" size="sm" @click="newCanned">New Response</UButton>
        </div>
        <form v-if="editingCanned" class="canned-form" @submit.prevent="saveCanned">
          <UFormField label="Title">
            <UInput v-model="editingCanned.title" class="w-full" />
          </UFormField>
          <UFormField label="Language">
            <UInput v-model="editingCanned.language_code" class="w-full" placeholder="en" />
          </UFormField>
          <UFormField label="Body">
            <UTextarea v-model="editingCanned.body_html" :rows="8" class="w-full" />
          </UFormField>
          <div class="composer-actions">
            <UButton v-if="editingCanned.id" type="button" color="error" variant="outline" @click="deleteCanned">Delete</UButton>
            <UButton type="submit" :loading="savingCanned">Save</UButton>
          </div>
        </form>
      </div>
    </template>
  </UModal>

  <ConfirmModal
    v-model:open="confirmSpamOpen"
    title="Mark as Spam"
    message="Block this sender and move the conversation to spam?"
    confirm-text="Mark Spam"
    confirm-color="error"
    @confirm="confirmMarkSpam"
  />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface Conversation {
  id: number
  subject: string | null
  status: string
  needs_review: boolean
  subscriber_name: string | null
  subscriber_email: string | null
  assignee_name: string | null
  latest_body: string | null
}

interface Message {
  id: number
  direction: 'inbound' | 'outbound'
  status: string
  from_email: string | null
  from_name: string | null
  body_html: string | null
  body_stripped_html: string | null
  body_text: string | null
  authenticated: boolean
  hold_reason: string | null
}

interface Attachment {
  id: number
  message_id: number
  filename: string | null
  size_bytes: number | null
  url: string | null
}

interface CannedResponse {
  id: number
  title: string
  translations: Array<{ language_code: string; body_html: string }>
}

const route = useRoute()
const router = useRouter()
const toast = useToast()

const loading = ref(true)
const error = ref('')
const search = ref('')
const activeFilter = ref('open')
const total = ref(0)
const conversations = ref<Conversation[]>([])
const selectedConversation = ref<Conversation | null>(null)
const messages = ref<Message[]>([])
const attachments = ref<Attachment[]>([])
const slideoverOpen = ref(false)
const sending = ref(false)
const composer = ref({
  subject: '',
  content: { type: 'doc', content: [{ type: 'paragraph' }] } as any,
  files: [] as File[]
})
const shownQuoted = ref(new Set<number>())
const confirmSpamOpen = ref(false)
const cannedResponses = ref<CannedResponse[]>([])
const selectedCannedResponseId = ref<number | undefined>(undefined)
const showCannedModal = ref(false)
const savingCanned = ref(false)
const editingCanned = ref<{ id?: number; title: string; language_code: string; body_html: string } | null>(null)

const cannedResponseOptions = computed(() => cannedResponses.value.map(r => ({ value: r.id, label: r.title })))

const quickFilters = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'mine', label: 'Mine' },
  { key: 'open', label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed', label: 'Closed' },
  { key: 'spam', label: 'Spam' },
  { key: 'held', label: 'Held' }
]

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadConversations, 250)
})

watch(slideoverOpen, (open) => {
  if (!open) {
    selectedConversation.value = null
    router.replace('/admin/inbox')
  }
})

onMounted(async () => {
  await Promise.all([loadConversations(), loadCannedResponses()])
  const routeId = Number(route.params.id)
  if (routeId) {
    const match = conversations.value.find(c => c.id === routeId)
    if (match) await selectConversation(match, false)
  }
})

async function loadConversations() {
  loading.value = true
  try {
    const query: Record<string, any> = { search: search.value || undefined }
    if (activeFilter.value === 'unassigned') query.unassigned = true
    else if (activeFilter.value === 'mine') query.mine = true
    else if (activeFilter.value === 'held') query.held = true
    else query.status = activeFilter.value

    const res = await $fetch<{ items: Conversation[]; total: number }>('/api/admin/inbox/conversations', { query })
    conversations.value = res.items
    total.value = res.total
  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to load inbox'
  } finally {
    loading.value = false
  }
}

function setFilter(key: string) {
  activeFilter.value = key
  loadConversations()
}

async function selectConversation(conversation: Conversation, updateUrl = true) {
  selectedConversation.value = conversation
  composer.value.subject = conversation.subject || ''
  slideoverOpen.value = true
  if (updateUrl) router.replace(`/admin/inbox/${conversation.id}`)
  const res = await $fetch<{ conversation: Conversation; messages: Message[]; attachments: Attachment[] }>(`/api/admin/inbox/conversations/${conversation.id}`)
  selectedConversation.value = res.conversation
  messages.value = res.messages
  attachments.value = res.attachments
}

async function updateConversation(body: Record<string, any>) {
  if (!selectedConversation.value) return
  const res = await $fetch<{ conversation: Conversation }>(`/api/admin/inbox/conversations/${selectedConversation.value.id}`, {
    method: 'PUT',
    body
  })
  selectedConversation.value = res.conversation
  await loadConversations()
}

async function markSpam() {
  confirmSpamOpen.value = true
}

async function confirmMarkSpam() {
  if (!selectedConversation.value) return
  await $fetch(`/api/admin/inbox/conversations/${selectedConversation.value.id}/spam`, {
    method: 'POST',
    body: { spam: true }
  })
  toast.add({ title: 'Marked as spam', color: 'success' })
  confirmSpamOpen.value = false
  await loadConversations()
}

async function sendReply(saveDraft: boolean) {
  if (!selectedConversation.value || isEmptyDoc(composer.value.content)) return
  sending.value = true
  try {
    const form = new FormData()
    form.append('subject', composer.value.subject)
    form.append('content_json', JSON.stringify(composer.value.content))
    form.append('saveDraft', String(saveDraft))
    for (const file of composer.value.files) form.append('attachments', file)
    await $fetch(`/api/admin/inbox/conversations/${selectedConversation.value.id}/messages`, {
      method: 'POST',
      body: form
    })
    composer.value.content = { type: 'doc', content: [{ type: 'paragraph' }] }
    composer.value.files = []
    toast.add({ title: saveDraft ? 'Draft saved' : 'Reply queued', color: 'success' })
    await selectConversation(selectedConversation.value, false)
    await loadConversations()
  } finally {
    sending.value = false
  }
}

function onAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  const oversized = files.find(file => file.size > 25 * 1024 * 1024)
  if (oversized) {
    toast.add({ title: 'Attachment too large', description: `${oversized.name} is larger than 25 MB`, color: 'error' })
    input.value = ''
    return
  }
  composer.value.files = files
}

function attachmentsFor(messageId: number) {
  return attachments.value.filter(a => a.message_id === messageId)
}

function isEmptyDoc(doc: any) {
  return !extractDocText(doc).trim()
}

function extractDocText(node: any): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) return node.content.map(extractDocText).join('')
  return ''
}

function insertCannedResponse(id: number | null) {
  const response = cannedResponses.value.find(r => r.id === id)
  const translation = response?.translations.find(t => t.language_code === 'en') || response?.translations[0]
  if (!translation) return
  composer.value.content = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: stripHtml(translation.body_html) }]
    }]
  }
}

async function loadCannedResponses() {
  const res = await $fetch<{ responses: CannedResponse[] }>('/api/admin/inbox/canned-responses')
  cannedResponses.value = res.responses
}

function openCannedModal() {
  showCannedModal.value = true
  if (!editingCanned.value) newCanned()
}

function newCanned() {
  editingCanned.value = { title: '', language_code: 'en', body_html: '' }
}

function editCanned(response: CannedResponse) {
  const translation = response.translations.find(t => t.language_code === 'en') || response.translations[0]
  editingCanned.value = {
    id: response.id,
    title: response.title,
    language_code: translation?.language_code || 'en',
    body_html: translation?.body_html || ''
  }
}

async function saveCanned() {
  if (!editingCanned.value) return
  savingCanned.value = true
  try {
    const body = {
      title: editingCanned.value.title,
      translations: [{ language_code: editingCanned.value.language_code || 'en', body_html: editingCanned.value.body_html }]
    }
    if (editingCanned.value.id) {
      await $fetch(`/api/admin/inbox/canned-responses/${editingCanned.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/inbox/canned-responses', { method: 'POST', body })
    }
    await loadCannedResponses()
    toast.add({ title: 'Canned response saved', color: 'success' })
  } finally {
    savingCanned.value = false
  }
}

async function deleteCanned() {
  if (!editingCanned.value?.id) return
  await $fetch(`/api/admin/inbox/canned-responses/${editingCanned.value.id}`, { method: 'DELETE' })
  editingCanned.value = null
  await loadCannedResponses()
}

function toggleQuoted(id: number) {
  const next = new Set(shownQuoted.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  shownQuoted.value = next
}

function escapeText(value?: string | null) {
  return (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function stripHtml(value: string) {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusColor(status: string) {
  if (status === 'open') return 'warning'
  if (status === 'pending') return 'info'
  if (status === 'closed') return 'neutral'
  if (status === 'spam') return 'error'
  return 'neutral'
}
</script>

<style scoped>
.quick-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.conversation-row {
  min-width: 0;
}

.conversation-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.conversation-title span:first-child,
.conversation-contact,
.conversation-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-contact {
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.conversation-preview {
  margin-top: 0.25rem;
  color: var(--ui-text-dimmed);
  font-size: 0.8125rem;
}

.thread {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1rem;
  background: var(--ui-bg);
}

.message.outbound {
  background: var(--ui-bg-elevated);
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.message-body,
.quoted {
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.quoted {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
}

.attachments,
.selected-files {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.attachment-link {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  max-width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  color: var(--ui-text);
  font-size: 0.8125rem;
  text-decoration: none;
}

.attachment-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-link small {
  color: var(--ui-text-muted);
  flex-shrink: 0;
}

.file-input {
  width: 100%;
  font-size: 0.875rem;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ui-border);
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.canned-manager {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1rem;
}

.canned-list,
.canned-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.canned-row {
  text-align: left;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 0.625rem 0.75rem;
  background: var(--ui-bg);
}

.canned-row.active {
  background: var(--ui-bg-elevated);
}

@media (max-width: 768px) {
  .canned-manager {
    grid-template-columns: 1fr;
  }
}
</style>

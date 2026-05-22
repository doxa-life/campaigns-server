<template>
  <CrmLayout
    v-model:open="slideoverOpen"
    :loading="loading"
  >
    <template #header>
      <div class="inbox-header">
        <h1 class="page-title">{{ $t('inbox.title') }}</h1>
        <div class="inbox-header-actions">
          <UButton
            v-if="canSend"
            icon="i-lucide-pen-line"
            color="primary"
            size="sm"
            @click="showCompose = true"
          >{{ $t('inbox.compose.newEmail') }}</UButton>
          <UButton
            v-if="canSend"
            icon="i-lucide-message-square-text"
            variant="outline"
            color="neutral"
            size="sm"
            @click="showCanned = true"
          >{{ $t('inbox.canned.title') }}</UButton>
        </div>
      </div>
    </template>

    <template #list-rail>
      <nav class="inbox-rail">
        <UButton
          block
          icon="i-lucide-flag"
          color="warning"
          :variant="view === 'held' ? 'soft' : 'ghost'"
          class="rail-item"
          @click="setView('held')"
        >
          <span class="rail-label">{{ $t('inbox.needsReview') }}</span>
          <UBadge v-if="counts.held" color="warning" variant="solid" size="xs">{{ counts.held }}</UBadge>
        </UButton>

        <div class="rail-divider" />

        <UButton
          v-for="v in scopeViews"
          :key="v.key"
          block
          :icon="v.icon"
          :color="view === v.key ? 'primary' : 'neutral'"
          :variant="view === v.key ? 'soft' : 'ghost'"
          class="rail-item"
          @click="setView(v.key)"
        >
          <span class="rail-label">{{ v.label }}</span>
          <UBadge v-if="counts[v.key]" :color="view === v.key ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ counts[v.key] }}</UBadge>
        </UButton>
      </nav>
    </template>

    <template #list-header>
      <CrmListPanel
        :model-value="search"
        :search-placeholder="$t('inbox.searchPlaceholder')"
        :total-count="total"
        @update:model-value="onSearch"
      >
        <template #filters>
          <div class="status-strip">
            <UButton
              v-for="s in statusOptions"
              :key="s.key"
              :variant="statusFilter === s.key ? 'solid' : 'ghost'"
              :color="statusFilter === s.key ? 'primary' : 'neutral'"
              size="xs"
              @click="setStatus(s.key)"
            >{{ s.label }}</UButton>
          </div>
        </template>
      </CrmListPanel>
    </template>

    <template #list>
      <div v-if="conversations.length === 0" class="empty-list">{{ $t('inbox.empty') }}</div>
      <CrmListItem
        v-for="c in conversations"
        :key="c.id"
        :active="selected?.conversation?.id === c.id"
        @click="selectConversation(c.id)"
      >
        <div class="conv-row">
          <div class="conv-top">
            <span class="conv-name">{{ c.subscriber_name || c.subscriber_email || $t('inbox.unassigned') }}</span>
            <span class="conv-time">{{ formatTime(c.last_message_at) }}</span>
          </div>
          <div class="conv-subject">{{ c.subject || '—' }}</div>
          <div class="conv-snippet">{{ c.last_message_snippet || '' }}</div>
          <div class="conv-badges">
            <UBadge :color="statusColor(c.status)" variant="subtle" size="xs">{{ $t('inbox.status.' + c.status) }}</UBadge>
            <UBadge v-if="c.needs_review" color="warning" variant="subtle" size="xs">{{ $t('inbox.needsReview') }}</UBadge>
            <UBadge v-if="c.assignee_name" color="neutral" variant="outline" size="xs">{{ c.assignee_name }}</UBadge>
          </div>
        </div>
      </CrmListItem>
    </template>

    <template #detail-header>
      <div v-if="selected" class="detail-head">
        <h2>{{ selected.conversation.subject || $t('inbox.conversation') }}</h2>
        <div class="detail-contact">
          <span v-if="selected.conversation.subscriber_name" class="contact-name">{{ selected.conversation.subscriber_name }}</span>
          <a v-if="selected.conversation.subscriber_email" :href="`mailto:${selected.conversation.subscriber_email}`" class="contact-email">{{ selected.conversation.subscriber_email }}</a>
        </div>
      </div>
    </template>

    <template #detail-actions>
      <template v-if="selected">
        <USelectMenu
          v-if="canSend"
          :model-value="assigneeValue"
          :items="assigneeOptions"
          value-key="value"
          size="xs"
          class="w-32 shrink-0"
          @update:model-value="onAssign"
        />
        <UButton
          :icon="selected.conversation.needs_review ? 'i-lucide-flag-off' : 'i-lucide-flag'"
          :color="selected.conversation.needs_review ? 'warning' : 'neutral'"
          variant="ghost"
          size="xs"
          @click="toggleNeedsReview"
        >{{ selected.conversation.needs_review ? $t('inbox.actions.unflagReview') : $t('inbox.actions.flagReview') }}</UButton>
        <UButton
          v-if="selected.conversation.status !== 'closed'"
          icon="i-lucide-check"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="askClose"
        >{{ $t('inbox.actions.close') }}</UButton>
        <UButton
          v-else
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="changeStatus('open')"
        >{{ $t('inbox.actions.reopen') }}</UButton>
        <UButton
          v-if="canSend && selected.conversation.status !== 'spam'"
          icon="i-lucide-shield-alert"
          color="error"
          variant="ghost"
          size="xs"
          @click="askSpam"
        >{{ $t('inbox.actions.markSpam') }}</UButton>
        <UButton
          v-else-if="canSend"
          icon="i-lucide-shield-off"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="unmarkSpam"
        >{{ $t('inbox.actions.unmarkSpam') }}</UButton>
      </template>
    </template>

    <template #detail>
      <CrmDetailPanel
        v-if="selected"
        :side-tabs="sideTabs"
      >
        <template #details>
          <div class="thread">
            <div
              v-for="m in selected.messages"
              :key="m.id"
              class="msg"
              :class="m.direction"
            >
              <div class="msg-head">
                <span class="msg-from">{{ messageSender(m) }}</span>
                <span class="msg-meta">
                  <UBadge :color="m.direction === 'outbound' ? 'primary' : 'neutral'" variant="subtle" size="xs">
                    {{ $t('inbox.direction.' + m.direction) }}
                  </UBadge>
                  <UBadge v-if="m.status === 'failed'" color="error" variant="subtle" size="xs">failed</UBadge>
                  <UBadge v-if="m.status === 'held'" color="warning" variant="subtle" size="xs">held</UBadge>
                  <span class="msg-time">{{ formatTime(m.created_at) }}</span>
                </span>
              </div>
              <div class="msg-body" v-html="sanitizeMessageHtml(messageDisplayHtml(m))" />
              <UButton
                v-if="m.direction === 'inbound' && m.body_stripped_html && m.body_html && m.body_html !== m.body_stripped_html"
                variant="link"
                size="xs"
                color="neutral"
                @click="toggleQuoted(m.id)"
              >
                {{ expandedQuoted.has(m.id) ? $t('inbox.actions.hideQuoted') : $t('inbox.actions.showQuoted') }}
              </UButton>
              <div v-if="m.attachments && m.attachments.length" class="msg-attachments">
                <a
                  v-for="a in m.attachments"
                  :key="a.id"
                  :href="a.url || '#'"
                  target="_blank"
                  class="attachment-chip"
                >
                  <UIcon name="i-lucide-paperclip" /> {{ a.filename }}
                </a>
              </div>
            </div>
          </div>

          <!-- Composer -->
          <div v-if="canSend && selected.conversation.status !== 'spam'" class="composer">
            <div class="composer-from">
              <span class="from-label">{{ $t('inbox.compose.from') }}:</span>
              <USelect
                v-if="fromOptions.length > 1"
                v-model="fromIdentity"
                :items="fromOptions"
                value-key="value"
                size="xs"
                class="from-select"
              />
              <span v-else class="from-static">{{ fromOptions[0]?.label }}</span>
            </div>
            <div v-if="cannedResponses.length" class="composer-toolbar">
              <USelectMenu
                v-model="selectedCanned"
                :items="cannedOptions"
                value-key="value"
                size="xs"
                :placeholder="$t('inbox.compose.cannedResponse')"
                class="canned-select"
                @update:model-value="applyCanned"
              />
              <USelect
                v-model="cannedLanguage"
                :items="languageSelectItems"
                value-key="value"
                size="xs"
                class="lang-select"
                :aria-label="$t('inbox.compose.language')"
                :title="$t('inbox.compose.language')"
              />
            </div>
            <InboxEmailEditor
              v-model="replyHtml"
              :conversation-id="selected.conversation.id"
              :placeholder="$t('inbox.compose.placeholder')"
              class="composer-editor"
            />
            <div class="composer-actions">
              <input ref="fileInput" type="file" multiple class="hidden-file" @change="onFilesPicked" />
              <UButton icon="i-lucide-paperclip" variant="ghost" color="neutral" size="sm" @click="fileInput?.click()">
                {{ $t('inbox.compose.attach') }}
              </UButton>
              <span v-if="pendingFiles.length" class="pending-files">{{ pendingFiles.map(f => f.name).join(', ') }}</span>
              <div class="composer-spacer" />
              <UButton variant="outline" color="neutral" size="sm" :loading="savingDraft" @click="saveDraft">
                {{ $t('inbox.compose.saveDraft') }}
              </UButton>
              <UButton color="primary" size="sm" :loading="sending" @click="sendReply">
                {{ $t('inbox.compose.send') }}
              </UButton>
            </div>
            <div v-if="selected.drafts.length" class="drafts">
              <span class="drafts-label">{{ $t('inbox.compose.draft') }}:</span>
              <UButton
                v-for="d in selected.drafts"
                :key="d.id"
                variant="link"
                size="xs"
                @click="loadDraft(d)"
              >#{{ d.id }}</UButton>
            </div>
          </div>
        </template>

        <template #side-notes>
          <RecordComments record-type="conversation" :record-id="selected.conversation.id" />
        </template>
        <template #side-activity>
          <RecordActivity table-name="conversations" :record-id="selected.conversation.id" />
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <ConfirmModal
    v-model:open="showCloseModal"
    :title="$t('inbox.confirm.closeTitle')"
    :message="$t('inbox.confirm.closeMessage')"
    :confirm-text="$t('inbox.actions.close')"
    confirm-color="primary"
    @confirm="confirmClose"
  />
  <ConfirmModal
    v-model:open="showSpamModal"
    :title="$t('inbox.confirm.spamTitle')"
    :message="$t('inbox.confirm.spamMessage')"
    :confirm-text="$t('inbox.actions.markSpam')"
    confirm-color="error"
    @confirm="confirmSpam"
  />
  <CannedResponsesManager v-model:open="showCanned" @saved="loadAux" />
  <ComposeEmailModal
    v-model:open="showCompose"
    :from-options="fromOptions"
    :my-alias="myAlias"
    @sent="onComposed"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { LANGUAGES } from '~/utils/languages'
import { sanitizeMessageHtml } from '~/utils/sanitizeHtml'

definePageMeta({ layout: 'admin', middleware: 'auth' })

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const { user, canAccess } = useAuthUser()

interface ConversationListItem {
  id: number
  subject: string | null
  status: string
  needs_review: boolean
  assignee_name: string | null
  subscriber_name: string | null
  subscriber_email: string | null
  last_message_at: string | null
  last_message_snippet: string | null
}
interface Message {
  id: number
  direction: 'inbound' | 'outbound'
  status: string
  from_name: string | null
  from_email: string | null
  sender_name: string | null
  body_html: string | null
  body_stripped_html: string | null
  body_text: string | null
  created_at: string
  attachments?: { id: number; filename: string | null; url: string | null }[]
}
interface ConversationDetail {
  id: number
  subject: string | null
  status: string
  assigned_user_id: string | null
  needs_review: boolean
  subscriber_name: string | null
  subscriber_email: string | null
}
interface SelectedConversation {
  conversation: ConversationDetail
  messages: Message[]
  drafts: Message[]
}

const canSend = computed(() => canAccess('inbox.send'))

const loading = ref(false)
const conversations = ref<ConversationListItem[]>([])
const total = ref(0)
const search = ref('')
// Rail view (single-select: scope folders + the Held/needs-review queue) AND a status
// filter, combined with AND. Held is a folder, not a scope, so picking it shows the whole
// review queue regardless of assignment.
const view = ref<'all' | 'unassigned' | 'mine' | 'held'>('all')
const statusFilter = ref<'all' | 'open' | 'pending' | 'closed' | 'spam'>('open')
const counts = ref<{ all: number; unassigned: number; mine: number; held: number }>({ all: 0, unassigned: 0, mine: 0, held: 0 })

const selected = ref<SelectedConversation | null>(null)
const slideoverOpen = ref(false)

const replyHtml = ref('')
const sending = ref(false)
const savingDraft = ref(false)
const currentDraftId = ref<number | null>(null)
const expandedQuoted = ref<Set<number>>(new Set())

const cannedResponses = ref<any[]>([])
const selectedCanned = ref<number | null>(null)
const cannedLanguage = ref('en')
const users = ref<{ id: string; display_name: string; email: string; email_alias?: string | null }[]>([])

// From-identity selector: send as the agent's personal alias or the general contact address.
const publicConfig = useRuntimeConfig().public as { inboxContactAddress?: string; inboxDomain?: string }
const contactAddress = publicConfig.inboxContactAddress || 'contact@doxa.life'
const inboxDomain = publicConfig.inboxDomain || 'doxa.life'
const fromIdentity = ref<'personal' | 'contact'>('personal')
const meAlias = ref<string | null>(null)
const myAlias = computed(() => meAlias.value || users.value.find(u => String(u.id) === String(user.value?.id))?.email_alias || null)
const fromOptions = computed(() => {
  const opts: { label: string; value: 'personal' | 'contact' }[] = []
  if (myAlias.value) {
    const first = (user.value?.display_name || '').trim().split(/\s+/)[0] || 'You'
    opts.push({ label: `"${first} with Doxa" <${myAlias.value}@${inboxDomain}>`, value: 'personal' })
  }
  opts.push({ label: `"Doxa Prayer" <${contactAddress}>`, value: 'contact' })
  return opts
})

const fileInput = ref<HTMLInputElement | null>(null)
const pendingFiles = ref<File[]>([])

const showCloseModal = ref(false)
const showSpamModal = ref(false)
const showCanned = ref(false)
const showCompose = ref(false)

// Open the freshly-created thread + refresh the list/counts.
async function onComposed(id: number) {
  await Promise.all([loadConversations(), loadCounts()])
  await selectConversation(id)
}

const scopeViews = computed(() => [
  { key: 'all' as const, label: t('inbox.filters.all'), icon: 'i-lucide-inbox' },
  { key: 'unassigned' as const, label: t('inbox.filters.unassigned'), icon: 'i-lucide-circle-dashed' },
  { key: 'mine' as const, label: t('inbox.filters.mine'), icon: 'i-lucide-user' },
])
const statusOptions = computed(() => [
  { key: 'open' as const, label: t('inbox.filters.open') },
  { key: 'pending' as const, label: t('inbox.filters.pending') },
  { key: 'closed' as const, label: t('inbox.filters.closed') },
  { key: 'spam' as const, label: t('inbox.filters.spam') },
  { key: 'all' as const, label: t('inbox.filters.all') },
])

const sideTabs = computed(() => [
  { label: t('inbox.internalNotes'), slot: 'notes', icon: 'i-lucide-sticky-note' },
  { label: t('inbox.activity'), slot: 'activity', icon: 'i-lucide-history' },
])

// Language picker for the canned-response inserter: choose which translation to insert.
const languageSelectItems = LANGUAGES.map(l => ({ label: `${l.flag} ${l.nativeName}`, value: l.code }))

// Nuxt UI's Combobox forbids an empty-string item value, so "Unassigned" uses a sentinel.
const UNASSIGNED = '__unassigned__'
const assigneeOptions = computed(() => [
  { label: t('inbox.unassigned'), value: UNASSIGNED },
  ...users.value.map(u => ({ label: u.display_name || u.email, value: u.id })),
])
const assigneeValue = computed(() => selected.value?.conversation.assigned_user_id || UNASSIGNED)

const cannedOptions = computed(() =>
  cannedResponses.value.map(c => ({ label: c.title, value: c.id }))
)

function statusColor(status: string): any {
  return { open: 'success', pending: 'warning', closed: 'neutral', spam: 'error' }[status] || 'neutral'
}

function formatTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function messageSender(m: Message): string {
  if (m.direction === 'outbound') {
    return m.sender_name || m.from_name || t('inbox.direction.outbound')
  }
  return m.from_name || m.from_email || t('inbox.direction.inbound')
}

function messageDisplayHtml(m: Message): string {
  if (m.direction === 'inbound') {
    if (m.body_stripped_html && !expandedQuoted.value.has(m.id)) return m.body_stripped_html
    return m.body_html || m.body_stripped_html || (m.body_text || '').replace(/\n/g, '<br>')
  }
  return m.body_html || (m.body_text || '').replace(/\n/g, '<br>')
}

function toggleQuoted(id: number) {
  const next = new Set(expandedQuoted.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expandedQuoted.value = next
}

function buildParams() {
  const params: Record<string, string> = {}
  if (search.value) params.search = search.value
  // Rail view (single-select)
  if (view.value === 'unassigned') params.unassigned = 'true'
  else if (view.value === 'mine' && user.value?.id) params.mine = String(user.value.id)
  else if (view.value === 'held') params.held = 'true'
  // Status (independent of view)
  if (statusFilter.value !== 'all') params.status = statusFilter.value
  return params
}

async function loadConversations() {
  loading.value = true
  try {
    const res = await $fetch<{ conversations: ConversationListItem[]; total: number }>(
      '/api/admin/inbox/conversations',
      { params: buildParams() }
    )
    conversations.value = res.conversations
    total.value = res.total
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function loadCounts() {
  try {
    const params: Record<string, string> = {}
    if (statusFilter.value !== 'all') params.status = statusFilter.value
    if (user.value?.id) params.mine = String(user.value.id)
    counts.value = await $fetch('/api/admin/inbox/conversations/counts', { params })
  } catch {
    // non-fatal
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch(val: string) {
  search.value = val
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadConversations, 300)
}

function setView(key: 'all' | 'unassigned' | 'mine' | 'held') {
  view.value = key
  // The Held queue spans every status, so jump to the All tab to show the whole review backlog.
  if (key === 'held' && statusFilter.value !== 'all') {
    statusFilter.value = 'all'
    loadCounts()
  }
  loadConversations()
}

function setStatus(key: 'all' | 'open' | 'pending' | 'closed' | 'spam') {
  statusFilter.value = key
  loadConversations()
  loadCounts()
}

async function selectConversation(id: number, updateUrl = true) {
  try {
    const res = await $fetch<SelectedConversation>(`/api/admin/inbox/conversations/${id}`)
    selected.value = res
    slideoverOpen.value = true
    replyHtml.value = ''
    currentDraftId.value = null
    fromIdentity.value = 'personal'
    pendingFiles.value = []
    expandedQuoted.value = new Set()
    if (updateUrl) window.history.replaceState({}, '', `/admin/inbox/${id}`)
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

async function refreshSelected() {
  if (selected.value) {
    const id = selected.value.conversation.id
    const res = await $fetch<SelectedConversation>(`/api/admin/inbox/conversations/${id}`)
    selected.value = res
  }
}

async function onAssign(value: string) {
  if (!selected.value) return
  const assignedUserId = value === UNASSIGNED ? null : (value || null)
  try {
    await $fetch(`/api/admin/inbox/conversations/${selected.value.conversation.id}`, {
      method: 'PUT',
      body: { assigned_user_id: assignedUserId },
    })
    toast.add({ title: t('inbox.toasts.assigned'), color: 'success' })
    await refreshSelected()
    await loadConversations()
    await loadCounts()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

async function toggleNeedsReview() {
  if (!selected.value) return
  const next = !selected.value.conversation.needs_review
  try {
    await $fetch(`/api/admin/inbox/conversations/${selected.value.conversation.id}`, {
      method: 'PUT',
      body: { needs_review: next },
    })
    await refreshSelected()
    await loadConversations()
    await loadCounts()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

async function changeStatus(status: string) {
  if (!selected.value) return
  try {
    await $fetch(`/api/admin/inbox/conversations/${selected.value.conversation.id}`, {
      method: 'PUT',
      body: { status },
    })
    toast.add({ title: t('inbox.toasts.statusChanged'), color: 'success' })
    await refreshSelected()
    await loadConversations()
    await loadCounts()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

function askClose() { showCloseModal.value = true }
function confirmClose() { showCloseModal.value = false; changeStatus('closed') }

function askSpam() { showSpamModal.value = true }
async function confirmSpam() {
  showSpamModal.value = false
  if (!selected.value) return
  try {
    await $fetch(`/api/admin/inbox/conversations/${selected.value.conversation.id}/spam`, {
      method: 'POST',
      body: { spam: true },
    })
    toast.add({ title: t('inbox.toasts.markedSpam'), color: 'success' })
    await refreshSelected()
    await loadConversations()
    await loadCounts()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}
async function unmarkSpam() {
  if (!selected.value) return
  try {
    await $fetch(`/api/admin/inbox/conversations/${selected.value.conversation.id}/spam`, {
      method: 'POST',
      body: { spam: false },
    })
    toast.add({ title: t('inbox.toasts.unmarkedSpam'), color: 'success' })
    await refreshSelected()
    await loadConversations()
    await loadCounts()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim()
}

// Falls back to the contact address when the agent has no personal alias.
function effectiveFromIdentity(): 'personal' | 'contact' {
  return myAlias.value ? fromIdentity.value : 'contact'
}

async function ensureDraft(): Promise<number> {
  const res = await $fetch<{ message: { id: number } }>(
    `/api/admin/inbox/conversations/${selected.value!.conversation.id}/messages`,
    { method: 'POST', body: { body_html: replyHtml.value, body_text: htmlToText(replyHtml.value), from_identity: effectiveFromIdentity(), saveDraft: true, draft_id: currentDraftId.value ?? undefined } }
  )
  currentDraftId.value = res.message.id
  return res.message.id
}

async function saveDraft() {
  if (!selected.value) return
  savingDraft.value = true
  try {
    const draftId = await ensureDraft()
    await uploadPendingFiles(draftId)
    toast.add({ title: t('inbox.toasts.draftSaved'), color: 'success' })
    await refreshSelected()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    savingDraft.value = false
  }
}

async function uploadPendingFiles(draftId: number) {
  if (pendingFiles.value.length === 0) return
  for (const file of pendingFiles.value) {
    const fd = new FormData()
    fd.append('draft_id', String(draftId))
    fd.append('file', file)
    await $fetch(`/api/admin/inbox/conversations/${selected.value!.conversation.id}/attachments`, {
      method: 'POST',
      body: fd,
    })
  }
  pendingFiles.value = []
}

async function sendReply() {
  if (!selected.value) return
  if (!replyHtml.value.trim() && !currentDraftId.value) {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
    return
  }
  sending.value = true
  try {
    // If there are files, persist as a draft first so they can be attached, then send the draft.
    if (pendingFiles.value.length > 0) {
      const draftId = await ensureDraft()
      await uploadPendingFiles(draftId)
    }
    await $fetch(`/api/admin/inbox/conversations/${selected.value.conversation.id}/messages`, {
      method: 'POST',
      body: {
        body_html: replyHtml.value,
        body_text: htmlToText(replyHtml.value),
        from_identity: effectiveFromIdentity(),
        draft_id: currentDraftId.value ?? undefined,
      },
    })
    replyHtml.value = ''
    currentDraftId.value = null
    toast.add({ title: t('inbox.toasts.sent'), color: 'success' })
    await refreshSelected()
    await loadConversations()
    await loadCounts()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    sending.value = false
  }
}

function loadDraft(d: Message) {
  replyHtml.value = d.body_html || ''
  currentDraftId.value = d.id
  if (d.from_email) {
    fromIdentity.value = d.from_email.toLowerCase() === contactAddress.toLowerCase() ? 'contact' : 'personal'
  }
}

function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) pendingFiles.value = Array.from(input.files)
}

function applyCanned(id: number) {
  const cr = cannedResponses.value.find(c => c.id === id)
  if (!cr) return
  const translation = cr.translations?.find((tr: any) => tr.language_code === cannedLanguage.value)
    || cr.translations?.find((tr: any) => tr.language_code === 'en')
    || cr.translations?.[0]
  if (translation?.body_html) {
    replyHtml.value = replyHtml.value ? `${replyHtml.value}<br>${translation.body_html}` : translation.body_html
  }
  selectedCanned.value = null
}

async function loadAux() {
  try {
    const [cannedRes, usersRes, meRes] = await Promise.all([
      $fetch<{ cannedResponses: any[] }>('/api/admin/inbox/canned-responses').catch(() => ({ cannedResponses: [] })),
      $fetch<any>('/api/admin/users').catch(() => ({ users: [] })),
      $fetch<{ email_alias: string | null }>('/api/admin/inbox/me').catch(() => ({ email_alias: null })),
    ])
    cannedResponses.value = cannedRes.cannedResponses || []
    users.value = Array.isArray(usersRes) ? usersRes : (usersRes.users || [])
    meAlias.value = meRes.email_alias || null
  } catch {
    // non-fatal
  }
}

onMounted(async () => {
  await Promise.all([loadConversations(), loadCounts(), loadAux()])
  const routeId = route.params.id
  if (routeId) {
    await selectConversation(Number(Array.isArray(routeId) ? routeId[0] : routeId), false)
  }
})
</script>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: 600;
}
.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}
.inbox-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.inbox-rail {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem;
}
.rail-item {
  justify-content: flex-start;
}
.rail-label {
  flex: 1;
  text-align: left;
}
.rail-divider {
  height: 1px;
  background: var(--ui-border);
  margin: 0.35rem 0.25rem;
}
.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

@media (max-width: 768px) {
  .inbox-rail {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .rail-item {
    width: auto;
  }
  .rail-label {
    flex: none;
  }
  .rail-divider {
    display: none;
  }
}
.empty-list {
  padding: 2rem;
  text-align: center;
  color: var(--ui-text-muted);
}
.conv-row { display: flex; flex-direction: column; gap: 0.15rem; }
.conv-top { display: flex; justify-content: space-between; gap: 0.5rem; }
.conv-name { font-weight: 600; font-size: 0.875rem; }
.conv-time { font-size: 0.7rem; color: var(--ui-text-muted); flex-shrink: 0; }
.conv-subject { font-size: 0.8rem; }
.conv-snippet { font-size: 0.75rem; color: var(--ui-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-badges { display: flex; gap: 0.25rem; margin-top: 0.25rem; flex-wrap: wrap; }

.detail-head { min-width: 0; }
.detail-contact { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.8rem; margin-top: 0.15rem; }
.detail-contact .contact-name { color: var(--ui-text); font-weight: 500; }
.detail-contact .contact-email { color: var(--ui-text-muted); text-decoration: none; }
.detail-contact .contact-email:hover { text-decoration: underline; }

.thread { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
.msg { border: 1px solid var(--ui-border); border-radius: 8px; padding: 0.75rem 1rem; }
.msg.outbound { background: var(--ui-bg-elevated); }
.msg-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; gap: 0.5rem; }
.msg-from { font-weight: 600; font-size: 0.85rem; }
.msg-meta { display: flex; align-items: center; gap: 0.4rem; }
.msg-time { font-size: 0.7rem; color: var(--ui-text-muted); }
.msg-body { font-size: 0.875rem; line-height: 1.5; word-break: break-word; }
.msg-body :deep(p) { margin: 0.25rem 0; }
.msg-body :deep(img) { max-width: 100%; max-height: 480px; height: auto; }
.msg-attachments { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
.attachment-chip { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--ui-border); border-radius: 4px; }

.composer { border-top: 1px solid var(--ui-border); padding-top: 1rem; }
.composer-from { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.from-label { font-size: 0.75rem; color: var(--ui-text-muted); }
.from-select { min-width: 260px; }
.from-static { font-size: 0.8rem; color: var(--ui-text); }
.composer-toolbar { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
.canned-select { min-width: 200px; }
.lang-select { width: 150px; }
.composer-editor { border: 1px solid var(--ui-border); border-radius: 8px; min-height: 120px; margin-bottom: 0.5rem; }
.composer-actions { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 3.5rem; }
.composer-spacer { flex: 1; }
.hidden-file { display: none; }
.pending-files { font-size: 0.75rem; color: var(--ui-text-muted); }
.drafts { margin-top: 0.5rem; display: flex; align-items: center; gap: 0.25rem; }
.drafts-label { font-size: 0.75rem; color: var(--ui-text-muted); }
</style>

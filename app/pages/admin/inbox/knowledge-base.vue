<template>
  <div class="kb-page">
    <div class="kb-header">
      <div>
        <h1 class="kb-title">{{ $t('inbox.kb.pageTitle') }}</h1>
        <p class="kb-sub">{{ $t('inbox.kb.pageSubtitle') }}</p>
      </div>
      <div class="kb-header-actions">
        <USelect v-model="statusFilter" :items="statusItems" value-key="value" size="sm" class="w-40" @update:model-value="load" />
        <UButton v-if="canSend" icon="i-lucide-refresh-cw" variant="outline" color="neutral" size="sm" :loading="refreshing" @click="refreshGrounding">
          {{ $t('inbox.kb.refreshGrounding') }}
        </UButton>
      </div>
    </div>

    <div v-if="loading && entries.length === 0" class="kb-loading">
      <UIcon name="i-lucide-loader-circle" class="animate-spin" />
    </div>

    <UCard v-else-if="entries.length === 0" class="kb-empty">
      {{ $t('inbox.kb.empty') }}
    </UCard>

    <div v-else class="kb-list">
      <UCard v-for="entry in entries" :key="entry.id" class="kb-entry">
        <template v-if="editingId === entry.id">
          <UTextarea v-model="editQuestion" :rows="2" autoresize class="w-full mb-2" />
          <UTextarea v-model="editAnswer" :rows="5" autoresize class="w-full mb-2" />
          <div class="flex justify-end gap-2">
            <UButton variant="outline" color="neutral" size="xs" @click="cancelEdit">{{ $t('common.cancel') }}</UButton>
            <UButton size="xs" :loading="savingEdit" :disabled="!canSaveEdit" @click="saveEdit(entry)">{{ $t('inbox.kb.save') }}</UButton>
          </div>
        </template>
        <template v-else>
          <div class="kb-entry-head">
            <span class="kb-q">{{ entry.question }}</span>
            <div class="kb-entry-meta">
              <UBadge size="xs" variant="subtle" color="neutral">{{ entry.language }}</UBadge>
              <UBadge size="xs" variant="subtle" :color="entry.status === 'active' ? 'success' : 'neutral'">{{ entry.status === 'active' ? $t('inbox.kb.statusActive') : $t('inbox.kb.statusArchived') }}</UBadge>
            </div>
          </div>
          <p class="kb-a">{{ entry.answer }}</p>
          <div v-if="canSend" class="kb-entry-actions">
            <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-pencil" @click="startEdit(entry)">{{ $t('common.edit') }}</UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              :icon="entry.status === 'active' ? 'i-lucide-archive' : 'i-lucide-archive-restore'"
              @click="toggleArchive(entry)"
            >{{ entry.status === 'active' ? $t('inbox.kb.archive') : $t('inbox.kb.restore') }}</UButton>
            <UButton variant="ghost" color="error" size="xs" icon="i-lucide-trash-2" @click="askRemove(entry)">{{ $t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </div>
  </div>

  <ConfirmModal
    v-model:open="showDeleteModal"
    :title="$t('inbox.kb.deleteTitle')"
    :message="$t('inbox.kb.deleteMessage')"
    :confirm-text="$t('common.delete')"
    confirm-color="error"
    @confirm="confirmRemove"
  />
</template>

<script setup lang="ts">
interface KnowledgeEntry {
  id: number
  question: string
  answer: string
  language: string
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

definePageMeta({ layout: 'admin', middleware: 'auth' })

const { t } = useI18n()
const toast = useToast()

// Mutations (edit/archive/delete/refresh) require inbox.send; the server enforces it
// too, this just hides controls a viewer can't use.
const { canAccess } = useAuthUser()
const canSend = computed(() => canAccess('inbox.send'))

const entries = ref<KnowledgeEntry[]>([])
// Starts true so the first paint shows the spinner — the fetch only begins in
// onMounted, and the empty state must not appear before the server has answered.
const loading = ref(true)
const refreshing = ref(false)
const statusFilter = ref<'all' | 'active' | 'archived'>('all')

const statusItems = computed(() => [
  { label: t('inbox.kb.filterAll'), value: 'all' },
  { label: t('inbox.kb.filterActive'), value: 'active' },
  { label: t('inbox.kb.filterArchived'), value: 'archived' },
])

const editingId = ref<number | null>(null)
const editQuestion = ref('')
const editAnswer = ref('')
const savingEdit = ref(false)
// Entries always carry a non-empty question and answer (the server rejects blanking
// them too); the save button is disabled until both have content.
const canSaveEdit = computed(() => !!editQuestion.value.trim() && !!editAnswer.value.trim())

async function load() {
  loading.value = true
  try {
    const q = statusFilter.value === 'all' ? '' : `?status=${statusFilter.value}`
    const res = await $fetch<{ entries: KnowledgeEntry[] }>(`/api/admin/inbox/knowledge-entries${q}`)
    entries.value = res.entries
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    loading.value = false
  }
}

function startEdit(entry: KnowledgeEntry) {
  editingId.value = entry.id
  editQuestion.value = entry.question
  editAnswer.value = entry.answer
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(entry: KnowledgeEntry) {
  if (!canSaveEdit.value || savingEdit.value) return
  savingEdit.value = true
  try {
    await $fetch(`/api/admin/inbox/knowledge-entries/${entry.id}`, {
      method: 'PUT',
      body: { question: editQuestion.value.trim(), answer: editAnswer.value.trim() },
    })
    editingId.value = null
    await load()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    savingEdit.value = false
  }
}

async function toggleArchive(entry: KnowledgeEntry) {
  try {
    await $fetch(`/api/admin/inbox/knowledge-entries/${entry.id}`, {
      method: 'PUT',
      body: { status: entry.status === 'active' ? 'archived' : 'active' },
    })
    await load()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

// Deletion is permanent (the entry stops grounding future drafts), so it goes
// through a confirmation modal.
const showDeleteModal = ref(false)
const deleteTarget = ref<KnowledgeEntry | null>(null)

function askRemove(entry: KnowledgeEntry) {
  deleteTarget.value = entry
  showDeleteModal.value = true
}

async function confirmRemove() {
  showDeleteModal.value = false
  const entry = deleteTarget.value
  deleteTarget.value = null
  if (!entry) return
  try {
    await $fetch(`/api/admin/inbox/knowledge-entries/${entry.id}`, { method: 'DELETE' })
    await load()
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

async function refreshGrounding() {
  refreshing.value = true
  try {
    const res = await $fetch<{ synced: string[]; failed: { slug: string; error: string }[]; pruned: number }>(
      '/api/admin/inbox/grounding/refresh',
      { method: 'POST' }
    )
    // A failed page keeps serving its previous snapshot, so the person refreshing
    // needs to know which pages are still stale.
    if (res.failed.length) {
      toast.add({
        title: t('inbox.kb.refreshedPartial', { n: res.synced.length, m: res.failed.length }),
        description: res.failed.map(f => f.slug).join(', '),
        color: 'warning',
      })
    } else {
      toast.add({ title: t('inbox.kb.refreshed', { n: res.synced.length }), color: 'success' })
    }
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    refreshing.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.kb-page { padding: 1.5rem; max-width: 60rem; margin: 0 auto; }
.kb-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.25rem; }
.kb-header-actions { display: flex; align-items: center; gap: 0.5rem; }
.kb-title { font-size: 1.25rem; font-weight: 600; }
.kb-sub { font-size: 0.85rem; color: var(--ui-text-muted); margin-top: 0.25rem; }
.kb-list { display: flex; flex-direction: column; gap: 0.75rem; }
.kb-entry-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
.kb-entry-meta { display: flex; gap: 0.25rem; flex-shrink: 0; }
.kb-q { font-weight: 600; }
.kb-a { font-size: 0.875rem; color: var(--ui-text-muted); margin: 0.5rem 0; white-space: pre-wrap; }
.kb-entry-actions { display: flex; gap: 0.25rem; }
.kb-empty { text-align: center; color: var(--ui-text-muted); }
.kb-loading { display: flex; justify-content: center; padding: 2.5rem 0; color: var(--ui-text-muted); font-size: 1.5rem; }
</style>

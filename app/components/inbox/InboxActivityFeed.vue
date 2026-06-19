<script setup lang="ts">
import ActivityItem, { type Activity } from '../crm/ActivityItem.vue'

const props = defineProps<{
  // Comments key off record_type ('conversation'); activity keys off table_name
  // ('conversations'). They differ, so both are passed explicitly.
  recordType: string
  tableName: string
  recordId: number
}>()

interface CommentWithAuthor {
  id: number
  record_type: string
  record_id: number
  user_id: string | null
  author_label: string | null
  author_name: string
  content: Record<string, any>
  created_at: string
  updated_at: string
}

type FeedItem =
  | { key: string; kind: 'comment'; ts: number; comment: CommentWithAuthor }
  | { key: string; kind: 'activity'; ts: number; activity: Activity }

const { user } = useAuthUser()
const toast = useToast()

const comments = ref<CommentWithAuthor[]>([])
const activities = ref<Activity[]>([])
const loading = ref(false)

const newCommentContent = ref<any>(null)
const submitting = ref(false)
const editingId = ref<number | null>(null)
const editContent = ref<any>(null)
const deletingId = ref<number | null>(null)
const showDeleteModal = ref(false)

// Notes and activity woven into one timeline, newest first. Comment times are ISO
// strings; activity times are epoch-ms — normalise both to ms before sorting.
const feed = computed<FeedItem[]>(() => {
  const items: FeedItem[] = []
  for (const c of comments.value) {
    items.push({ key: `c-${c.id}`, kind: 'comment', ts: new Date(c.created_at).getTime(), comment: c })
  }
  for (const a of activities.value) {
    items.push({ key: `a-${a.id}`, kind: 'activity', ts: a.timestamp, activity: a })
  }
  return items.sort((x, y) => y.ts - x.ts)
})

async function fetchFeed() {
  if (!props.recordId) return
  loading.value = true
  // Settle independently so one feed failing doesn't blank the other.
  const [c, a] = await Promise.allSettled([
    $fetch<{ comments: CommentWithAuthor[] }>('/api/admin/comments', {
      params: { record_type: props.recordType, record_id: props.recordId },
    }),
    $fetch<{ activities: Activity[] }>(`/api/admin/activity/${props.tableName}/${props.recordId}`),
  ])
  comments.value = c.status === 'fulfilled' ? c.value.comments : []
  activities.value = a.status === 'fulfilled' ? a.value.activities : []
  loading.value = false
}

async function addComment() {
  if (!newCommentContent.value || isEmptyDoc(newCommentContent.value)) return
  submitting.value = true
  try {
    await $fetch('/api/admin/comments', {
      method: 'POST',
      body: { record_type: props.recordType, record_id: props.recordId, content: newCommentContent.value },
    })
    newCommentContent.value = null
    await fetchFeed()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to add comment', color: 'error' })
  } finally {
    submitting.value = false
  }
}

function startEdit(comment: CommentWithAuthor) {
  editingId.value = comment.id
  editContent.value = comment.content
}

function cancelEdit() {
  editingId.value = null
  editContent.value = null
}

async function saveEdit() {
  if (!editingId.value || !editContent.value) return
  try {
    await $fetch(`/api/admin/comments/${editingId.value}`, { method: 'PUT', body: { content: editContent.value } })
    editingId.value = null
    editContent.value = null
    await fetchFeed()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update comment', color: 'error' })
  }
}

function confirmDelete(id: number) {
  deletingId.value = id
  showDeleteModal.value = true
}

async function deleteComment() {
  if (!deletingId.value) return
  try {
    await $fetch(`/api/admin/comments/${deletingId.value}`, { method: 'DELETE' })
    showDeleteModal.value = false
    deletingId.value = null
    await fetchFeed()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to delete comment', color: 'error' })
  }
}

function isEmptyDoc(content: any): boolean {
  if (!content) return true
  if (content.type !== 'doc') return true
  if (!content.content || content.content.length === 0) return true
  if (content.content.length === 1 && content.content[0].type === 'paragraph' && !content.content[0].content) return true
  return false
}

function isEdited(comment: CommentWithAuthor): boolean {
  return comment.updated_at !== comment.created_at
}

function isOwnComment(comment: CommentWithAuthor): boolean {
  return !!comment.user_id && comment.user_id === user.value?.id
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

watch(() => props.recordId, () => fetchFeed(), { immediate: true })
</script>

<template>
  <div class="feed">
    <!-- Add a note -->
    <div class="feed-composer">
      <CommentEditor v-model="newCommentContent" :mentions="true" />
      <div class="feed-composer-actions">
        <UButton size="sm" :loading="submitting" :disabled="isEmptyDoc(newCommentContent)" @click="addComment">
          Add Comment
        </UButton>
      </div>
    </div>

    <div v-if="loading" class="feed-state">Loading...</div>
    <div v-else-if="feed.length === 0" class="feed-state">No notes or activity yet</div>

    <div v-else class="feed-list">
      <template v-for="item in feed" :key="item.key">
        <!-- Activity entry -->
        <ActivityItem v-if="item.kind === 'activity'" :activity="item.activity" />

        <!-- Internal note -->
        <div v-else class="feed-note" :class="{ 'feed-note-system': !item.comment.user_id }">
          <div class="note-head">
            <UBadge label="Note" color="primary" variant="subtle" icon="i-lucide-sticky-note" size="xs" />
            <span class="note-time">{{ formatTime(item.comment.created_at) }}</span>
            <div class="note-spacer" />
            <div v-if="isOwnComment(item.comment)" class="note-actions">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="startEdit(item.comment)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="confirmDelete(item.comment.id)" />
            </div>
          </div>
          <div class="note-author">
            {{ item.comment.author_name }}
            <UBadge v-if="!item.comment.user_id" :label="item.comment.author_label || 'System'" variant="subtle" size="xs" />
            <span v-if="isEdited(item.comment)" class="note-edited">(edited)</span>
          </div>

          <!-- Edit mode -->
          <div v-if="editingId === item.comment.id" class="note-edit">
            <CommentEditor v-model="editContent" :mentions="true" />
            <div class="note-edit-actions">
              <UButton size="xs" variant="outline" @click="cancelEdit">Cancel</UButton>
              <UButton size="xs" @click="saveEdit">Save</UButton>
            </div>
          </div>

          <!-- View mode -->
          <div v-else class="note-body">
            <RichTextViewer :content="item.comment.content" :item-id="String(item.comment.id)" />
          </div>
        </div>
      </template>
    </div>

    <ConfirmModal
      v-model:open="showDeleteModal"
      title="Delete Comment"
      message="Are you sure you want to delete this comment?"
      warning="This action cannot be undone."
      confirm-text="Delete"
      confirm-color="error"
      @confirm="deleteComment"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>

<style scoped>
.feed {
  display: flex;
  flex-direction: column;
}

.feed-composer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 1rem 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.feed-composer-actions {
  display: flex;
  justify-content: flex-end;
}

.feed-state {
  padding: 1rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.feed-list {
  display: flex;
  flex-direction: column;
}

/* Mirrors ActivityItem's row chrome so notes and activity read as one timeline. */
.feed-note {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.feed-note:last-child {
  border-bottom: none;
}

.feed-note-system {
  background-color: var(--ui-bg);
}

.note-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.note-time {
  font-size: 0.75rem;
  color: var(--color-neutral-500);
}

.note-spacer {
  flex: 1;
}

.note-actions {
  display: flex;
  gap: 0.25rem;
}

.note-author {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-neutral-500);
  margin-top: 0.25rem;
}

.note-edited {
  font-style: italic;
}

.note-body {
  margin-top: 0.375rem;
  font-size: 0.875rem;
}

.note-body :deep(.prose p:first-child) {
  margin-top: 0;
}

.note-body :deep(.prose p:last-child) {
  margin-bottom: 0;
}

.note-edit {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.375rem;
}

.note-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>

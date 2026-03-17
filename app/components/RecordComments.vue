<script setup lang="ts">
const props = defineProps<{
  recordType: string
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

const { user } = useAuthUser()
const toast = useToast()

const comments = ref<CommentWithAuthor[]>([])
const loading = ref(false)
const submitting = ref(false)
const newCommentContent = ref<any>(null)
const editingId = ref<number | null>(null)
const editContent = ref<any>(null)
const deletingId = ref<number | null>(null)
const showDeleteModal = ref(false)

async function fetchComments() {
  loading.value = true
  try {
    const res = await $fetch<{ comments: CommentWithAuthor[] }>('/api/admin/comments', {
      params: { record_type: props.recordType, record_id: props.recordId }
    })
    comments.value = res.comments
  } catch {
    comments.value = []
  } finally {
    loading.value = false
  }
}

async function addComment() {
  if (!newCommentContent.value || isEmptyDoc(newCommentContent.value)) return

  submitting.value = true
  try {
    await $fetch('/api/admin/comments', {
      method: 'POST',
      body: {
        record_type: props.recordType,
        record_id: props.recordId,
        content: newCommentContent.value
      }
    })
    newCommentContent.value = null
    await fetchComments()
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
    await $fetch(`/api/admin/comments/${editingId.value}`, {
      method: 'PUT',
      body: { content: editContent.value }
    })
    editingId.value = null
    editContent.value = null
    await fetchComments()
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
    await fetchComments()
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

function formatCommentTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

watch(() => props.recordId, () => {
  if (props.recordId) fetchComments()
}, { immediate: true })
</script>

<template>
  <CrmFormSection title="Comments">
    <div v-if="loading" class="comments-loading">Loading...</div>

    <div v-else class="comments-container">
      <!-- Comment list -->
      <div v-if="comments.length > 0" class="comments-list">
        <div
          v-for="comment in comments"
          :key="comment.id"
          class="comment"
          :class="{ 'comment-system': !comment.user_id }"
        >
          <div class="comment-header">
            <div class="comment-author">
              <span class="author-name">{{ comment.author_name }}</span>
              <UBadge v-if="!comment.user_id" :label="comment.author_label || 'System'" variant="subtle" size="xs" />
              <span class="comment-time">{{ formatCommentTime(comment.created_at) }}</span>
              <span v-if="isEdited(comment)" class="comment-edited">(edited)</span>
            </div>
            <div v-if="isOwnComment(comment)" class="comment-actions">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="startEdit(comment)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="confirmDelete(comment.id)" />
            </div>
          </div>

          <!-- Edit mode -->
          <div v-if="editingId === comment.id" class="comment-edit">
            <RichTextEditor v-model="editContent" :mentions="true" />
            <div class="comment-edit-actions">
              <UButton size="xs" variant="outline" @click="cancelEdit">Cancel</UButton>
              <UButton size="xs" @click="saveEdit">Save</UButton>
            </div>
          </div>

          <!-- View mode -->
          <div v-else class="comment-body">
            <RichTextViewer :content="comment.content" :item-id="String(comment.id)" />
          </div>
        </div>
      </div>

      <div v-else-if="!loading" class="comments-empty">
        No comments yet
      </div>

      <!-- New comment form -->
      <div class="new-comment">
        <RichTextEditor v-model="newCommentContent" :mentions="true" />
        <div class="new-comment-actions">
          <UButton @click="addComment" :loading="submitting" :disabled="isEmptyDoc(newCommentContent)">
            Add Comment
          </UButton>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
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
  </CrmFormSection>
</template>

<style scoped>
.comments-loading,
.comments-empty {
  padding: 1rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.comments-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comment {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 0.75rem;
}

.comment-system {
  background-color: var(--ui-bg);
  border-style: dashed;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.comment-author {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.author-name {
  font-weight: 600;
  color: var(--ui-text);
}

.comment-time {
  color: var(--ui-text-muted);
}

.comment-edited {
  color: var(--ui-text-muted);
  font-style: italic;
  font-size: 0.75rem;
}

.comment-actions {
  display: flex;
  gap: 0.25rem;
}

.comment-body {
  font-size: 0.875rem;
}

.comment-body :deep(.rich-text-viewer) {
  font-size: 0.875rem;
}

.comment-body :deep(.prose) {
  font-size: 0.875rem;
}

.comment-body :deep(.prose p:first-child) {
  margin-top: 0;
}

.comment-body :deep(.prose p:last-child) {
  margin-bottom: 0;
}

.comment-edit {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.comment-edit :deep(.editor-wrapper) {
  min-height: auto;
}

.comment-edit :deep(.editor-content) {
  padding: 16px;
  min-height: 80px;
}

.comment-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.new-comment {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.new-comment :deep(.editor-wrapper) {
  min-height: auto;
}

.new-comment :deep(.editor-content) {
  padding: 16px;
  min-height: 80px;
}

.new-comment-actions {
  display: flex;
  justify-content: flex-end;
}
</style>

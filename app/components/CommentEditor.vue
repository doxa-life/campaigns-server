<script setup lang="ts">
import { mentionSuggestion } from '~/utils/mentionSuggestion'

const props = withDefaults(defineProps<{
  modelValue: any
  mentions?: boolean
}>(), {
  mentions: false
})

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const content = computed({
  get: () => parseContent(props.modelValue),
  set: (value) => emit('update:modelValue', value)
})

function parseContent(value: any) {
  const emptyDoc = {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  }

  if (!value) return emptyDoc
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return emptyDoc
    }
  }

  if (value.type === 'doc' && (!value.content || value.content.length === 0)) {
    return emptyDoc
  }

  return value
}

const bubbleToolbarItems = computed(() => [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic' },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough' }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered' }
  ],
  [
    { slot: 'link' as const, icon: 'i-lucide-link' }
  ]
])
</script>

<template>
  <div class="comment-editor-wrapper">
    <UEditor
      v-model="content"
      content-type="json"
      placeholder="Write a comment..."
      :image="false"
      :mention="props.mentions ? { HTMLAttributes: { class: 'mention' }, suggestion: mentionSuggestion } : false"
      class="comment-editor-content"
      :ui="{ content: 'p-0 sm:p-0 [&_.tiptap]:sm:px-0' }"
    >
      <template #default="{ editor }">
        <UEditorToolbar
          v-if="editor"
          layout="bubble"
          :editor="editor"
          :items="bubbleToolbarItems"
        >
          <template #link>
            <EditorLinkPopover :editor="editor" />
          </template>
        </UEditorToolbar>
      </template>
    </UEditor>
  </div>
</template>

<style scoped>
.comment-editor-wrapper {
  background: white;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  transition: border-color 0.15s ease;
}

.comment-editor-wrapper:hover {
  border-color: var(--ui-border-accented);
}

.comment-editor-wrapper:focus-within {
  border-color: var(--ui-border-accented);
  box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.1);
}

.comment-editor-content {
  padding: 12px 16px;
  min-height: 80px;
  cursor: text;
}

:deep(.ProseMirror) {
  outline: none;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ui-text);
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--ui-text-muted);
  pointer-events: none;
  font-style: italic;
  float: left;
  height: 0;
}

:deep(.ProseMirror p) {
  margin: 0.25rem 0;
}

:deep(.ProseMirror p:first-child) {
  margin-top: 0;
}

:deep(.ProseMirror p:last-child) {
  margin-bottom: 0;
}

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  padding-left: 1rem;
}

:deep(.ProseMirror ul) {
  list-style-type: disc;
}

:deep(.ProseMirror ol) {
  list-style-type: decimal;
}

:deep(.ProseMirror li) {
  margin: 0.125rem 0;
}

:deep(.ProseMirror li p) {
  margin: 0.125rem 0;
}

:deep(.ProseMirror a) {
  color: var(--ui-primary);
  text-decoration: underline;
  cursor: pointer;
}

:deep(.ProseMirror .mention) {
  background-color: var(--ui-bg-elevated, #DBEAFE);
  color: var(--ui-primary, #2563eb);
  border-radius: 4px;
  padding: 0.1em 0.3em;
  font-weight: 500;
  font-size: 0.95em;
  white-space: nowrap;
}
</style>

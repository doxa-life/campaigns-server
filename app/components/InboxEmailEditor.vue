<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { createPasteHandler } from '~/utils/editorPaste'

const props = withDefaults(defineProps<{
  modelValue: string
  // Omitted when composing a brand-new email (no conversation yet) — then inline
  // images upload to the conversation-less endpoint.
  conversationId?: number
  placeholder?: string
}>(), {
  modelValue: '',
  placeholder: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const content = computed({
  get: () => props.modelValue || '',
  set: (value: string) => emit('update:modelValue', value)
})

const toast = useToast()
const editorRef = ref<{ editor: Editor | undefined }>()
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

// Inbox replies only allow H1/H2, so cap pasted headings at level 2.
const handlePaste = createPasteHandler({ maxHeadingLevel: 2 })

// Always-visible toolbar: bold/italic/underline/strike · H1/H2 ·
// bullet/numbered list · quote · link/image/divider · undo/redo.
const toolbarItems: any = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', 'aria-label': 'Bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', 'aria-label': 'Italic', tooltip: { text: 'Italic' } },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', 'aria-label': 'Underline', tooltip: { text: 'Underline' } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', 'aria-label': 'Strikethrough', tooltip: { text: 'Strikethrough' } }
  ],
  [
    { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', 'aria-label': 'Heading 1', tooltip: { text: 'Heading 1' } },
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', 'aria-label': 'Heading 2', tooltip: { text: 'Heading 2' } }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', 'aria-label': 'Bullet list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', 'aria-label': 'Numbered list', tooltip: { text: 'Numbered list' } },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', 'aria-label': 'Quote', tooltip: { text: 'Quote' } }
  ],
  [
    { slot: 'link' },
    { slot: 'image' },
    { kind: 'horizontalRule', icon: 'i-lucide-minus', 'aria-label': 'Divider', tooltip: { text: 'Divider' } }
  ],
  [
    { kind: 'undo', icon: 'i-lucide-undo', 'aria-label': 'Undo', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo', 'aria-label': 'Redo', tooltip: { text: 'Redo' } }
  ]
]

function pickImage() {
  fileInput.value?.click()
}

async function onImagePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // reset so the same file can be re-selected
  if (!file) return

  const editor = editorRef.value?.editor
  if (!editor) return

  uploading.value = true
  try {
    // Inbox images go to the PRIVATE bucket and render via an auth'd proxy URL;
    // they're CID-embedded into the email at send time (never a public URL).
    const fd = new FormData()
    fd.append('image', file)
    const endpoint = props.conversationId
      ? `/api/admin/inbox/conversations/${props.conversationId}/inline-images`
      : '/api/admin/inbox/inline-images'
    const res = await $fetch<{ url: string }>(endpoint, { method: 'POST', body: fd })
    editor.chain().focus().setImage({ src: res.url }).run()
  } catch (err: any) {
    toast.add({ title: err?.data?.statusMessage || err?.message || 'Image upload failed', color: 'error' })
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="email-editor-wrapper">
    <UEditor
      ref="editorRef"
      v-model="content"
      content-type="html"
      :placeholder="placeholder"
      :editor-props="{ handlePaste }"
      class="email-editor-content"
    >
      <template #default="{ editor }">
        <UEditorToolbar
          v-if="editor"
          layout="fixed"
          :editor="editor"
          :items="toolbarItems"
          class="email-editor-toolbar"
        >
          <template #link>
            <EditorLinkPopover :editor="editor" />
          </template>

          <template #image>
            <UTooltip text="Image">
              <UButton
                icon="i-lucide-image"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="uploading"
                aria-label="Insert image"
                @click="pickImage"
              />
            </UTooltip>
          </template>
        </UEditorToolbar>
      </template>
    </UEditor>

    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="hidden-file"
      @change="onImagePicked"
    >
  </div>
</template>

<style scoped>
.email-editor-wrapper {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  background: var(--ui-bg);
}

.email-editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.email-editor-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Make the editable area fill the box so clicking anywhere focuses it. */
.email-editor-content :deep([data-slot="content"]) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

:deep(.ProseMirror) {
  flex: 1;
  min-height: 320px;
  padding: 0.75rem 1rem;
  cursor: text;
  outline: none;
  font-size: 0.9rem;
  line-height: 1.6;
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
  margin: 0.4rem 0;
}

:deep(.ProseMirror p:first-child) {
  margin-top: 0;
}

:deep(.ProseMirror h1) {
  font-size: 1.6em;
  font-weight: 700;
  line-height: 1.25;
  margin: 0.8rem 0 0.4rem;
}

:deep(.ProseMirror h2) {
  font-size: 1.3em;
  font-weight: 700;
  line-height: 1.3;
  margin: 0.7rem 0 0.35rem;
}

:deep(.ProseMirror h1:first-child),
:deep(.ProseMirror h2:first-child) {
  margin-top: 0;
}

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  padding-left: 1.25rem;
}

:deep(.ProseMirror ul) {
  list-style-type: disc;
}

:deep(.ProseMirror ol) {
  list-style-type: decimal;
}

:deep(.ProseMirror li) {
  margin: 0.15rem 0;
}

:deep(.ProseMirror li p) {
  margin: 0.15rem 0;
}

:deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--ui-border);
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: var(--ui-text-muted);
  font-style: italic;
}

:deep(.ProseMirror a) {
  color: var(--ui-primary);
  text-decoration: underline;
  cursor: pointer;
}

:deep(.ProseMirror img) {
  max-width: 100%;
  max-height: 480px;
  height: auto;
  border-radius: 6px;
  margin: 0.5rem 0;
  display: block;
}

:deep(.ProseMirror div[data-type="horizontalRule"]) {
  margin: 0.75rem 0;
}

:deep(.ProseMirror hr) {
  border: none;
  border-top: 1px solid var(--ui-border);
}

.hidden-file {
  display: none;
}
</style>

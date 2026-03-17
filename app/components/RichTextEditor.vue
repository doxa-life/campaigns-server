<script setup lang="ts">
import ImageResize from 'tiptap-extension-resize-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Typography from '@tiptap/extension-typography'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Youtube from '@tiptap/extension-youtube'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { ImageUploadExtension } from '~/utils/imageUploadExtension'
import { Spacer } from '~/extensions/spacer'
import { Vimeo } from '~/extensions/vimeo'
import { Verse } from '~/extensions/verse'
import { editorConfig } from '~/config/editor.config'
import { mentionSuggestion } from '~/utils/mentionSuggestion'
import { uploadImage } from '~/composables/editor/useImageUpload'
import { useEditorHandlers, textColors, highlightColors } from '~/composables/editor/useEditorHandlers'
import { useVideoEmbed } from '~/composables/editor/useVideoEmbed'
import { useEditorDragHandle } from '~/composables/editor/useEditorDragHandle'
import type { Editor } from '@tiptap/core'

const props = withDefaults(defineProps<{
  modelValue: any
  mentions?: boolean
}>(), {
  mentions: false
})

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const { showError } = useModal()
const { createCustomHandlers } = useEditorHandlers()

/**
 * Normalize pasted HTML to ensure TipTap can parse it correctly.
 * Strips framework-specific attributes and normalizes elements.
 */
const transformPastedHTML = (html: string): string => {
  const container = document.createElement('div')
  container.innerHTML = html

  container.querySelectorAll('meta, style, script, noscript').forEach((el) => el.remove())

  container.querySelectorAll('.wp-block-spacer, [aria-hidden="true"]').forEach((el) => el.remove())

  container.querySelectorAll('.section-header').forEach((div) => {
    const heading = div.querySelector('h1, h2, h3, h4, h5, h6')
    if (heading) {
      div.replaceWith(heading)
    }
  })

  container.querySelectorAll('figure').forEach((figure) => {
    const img = figure.querySelector('img')
    if (img) {
      figure.replaceWith(img)
    }
  })

  container.querySelectorAll('mark').forEach((mark) => {
    const span = document.createElement('span')
    span.innerHTML = mark.innerHTML
    mark.replaceWith(span)
  })

  container.querySelectorAll('.gb-notice-title, .gb-notice-text, .wp-block-genesis-blocks-gb-notice').forEach((div) => {
    const fragment = document.createDocumentFragment()
    while (div.firstChild) {
      fragment.appendChild(div.firstChild)
    }
    div.replaceWith(fragment)
  })

  container.querySelectorAll('div.wp-block-image, div[class^="wp-block"]').forEach((div) => {
    const hasBlockContent = div.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, img, blockquote')
    if (hasBlockContent || div.children.length === 0) {
      const fragment = document.createDocumentFragment()
      while (div.firstChild) {
        fragment.appendChild(div.firstChild)
      }
      div.replaceWith(fragment)
    }
  })

  const allElements = container.querySelectorAll('*')
  allElements.forEach((el) => {
    const attrsToRemove: string[] = []
    for (const attr of el.attributes) {
      if (
        attr.name.startsWith('data-v-') ||
        attr.name.startsWith('data-react') ||
        attr.name.startsWith('data-ng-') ||
        attr.name.startsWith('ng-') ||
        attr.name.startsWith('_ngcontent') ||
        attr.name.startsWith('_nghost')
      ) {
        attrsToRemove.push(attr.name)
      }
    }
    attrsToRemove.forEach((attr) => el.removeAttribute(attr))

    if (el.tagName === 'SPAN') {
      const style = (el as HTMLElement).style
      if (style.fontWeight === 'bold' || style.fontWeight === '700' || style.fontWeight === '600') {
        const strong = document.createElement('strong')
        strong.innerHTML = el.innerHTML
        el.replaceWith(strong)
      } else if (style.fontStyle === 'italic') {
        const em = document.createElement('em')
        em.innerHTML = el.innerHTML
        el.replaceWith(em)
      }
    }

    if (el.tagName === 'B') {
      const strong = document.createElement('strong')
      strong.innerHTML = el.innerHTML
      el.replaceWith(strong)
    }

    if (el.tagName === 'I' && !el.classList.contains('icon')) {
      const em = document.createElement('em')
      em.innerHTML = el.innerHTML
      el.replaceWith(em)
    }
  })

  container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    heading.removeAttribute('class')

    if (['H4', 'H5', 'H6'].includes(heading.tagName)) {
      const h3 = document.createElement('h3')
      h3.innerHTML = heading.innerHTML
      heading.replaceWith(h3)
    }
  })

  container.querySelectorAll('ul, ol, li').forEach((el) => {
    el.removeAttribute('class')
    el.removeAttribute('style')
  })

  container.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href')
    while (link.attributes.length > 0) {
      const attr = link.attributes[0]
      if (attr) link.removeAttribute(attr.name)
    }
    if (href) {
      link.setAttribute('href', href)
    }
  })

  container.querySelectorAll('p').forEach((p) => {
    p.removeAttribute('class')
    const style = p.getAttribute('style')
    if (style && !style.includes('text-align')) {
      p.removeAttribute('style')
    }
  })

  container.querySelectorAll('span:empty, div:empty').forEach((el) => {
    if (!el.hasChildNodes()) {
      el.remove()
    }
  })

  return container.innerHTML
}

function handlePaste(view: any, event: ClipboardEvent) {
  const clipboardData = event.clipboardData
  if (!clipboardData) return false

  const html = clipboardData.getData('text/html')
  if (html) {
    const cleanedHTML = transformPastedHTML(html)

    const { state, dispatch } = view
    const parser = ProseMirrorDOMParser.fromSchema(state.schema)
    const container = document.createElement('div')
    container.innerHTML = cleanedHTML

    const slice = parser.parseSlice(container)
    const tr = state.tr.replaceSelection(slice)
    dispatch(tr)

    return true
  }

  return false
}

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

const customExtensions = [
  ImageResize.configure({ inline: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Typography,
  Subscript,
  Superscript,
  Spacer.configure({ defaultHeight: 24 }),
  Verse,
  Youtube.configure({
    inline: false,
    width: 640,
    height: 360,
    allowFullscreen: true,
    autoplay: false,
    controls: true,
    nocookie: true
  }),
  Vimeo.configure({
    inline: false,
    width: 640,
    height: 360,
    allowFullscreen: true,
    autoplay: false,
    controls: true
  }),
  ImageUploadExtension.configure({
    type: 'imageResize',
    accept: editorConfig.upload.image.accept,
    limit: editorConfig.upload.image.limit,
    maxSize: editorConfig.upload.image.maxSize,
    upload: uploadImage,
    onError: async (error: Error) => {
      console.error('Upload error:', error)
      await showError(`Upload failed: ${error.message}`)
    },
    onSuccess: (url: string) => {
      console.log('Upload successful:', url)
    }
  })
]

const { showVideoUrlModal } = useVideoEmbed()

// Editor ref
const editorRef = ref<{ editor: Editor | undefined }>()

// Custom handlers for items that need special behavior
// Note: execute should return the chain, caller adds .run()
const customHandlers = {
  ...createCustomHandlers(),
  // Image upload handler
  imageUpload: {
    canExecute: (editor: Editor) => editor.can().setImageUploadNode(),
    execute: (editor: Editor) => editor.chain().focus().setImageUploadNode(),
    isActive: () => false,
    isDisabled: (editor: Editor) => !editor.isEditable
  },
  // Video embed handler - returns chain but also shows modal
  video: {
    canExecute: () => true,
    execute: (editor: Editor) => {
      showVideoUrlModal(editor)
      return editor.chain().focus()
    },
    isActive: () => false,
    isDisabled: (editor: Editor) => !editor.isEditable
  },
  // Verse block handler
  verse: {
    canExecute: (editor: Editor) => editor.can().setVerse(),
    execute: (editor: Editor) => editor.chain().focus().setVerse(),
    isActive: (editor: Editor) => editor.isActive('verse'),
    isDisabled: (editor: Editor) => !editor.isEditable
  },
  // Spacer handler
  spacer: {
    canExecute: (editor: Editor) => editor.can().setSpacer(),
    execute: (editor: Editor) => editor.chain().focus().setSpacer(),
    isActive: () => false,
    isDisabled: (editor: Editor) => !editor.isEditable
  }
}

// Shared block type options for Turn into and Style menus
const blockTypeItems = [
  { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-pilcrow' },
  { kind: 'heading', level: 1, label: 'Heading 1', icon: 'i-lucide-heading-1' },
  { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
  { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
  { kind: 'bulletList', label: 'Bullet List', icon: 'i-lucide-list' },
  { kind: 'orderedList', label: 'Numbered List', icon: 'i-lucide-list-ordered' },
  { kind: 'taskList', label: 'Task List', icon: 'i-lucide-list-check' },
  { kind: 'blockquote', label: 'Quote', icon: 'i-lucide-text-quote' },
  { kind: 'verse', label: 'Verse', icon: 'i-lucide-book-open' },
  { kind: 'codeBlock', label: 'Code Block', icon: 'i-lucide-square-code' }
]

// Insert items for slash commands
const insertItems = [
  { kind: 'imageUpload', label: 'Image', icon: 'i-lucide-image' },
  { kind: 'video', label: 'Video', icon: 'i-lucide-video' },
  { kind: 'horizontalRule', label: 'Horizontal Rule', icon: 'i-lucide-separator-horizontal' },
  { kind: 'spacer', label: 'Spacer', icon: 'i-lucide-space' }
]

const bubbleToolbarItems = computed(() => [
  [
    {
      label: 'Turn into',
      icon: 'i-lucide-pilcrow',
      items: blockTypeItems
    }
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic' },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline' },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough' }
  ],
  [
    { kind: 'textAlign', align: 'left', icon: 'i-lucide-align-left' },
    { kind: 'textAlign', align: 'center', icon: 'i-lucide-align-center' },
    { kind: 'textAlign', align: 'right', icon: 'i-lucide-align-right' },
    { kind: 'textAlign', align: 'justify', icon: 'i-lucide-align-justify' }
  ],
  [
    { slot: 'link' as const, icon: 'i-lucide-link' },
    { slot: 'textColor' as const, icon: 'i-lucide-palette' },
    { slot: 'highlight' as const, icon: 'i-lucide-highlighter' }
  ],
  [
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code' }
  ]
])

const slashCommandItems = [
  [
    { type: 'label', label: 'Style' },
    ...blockTypeItems
  ],
  [
    { type: 'label', label: 'Insert' },
    ...insertItems
  ]
]

// Enhanced drag handle
const { getItems: getDragHandleItems, onNodeChange } = useEditorDragHandle(customHandlers)

const showColorPicker = ref(false)
const showHighlightPicker = ref(false)

const setColor = (color: string | null) => {
  const editor = editorRef.value?.editor
  if (!editor) return

  if (color === null) {
    editor.chain().focus().unsetColor().run()
  } else {
    editor.chain().focus().setColor(color).run()
  }
  showColorPicker.value = false
}

const setHighlight = (color: string | null) => {
  const editor = editorRef.value?.editor
  if (!editor) return

  if (color === null) {
    editor.chain().focus().unsetHighlight().run()
  } else {
    editor.chain().focus().setHighlight({ color }).run()
  }
  showHighlightPicker.value = false
}
</script>

<template>
  <div class="editor-wrapper">
    <UEditor
      ref="editorRef"
      v-model="content"
      content-type="json"
      :extensions="customExtensions"
      :handlers="customHandlers"
      :placeholder="editorConfig.placeholder.default"
      :image="false"
      :mention="props.mentions ? { HTMLAttributes: { class: 'mention' }, suggestion: mentionSuggestion } : false"
      :editor-props="{ transformPastedHTML, handlePaste }"
      class="editor-content"
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

          <template #textColor>
            <UPopover v-model:open="showColorPicker">
              <UButton
                variant="ghost"
                size="xs"
                icon="i-lucide-palette"
              />
              <template #content>
                <div class="p-2">
                  <div class="text-xs font-semibold text-(--ui-text-muted) uppercase tracking-wide mb-2">Text color</div>
                  <div class="grid grid-cols-3 gap-1">
                    <button
                      v-for="color in textColors"
                      :key="color.name"
                      class="w-6 h-6 rounded hover:ring-2 hover:ring-(--ui-border-accented) cursor-pointer"
                      :style="{ backgroundColor: color.value || '#000000' }"
                      :title="color.name"
                      @click="setColor(color.value)"
                    />
                  </div>
                </div>
              </template>
            </UPopover>
          </template>

          <template #highlight>
            <UPopover v-model:open="showHighlightPicker">
              <UButton
                variant="ghost"
                size="xs"
                icon="i-lucide-highlighter"
              />
              <template #content>
                <div class="p-2">
                  <div class="text-xs font-semibold text-(--ui-text-muted) uppercase tracking-wide mb-2">Background</div>
                  <div class="grid grid-cols-3 gap-1">
                    <button
                      v-for="highlight in highlightColors"
                      :key="highlight.name"
                      class="w-6 h-6 rounded border border-(--ui-border) hover:ring-2 hover:ring-(--ui-border-accented) cursor-pointer"
                      :style="{ backgroundColor: highlight.value || '#FFFFFF' }"
                      :title="highlight.name"
                      @click="setHighlight(highlight.value)"
                    />
                  </div>
                </div>
              </template>
            </UPopover>
          </template>
        </UEditorToolbar>

        <UEditorDragHandle
          v-if="editor"
          :editor="editor"
          :items="getDragHandleItems(editor)"
          @node-change="onNodeChange"
        />

        <UEditorSuggestionMenu
          v-if="editor"
          :editor="editor"
          :items="slashCommandItems"
          :options="{ placement: 'bottom-start', flip: true, shift: true }"
        />
      </template>
    </UEditor>
  </div>
</template>

<style scoped>
.editor-wrapper {
  background: white;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  transition: border-color 0.15s ease;
}

.editor-wrapper:hover {
  border-color: var(--ui-border-accented);
}

.editor-wrapper:focus-within {
  border-color: var(--ui-border-accented);
  box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.1);
}

.editor-content {
  padding: 40px 56px;
  min-height: 300px;
  cursor: text;
}

:deep(.ProseMirror) {
  outline: none;
  font-size: 16px;
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

:deep(.ProseMirror h1) {
  font-size: 2.5em;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  color: var(--ui-text);
}

:deep(.ProseMirror h1:first-child) {
  margin-top: 0;
}

:deep(.ProseMirror h2) {
  font-size: 1.875em;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--ui-text);
}

:deep(.ProseMirror h2:first-child) {
  margin-top: 0;
}

:deep(.ProseMirror h3) {
  font-size: 1.5em;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  color: var(--ui-text);
}

:deep(.ProseMirror h3:first-child) {
  margin-top: 0;
}

:deep(.ProseMirror p) {
  margin: 0.75rem 0;
  line-height: 1.6;
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
  margin: 0.25rem 0;
}

:deep(.ProseMirror li p) {
  margin: 0.25rem 0;
}

:deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
}

:deep(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

:deep(.ProseMirror ul[data-type="taskList"] li > label) {
  margin-top: 0.1rem;
  flex-shrink: 0;
}

:deep(.ProseMirror ul[data-type="taskList"] li > div) {
  flex: 1;
}

:deep(.ProseMirror ul[data-type="taskList"] li input[type="checkbox"]) {
  flex: 0 0 auto;
  width: 1.125rem;
  height: 1.125rem;
  margin-right: 0;
  margin-top: 0.25rem;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  border: 2px solid #6b7280;
  border-radius: 0.25rem;
  background-color: white;
  position: relative;
  transition: all 0.15s ease;
  display: inline-block;
  z-index: 10;
}

:deep(.ProseMirror ul[data-type="taskList"] li input[type="checkbox"]:checked) {
  background-color: #000000;
  border-color: #000000;
}

:deep(.ProseMirror ul[data-type="taskList"] li input[type="checkbox"]:checked::after) {
  content: '';
  display: block;
  position: absolute;
  left: 0.25rem;
  top: 0.0625rem;
  width: 0.375rem;
  height: 0.625rem;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

:deep(.ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div) {
  text-decoration: line-through;
  opacity: 0.6;
}

:deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--ui-border);
  padding-left: 1rem;
  margin: 1rem 0;
  color: var(--ui-text-muted);
  font-style: italic;
}

:deep(.ProseMirror code) {
  background: var(--ui-bg-muted);
  color: #EF4444;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
}

:deep(.ProseMirror pre) {
  background: #1F2937;
  color: #F3F4F6;
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
  font-size: 0.875rem;
  line-height: 1.7;
}

:deep(.ProseMirror pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

:deep(.ProseMirror hr) {
  border: none;
  border-top: 1px solid var(--ui-border);
  margin: 2rem 0;
  padding: 12px 0;
  cursor: pointer;
}

:deep(.ProseMirror div[data-type="spacer"]) {
  position: relative;
  min-height: 12px;
  margin: 0.5rem 0;
  cursor: default;
  border: 2px dashed var(--ui-border);
  border-radius: 4px;
}

:deep(.ProseMirror div[data-type="spacer"].ProseMirror-selectednode) {
  border-color: var(--ui-primary);
  background: rgba(59, 130, 246, 0.05);
}

:deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1.5rem 0;
  display: block;
}

:deep(.ProseMirror div[data-youtube-video]) {
  margin: 1.5rem 0;
  cursor: pointer;
}

:deep(.ProseMirror div[data-youtube-video] iframe) {
  border-radius: 8px;
  border: none;
  max-width: 100%;
  display: block;
}

:deep(.ProseMirror div[data-youtube-video].ProseMirror-selectednode) {
  outline: 2px solid var(--ui-primary);
  border-radius: 8px;
}

:deep(.ProseMirror div[data-vimeo-video]) {
  margin: 1.5rem 0;
  cursor: pointer;
}

:deep(.ProseMirror div[data-vimeo-video] iframe) {
  border-radius: 8px;
  border: none;
  max-width: 100%;
  display: block;
}

:deep(.ProseMirror div[data-vimeo-video].ProseMirror-selectednode) {
  outline: 2px solid var(--ui-primary);
  border-radius: 8px;
}

:deep(.ProseMirror a) {
  color: var(--ui-primary);
  text-decoration: underline;
  cursor: pointer;
  transition: color 0.15s ease;
}

:deep(.ProseMirror a:hover) {
  color: var(--ui-color-primary-600);
}

:deep(.ProseMirror [style*="text-align: left"]) {
  text-align: left;
}

:deep(.ProseMirror [style*="text-align: center"]) {
  text-align: center;
}

:deep(.ProseMirror [style*="text-align: right"]) {
  text-align: right;
}

:deep(.ProseMirror [style*="text-align: justify"]) {
  text-align: justify;
}

:deep(.ProseMirror mark) {
  background-color: #FEF3C7;
  padding: 0.1em 0.2em;
  border-radius: 2px;
}

:deep(.ProseMirror ::selection) {
  background: #DBEAFE;
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

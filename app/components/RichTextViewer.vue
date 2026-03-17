<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
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
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Youtube from '@tiptap/extension-youtube'
import Mention from '@tiptap/extension-mention'
import { Spacer } from '~/extensions/spacer'
import { Vimeo } from '~/extensions/vimeo'
import { Verse } from '~/extensions/verse'

const props = defineProps<{
  content: Record<string, any> | null // TipTap JSON object
  itemId: string
}>()

const emit = defineEmits<{
  'checkbox-change': [itemId: string, updatedContent: any]
}>()

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
const parsedContent = props.content || emptyDoc

// Create read-only editor
const editor = useEditor({
  content: parsedContent,
  editable: false,
  extensions: [
    StarterKit.configure({
      horizontalRule: false,
    }),
    ImageResize.configure({
      inline: false,
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Highlight.configure({
      multicolor: true,
    }),
    Typography,
    Subscript,
    Superscript,
    HorizontalRule,
    Spacer.configure({
      defaultHeight: 24
    }),
    Verse,
    Youtube.configure({
      inline: false,
      width: 640,
      height: 360,
      ccLanguage: 'en',
      interfaceLanguage: 'en',
      allowFullscreen: true,
      autoplay: false,
      controls: true,
      nocookie: true,
      enableIFrameApi: false,
      origin: '',
    }),
    Vimeo.configure({
      inline: false,
      width: 640,
      height: 360,
      allowFullscreen: true,
      autoplay: false,
      byline: true,
      color: '00adef',
      portrait: true,
      title: true,
      controls: true
    }),
    TextStyle,
    Color,
    Mention.configure({
      HTMLAttributes: { class: 'mention' }
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
      onReadOnlyChecked: (node: any, checked: boolean) => {
        // This is called when a checkbox is clicked in read-only mode
        // We'll handle the update by emitting an event
        if (!editor.value) {
          return false
        }

        const { state } = editor.value
        const { doc } = state
        const { tr } = state

        // Get text content of the clicked node for comparison
        const clickedNodeText = node.textContent

        // Find the task item node by comparing content instead of using
        // strict equality which breaks after the editor state updates
        let nodePos = -1
        doc.descendants((n, pos) => {
          if (
            n.type.name === 'taskItem' &&
            n.attrs.checked === !checked && // Find node with opposite checked state (pre-click state)
            n.textContent === clickedNodeText // Match by text content
          ) {
            if (nodePos === -1) { // Take the first match
              nodePos = pos
            }
          }
        })

        if (nodePos !== -1) {
          // Update the checkbox state
          const transaction = tr.setNodeMarkup(nodePos, undefined, {
            ...node.attrs,
            checked,
          })
          editor.value.view.dispatch(transaction)

          // Emit the updated content as JSON object
          const updatedJson = editor.value.getJSON()
          emit('checkbox-change', props.itemId, updatedJson)
        }

        return true
      },
    }),
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-sm max-w-none focus:outline-none'
    }
  }
})

// Watch for content changes
watch(() => props.content, (newContent) => {
  if (!editor.value || !newContent) return

  const currentJson = JSON.stringify(editor.value.getJSON())
  const newJsonStr = JSON.stringify(newContent)

  if (currentJson !== newJsonStr) {
    editor.value.commands.setContent(newContent, { emitUpdate: false })
  }
})

// Cleanup
onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div class="rich-text-viewer">
    <EditorContent v-if="editor" :editor="editor" />
  </div>
</template>

<style scoped>
:deep(.ProseMirror) {
  outline: none;
}

/* Prose styles for rendered content */
:deep(.prose) {
  color: var(--ui-text, var(--color-text, currentColor));
}

:deep(.prose h1) {
  font-size: 2.25em;
  font-weight: 800;
  line-height: 1.1111111;
  margin-top: 0;
  margin-bottom: 0.8888889em;
}

:deep(.prose h2) {
  font-size: 1.5em;
  font-weight: 700;
  line-height: 1.3333333;
  margin-top: 2em;
  margin-bottom: 1em;
}

:deep(.prose h3) {
  font-size: 1.25em;
  font-weight: 600;
  line-height: 1.6;
  margin-top: 1.6em;
  margin-bottom: 0.6em;
}

:deep(.prose p) {
  margin-top: 1.25em;
  margin-bottom: 1.25em;
}

:deep(.prose p:first-child) {
  margin: 0;
}

:deep(.prose p:last-child) {
  margin-bottom: 0;
}

:deep(.prose strong) {
  font-weight: 600;
}

:deep(.prose em) {
  font-style: italic;
}

:deep(.prose ul),
:deep(.prose ol) {
  margin-bottom: 1.25em;
  padding-left: 1.625em;
}

:deep(.prose ul) {
  list-style-type: disc;
}

:deep(.prose ol) {
  list-style-type: decimal;
}

:deep(.prose li) {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

:deep(.prose ul li > p),
:deep(.prose ol li > p) {
  margin-top: 0;
  margin-bottom: 0;
}

/* Task list styles */
:deep(.prose ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
  margin-top: 1.25em;
  margin-bottom: 0;
}

:deep(.prose ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  margin-top: 0.25em;
  margin-bottom: 0.25em;
}

:deep(.prose ul[data-type="taskList"] ul[data-type="taskList"]) {
  margin-top: 0;
}

:deep(.prose ul[data-type="taskList"] li > label) {
  flex: 0 0 auto;
  margin-right: 0.5rem;
  user-select: none;
}

:deep(.prose ul[data-type="taskList"] li > div) {
  flex: 1 1 auto;
}

:deep(.prose img) {
  max-width: 100%;
  height: auto;
  margin-top: 2em;
  margin-bottom: 2em;
  border-radius: 0.375rem;
}

/* ImageResize node view containers - the extension wraps images in divs with inline styles */
:deep(.prose > div) {
  max-width: 100%;
}

/* Centered images need fit-content width for margin auto to work */
:deep(.prose > div[style*="margin: 0 auto"]),
:deep(.prose > div[style*="margin: 0px auto"]) {
  width: fit-content;
}

/* Text alignment support for paragraphs */
:deep(.prose [style*="text-align: center"]) {
  text-align: center;
}

:deep(.prose [style*="text-align: left"]) {
  text-align: left;
}

:deep(.prose [style*="text-align: right"]) {
  text-align: right;
}

:deep(.prose [style*="text-align: justify"]) {
  text-align: justify;
}

:deep(.prose code) {
  font-size: 0.875em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background-color: var(--ui-bg-elevated, #f3f4f6);
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
}

:deep(.prose pre) {
  background-color: #1f2937;
  color: #e5e7eb;
  overflow-x: auto;
  font-size: 0.875em;
  line-height: 1.7142857;
  margin-top: 1.7142857em;
  margin-bottom: 1.7142857em;
  border-radius: 0.375rem;
  padding: 0.8571429em 1.1428571em;
}

:deep(.prose pre code) {
  background-color: transparent;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

:deep(.prose blockquote) {
  font-style: italic;
  border-left: 0.25rem solid var(--ui-border, #e5e7eb);
  padding-left: 1em;
  margin-top: 1.6em;
  margin-bottom: 1.6em;
  color: var(--ui-text-muted, #6b7280);
}

:deep(.prose a) {
  color: var(--ui-text-highlighted, #2563eb);
  text-decoration: underline;
  font-weight: 500;
}

:deep(.prose a:hover) {
  opacity: 0.8;
}

/* Small prose variant */
:deep(.prose-sm) {
  font-size: 0.875rem;
  line-height: 1.7142857;
}

:deep(.prose-sm h1) {
  font-size: 2em;
  margin-top: 0;
  margin-bottom: 0.8em;
  line-height: 1.2;
}

:deep(.prose-sm h2) {
  font-size: 1.4285714em;
  margin-top: 1.6em;
  margin-bottom: 0.8em;
  line-height: 1.4;
}

:deep(.prose-sm h3) {
  font-size: 1.2857143em;
  margin-top: 1.5555556em;
  margin-bottom: 0.4444444em;
  line-height: 1.5555556;
}

:deep(.prose-sm ul li > p) {
  margin-top: 0;
  margin-bottom: 0;
}

/* Checkbox styling for prose-sm */
:deep(.prose-sm ul[data-type="taskList"] li input[type="checkbox"]),
:deep(.prose-sm ul[data-type="taskList"] li[data-type="taskItem"] input[type="checkbox"]) {
  flex: 0 0 auto;
  width: 1.125rem !important;
  height: 1.125rem !important;
  margin-right: 0.5rem;
  margin-top: 0.25rem;
  cursor: pointer;
  appearance: none !important;
  -webkit-appearance: none !important;
  -moz-appearance: none !important;
  border: 2px solid var(--ui-border-accented, #6b7280) !important;
  border-radius: 0.25rem !important;
  background-color: var(--ui-bg, white) !important;
  background-image: none !important;
  position: relative;
  transition: all 0.15s ease;
  display: inline-block;
}

:deep(.prose-sm ul[data-type="taskList"] li input[type="checkbox"]:hover),
:deep(.prose-sm ul[data-type="taskList"] li[data-type="taskItem"] input[type="checkbox"]:hover) {
  border-color: var(--ui-text-muted, #374151) !important;
}

:deep(.prose-sm ul[data-type="taskList"] li input[type="checkbox"]:checked),
:deep(.prose-sm ul[data-type="taskList"] li[data-type="taskItem"] input[type="checkbox"]:checked) {
  background-color: var(--ui-text, #000000) !important;
  border-color: var(--ui-text, #000000) !important;
  background-image: none !important;
}

:deep(.prose-sm ul[data-type="taskList"] li input[type="checkbox"]:checked::after),
:deep(.prose-sm ul[data-type="taskList"] li[data-type="taskItem"] input[type="checkbox"]:checked::after) {
  content: '' !important;
  display: block !important;
  position: absolute;
  left: 0.25rem;
  top: 0.0625rem;
  width: 0.375rem;
  height: 0.625rem;
  border: solid var(--ui-bg, white) !important;
  border-width: 0 2px 2px 0 !important;
  transform: rotate(45deg);
}

:deep(.prose-sm ul[data-type="taskList"] li > div) {
  flex: 1 1 auto;
}

:deep(.prose-sm ul[data-type="taskList"] li[data-checked="true"] > div) {
  text-decoration: line-through;
  opacity: 0.6;
}

/* Spacer */
:deep(.prose div[data-type="spacer"]) {
  position: relative;
  min-height: 12px;
  cursor: default;
}

/* YouTube Video Embeds */
:deep(.prose div[data-youtube-video]) {
  margin: 2em 0;
  position: relative;
}

:deep(.prose div[data-youtube-video] iframe) {
  border-radius: 0.375rem;
  border: none;
  max-width: 100%;
  display: block;
}

/* Vimeo Video Embeds */
:deep(.prose div[data-vimeo-video]) {
  margin: 2em 0;
  position: relative;
}

:deep(.prose div[data-vimeo-video] iframe) {
  border-radius: 0.375rem;
  border: none;
  max-width: 100%;
  display: block;
}

:deep(.prose .mention) {
  background-color: var(--ui-bg-elevated, #DBEAFE);
  color: var(--ui-primary, #2563eb);
  border-radius: 4px;
  padding: 0.1em 0.3em;
  font-weight: 500;
  font-size: 0.95em;
  white-space: nowrap;
}

</style>

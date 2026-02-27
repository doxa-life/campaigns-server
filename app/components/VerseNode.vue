<script setup lang="ts">
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

const language = inject<Ref<string>>('editorLanguage', ref('en'))

const reference = ref(props.node.attrs.reference || '')
const loading = ref(false)
const error = ref('')

const savedReference = computed(() => props.node.attrs.reference || '')
const savedTranslation = computed(() => props.node.attrs.translation || '')

function saveReference() {
  props.updateAttributes({ reference: reference.value || null })
}

async function fetchVerse() {
  const ref = reference.value.trim()
  if (!ref) return

  saveReference()
  loading.value = true
  error.value = ''

  try {
    const data = await $fetch('/api/admin/bible/verse', {
      params: { reference: ref, language: language.value }
    })

    if (data.text) {
      const pos = props.getPos()
      if (typeof pos !== 'number') return

      props.updateAttributes({ translation: data.translation })

      // Replace all content inside the verse node with a single paragraph
      const { state } = props.editor
      const resolvedPos = state.doc.resolve(pos + 1)
      const verseNode = resolvedPos.parent

      // Calculate the range covering all children of the verse node
      const from = pos + 1
      const to = pos + 1 + verseNode.content.size

      const schema = state.schema
      const newParagraph = schema.nodes.paragraph.create(
        null,
        data.text ? schema.text(data.text) : null
      )

      props.editor.view.dispatch(
        state.tr.replaceWith(from, to, newParagraph)
      )
    }
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.message || 'Failed to fetch verse'
  } finally {
    loading.value = false
  }
}

const isEditable = computed(() => props.editor.isEditable)
</script>

<template>
  <NodeViewWrapper
    class="verse-node"
    data-type="verse"
  >
    <div
      v-if="isEditable"
      class="verse-reference-bar"
      contenteditable="false"
    >
      <UInput
        v-model="reference"
        placeholder="e.g. John 3:16"
        size="xs"
        class="verse-reference-input"
        @blur="saveReference"
        @keydown.enter.prevent="fetchVerse"
      />
      <UButton
        icon="i-lucide-book-open-check"
        size="xs"
        variant="solid"
        color="neutral"
        :loading="loading"
        :disabled="!reference.trim()"
        @click="fetchVerse"
      />
    </div>
    <div v-if="error && isEditable" class="verse-error" contenteditable="false">
      {{ error }}
    </div>
    <NodeViewContent class="verse-content" />
    <div v-if="savedReference" class="verse-citation" contenteditable="false">
      {{ savedReference }}<template v-if="savedTranslation">, {{ savedTranslation }}</template>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.verse-node {
  background-color: var(--ui-primary);
  border-radius: 5px;
  padding: 1rem;
  margin: 1rem 0;
}

.verse-reference-bar {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.verse-reference-input {
  flex: 1;
  max-width: 240px;
}

.verse-error {
  color: #fca5a5;
  font-size: 0.75rem;
  margin-bottom: 0.375rem;
}

.verse-citation {
  text-align: right;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8rem;
  font-style: italic;
  margin-top: 0.5rem;
}

:deep(.verse-content p) {
  text-align: center;
  color: white;
  margin: 0.5rem 0;
}

:deep(.verse-content p:first-child) {
  margin-top: 0;
}

:deep(.verse-content p:last-child) {
  margin-bottom: 0;
}
</style>

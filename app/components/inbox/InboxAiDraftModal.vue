<template>
  <UModal v-model:open="isOpen" :title="$t('inbox.ai.modalTitle')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <div class="flex flex-col gap-4">
        <!-- Steer / refine input. Optional: blank just (re)drafts from the thread. -->
        <div class="flex items-end gap-2">
          <UFormField :label="$t('inbox.ai.directionLabel')" class="flex-1">
            <UTextarea
              v-model="direction"
              :rows="2"
              autoresize
              class="w-full"
              :placeholder="$t('inbox.ai.directionPlaceholder')"
              @keydown.enter.meta.prevent="run"
            />
          </UFormField>
          <UButton
            :label="result ? $t('inbox.ai.refine') : $t('inbox.ai.generate')"
            icon="i-lucide-sparkles"
            color="info"
            :loading="generating"
            @click="run"
          />
        </div>

        <!-- Instructions accumulate across refines so an earlier ask isn't dropped by a
             later one. Shown here so the teammate can see — and remove — what's applied. -->
        <div v-if="directions.length" class="ai-applied">
          <span class="ai-label">{{ $t('inbox.ai.appliedInstructions') }}:</span>
          <span v-for="(d, i) in directions" :key="i" class="ai-applied-chip">
            {{ d }}
            <UIcon name="i-lucide-x" class="ai-chip-x" :title="$t('inbox.ai.removeInstruction')" @click="removeDirection(i)" />
          </span>
        </div>

        <!-- First generation: nothing to show yet. -->
        <div v-if="generating && !result" class="ai-modal-loading">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" /> {{ $t('inbox.ai.generatingDraft') }}
        </div>

        <!-- Before the first draft: prompt the teammate to steer (optional) and generate. -->
        <div v-else-if="!result" class="ai-modal-empty">
          <UIcon name="i-lucide-sparkles" class="ai-empty-icon" />
          <p>{{ $t('inbox.ai.emptyHint') }}</p>
        </div>

        <template v-if="result">
          <!-- Two columns when the reply is not in English: editable reply + read-only gloss. -->
          <div class="ai-result-grid" :class="{ 'two-col': needsTranslation }">
            <div class="ai-result-col">
              <span class="ai-col-label">{{ $t('inbox.ai.replyLabel') }} ({{ result.draft_language }})</span>
              <InboxEmailEditor
                v-model="editedHtml"
                :conversation-id="conversationId"
                class="ai-result-editor"
              />
            </div>
            <div v-if="needsTranslation" class="ai-result-col">
              <span class="ai-col-label">{{ $t('inbox.ai.translationLabel') }}</span>
              <div class="ai-translation" v-text="result.english_gloss" />
            </div>
          </div>

          <UAlert
            v-if="result.uncertainty.length"
            icon="i-lucide-triangle-alert"
            color="warning"
            variant="subtle"
            :title="$t('inbox.ai.uncertainty')"
          >
            <template #description>
              <ul class="ai-uncertainty-list">
                <li v-for="(u, i) in result.uncertainty" :key="i">{{ u }}</li>
              </ul>
            </template>
          </UAlert>

          <div v-if="result.sources_used.length" class="ai-sources">
            <span class="ai-label">{{ $t('inbox.ai.sources') }}:</span>
            <UBadge v-for="(s, i) in result.sources_used" :key="i" color="neutral" variant="subtle" size="xs">{{ s }}</UBadge>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="outline" color="neutral" @click="isOpen = false">{{ $t('common.cancel') }}</UButton>
        <UButton color="primary" icon="i-lucide-check" :disabled="!result || generating" @click="use">
          {{ $t('inbox.ai.useResponse') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// Shape returned by the draft-reply endpoint in preview mode (no message persisted).
interface PreviewResult {
  draft_language: string
  draft_html: string
  draft_text: string
  english_gloss: string
  sources_used: string[]
  uncertainty: string[]
}
// Reviewer-facing metadata the composer's review panel shows; mirrors AiDraftMetadata.
interface AiDraftMetadata {
  gloss: string
  language: string
  sources: string[]
  uncertainty: string[]
  model: string
}

const props = defineProps<{
  open: boolean
  conversationId: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  use: [payload: { html: string; meta: AiDraftMetadata }]
}>()

const { t } = useI18n()
const toast = useToast()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const direction = ref('')
// Every instruction given this session, oldest first. Refines apply the whole list so a
// later ask (e.g. "make it shorter") can't silently drop what an earlier one required
// (e.g. "cover the people groups in Chad").
const directions = ref<string[]>([])
const generating = ref(false)
const result = ref<PreviewResult | null>(null)
// The editable reply (the actual outgoing language). The gloss column is reference only.
const editedHtml = ref('')

// English drafts need no translation column — the gloss would just duplicate the draft.
const needsTranslation = computed(() => {
  const lang = result.value?.draft_language?.toLowerCase() || ''
  return !!result.value?.english_gloss && !lang.startsWith('en')
})

// Reset to a clean slate each time the modal opens. Drafting waits for the teammate to
// (optionally) steer and click Generate, rather than spending a call on open.
watch(() => props.open, (open) => {
  if (!open) return
  direction.value = ''
  directions.value = []
  result.value = null
  editedHtml.value = ''
})

// Drop an applied instruction; takes effect on the next Generate/Refine.
function removeDirection(i: number) {
  directions.value.splice(i, 1)
}

// All applied instructions as a numbered list for the prompt. Later items win on conflict.
function buildDirection(): string | undefined {
  if (!directions.value.length) return undefined
  return directions.value.map((d, i) => `${i + 1}. ${d}`).join('\n')
}

// Generate (first pass) or refine (once a draft exists). Preview mode: nothing is
// persisted, so the teammate can iterate freely before committing with "Use response".
async function run() {
  if (generating.value) return
  // Fold the current box into the running list before sending, so this pass applies it
  // alongside every earlier instruction. Clear the box now (it lives in the list) so a
  // failed call doesn't re-add the same line on retry.
  const trimmed = direction.value.trim()
  if (trimmed) directions.value.push(trimmed)
  direction.value = ''
  generating.value = true
  try {
    const res = await $fetch<PreviewResult>(
      `/api/admin/inbox/conversations/${props.conversationId}/draft-reply`,
      {
        method: 'POST',
        body: {
          preview: true,
          direction: buildDirection(),
          // Refine from the teammate's current edits once a draft exists.
          base_draft: result.value ? editedHtml.value : undefined,
        },
      },
    )
    result.value = res
    editedHtml.value = res.draft_html || ''
  } catch (e: any) {
    // 503 = AI not configured; 502 = Anthropic temporarily unreachable (retryable).
    const msg = e?.statusCode === 503 ? t('inbox.ai.notConfigured')
      : e?.statusCode === 502 ? t('inbox.ai.unavailable')
        : t('inbox.toasts.error')
    toast.add({ title: msg, color: 'error' })
  } finally {
    generating.value = false
  }
}

// Hand the (possibly edited) draft to the composer and close.
function use() {
  if (!result.value) return
  emit('use', {
    html: editedHtml.value,
    meta: {
      gloss: result.value.english_gloss,
      language: result.value.draft_language,
      sources: result.value.sources_used,
      uncertainty: result.value.uncertainty,
      model: '',
    },
  })
  isOpen.value = false
}
</script>

<style scoped>
.ai-modal-loading { display: flex; align-items: center; gap: 0.5rem; padding: 1.5rem 0; color: var(--ui-text-muted); }
.ai-applied { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.ai-applied-chip { display: inline-flex; align-items: center; gap: 0.25rem; max-width: 100%; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; background: var(--ui-bg-elevated); border: 1px solid var(--ui-border); color: var(--ui-text); }
.ai-chip-x { cursor: pointer; flex-shrink: 0; color: var(--ui-text-dimmed); }
.ai-chip-x:hover { color: var(--ui-text); }
.ai-modal-empty { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2rem 1rem; text-align: center; color: var(--ui-text-muted); }
.ai-empty-icon { font-size: 1.5rem; color: var(--ui-text-dimmed); }
.ai-result-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
.ai-result-grid.two-col { grid-template-columns: 1fr 1fr; }
.ai-result-col { display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; }
.ai-col-label { font-size: 0.75rem; font-weight: 600; color: var(--ui-text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
.ai-result-editor { border: 1px solid var(--ui-border); border-radius: 8px; min-height: 220px; }
.ai-translation { border: 1px solid var(--ui-border); border-radius: 8px; padding: 0.625rem 0.75rem; min-height: 220px; background: var(--ui-bg-elevated); white-space: pre-wrap; font-size: 0.875rem; color: var(--ui-text-muted); overflow-y: auto; }
.ai-uncertainty-list { margin: 0; padding-left: 1.1rem; list-style: disc; }
.ai-sources { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.ai-label { font-size: 0.8rem; color: var(--ui-text-muted); }
</style>

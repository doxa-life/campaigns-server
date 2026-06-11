<template>
  <UModal v-model:open="isOpen" :title="$t('inbox.kb.addTitle')">
    <template #body>
      <div class="flex flex-col gap-3">
        <div v-if="loading" class="kb-loading">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" /> {{ $t('inbox.kb.generating') }}
        </div>

        <template v-else>
          <p class="kb-hint">{{ $t('inbox.kb.reviewHint') }}</p>

          <UAlert
            v-if="removed.length"
            icon="i-lucide-shield-check"
            color="success"
            variant="subtle"
            :title="$t('inbox.kb.removedTitle')"
            :description="removed.join(', ')"
          />

          <UFormField :label="$t('inbox.kb.question')" required>
            <UTextarea v-model="question" :rows="2" autoresize class="w-full" />
          </UFormField>

          <UFormField :label="$t('inbox.kb.answer')" required>
            <UTextarea v-model="answer" :rows="6" autoresize class="w-full" />
          </UFormField>

          <UFormField :label="$t('inbox.kb.language')">
            <UInput v-model="language" class="w-40" />
          </UFormField>

          <div class="flex justify-end gap-2 mt-2">
            <UButton variant="outline" color="neutral" @click="isOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton :loading="saving" :disabled="!canSave" @click="save">{{ $t('inbox.kb.save') }}</UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  open: boolean
  conversationId: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const { t } = useI18n()
const toast = useToast()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const loading = ref(false)
const saving = ref(false)
const question = ref('')
const answer = ref('')
const language = ref('en')
const removed = ref<string[]>([])

const canSave = computed(() => !!question.value.trim() && !!answer.value.trim())

// Generate a fresh anonymised suggestion each time the modal opens.
watch(() => props.open, async (open) => {
  if (!open) return
  question.value = ''
  answer.value = ''
  language.value = 'en'
  removed.value = []
  loading.value = true
  try {
    const res = await $fetch<{ question: string; answer: string; language: string; removed: string[] }>(
      `/api/admin/inbox/conversations/${props.conversationId}/knowledge-entry/suggest`,
      { method: 'POST' }
    )
    question.value = res.question
    answer.value = res.answer
    language.value = res.language || 'en'
    removed.value = res.removed || []
  } catch (e: any) {
    // 503 = AI not configured; 502 = Anthropic temporarily unreachable (retryable).
    const msg = e?.statusCode === 503 ? t('inbox.ai.notConfigured')
      : e?.statusCode === 502 ? t('inbox.ai.unavailable')
        : t('inbox.toasts.error')
    toast.add({ title: msg, color: 'error' })
    isOpen.value = false
  } finally {
    loading.value = false
  }
})

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    await $fetch('/api/admin/inbox/knowledge-entries', {
      method: 'POST',
      body: {
        question: question.value.trim(),
        answer: answer.value.trim(),
        language: language.value.trim() || 'en',
        source_conversation_id: props.conversationId,
      },
    })
    toast.add({ title: t('inbox.kb.saved'), color: 'success' })
    isOpen.value = false
    emit('saved')
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.kb-loading { display: flex; align-items: center; gap: 0.5rem; padding: 1.5rem 0; color: var(--ui-text-muted); }
.kb-hint { font-size: 0.8rem; color: var(--ui-text-muted); }
</style>

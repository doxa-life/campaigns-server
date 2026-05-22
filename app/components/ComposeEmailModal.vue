<template>
  <UModal v-model:open="isOpen" :title="$t('inbox.compose.newEmail')">
    <template #body>
      <form class="flex flex-col gap-3" @submit.prevent="send">
        <UFormField :label="$t('inbox.compose.to')" required>
          <UInput
            v-if="lockRecipient"
            :model-value="toEmail || ''"
            type="email"
            readonly
            class="w-full"
          />
          <UInput
            v-else
            v-model="recipient"
            type="email"
            :placeholder="$t('inbox.compose.recipientPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="fromOptions.length > 1" :label="$t('inbox.compose.from')">
          <USelect v-model="fromIdentity" :items="fromOptions" value-key="value" class="w-full" />
        </UFormField>

        <UFormField :label="$t('inbox.compose.subjectLabel')" required>
          <UInput v-model="subject" type="text" class="w-full" />
        </UFormField>

        <UFormField :label="$t('inbox.compose.bodyLabel')" required>
          <InboxEmailEditor
            v-model="bodyHtml"
            :placeholder="$t('inbox.compose.bodyPlaceholder')"
            class="compose-editor"
          />
        </UFormField>

        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" color="neutral" @click="isOpen = false">{{ $t('common.cancel') }}</UButton>
          <UButton type="submit" :loading="sending" :disabled="!canSend">{{ $t('inbox.compose.send') }}</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  subscriberId?: number
  toEmail?: string | null
  toName?: string | null
  lockRecipient?: boolean
  fromOptions: { label: string; value: 'personal' | 'contact' }[]
  myAlias?: string | null
}>(), {
  lockRecipient: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  sent: [conversationId: number]
}>()

const { t } = useI18n()
const toast = useToast()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const recipient = ref('')
const subject = ref('')
const bodyHtml = ref('')
const fromIdentity = ref<'personal' | 'contact'>('personal')
const sending = ref(false)

// Reset the form whenever the modal is (re)opened.
watch(() => props.open, (open) => {
  if (open) {
    recipient.value = props.toEmail || ''
    subject.value = ''
    bodyHtml.value = ''
    fromIdentity.value = 'personal'
  }
})

function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim()
}

// The editor emits HTML; an "empty" editor is text-free (but an image-only body counts).
const bodyHasContent = computed(() => !!htmlToText(bodyHtml.value) || /<img\b/i.test(bodyHtml.value))

const canSend = computed(() => {
  const hasRecipient = props.lockRecipient ? !!props.toEmail : !!recipient.value.trim()
  return hasRecipient && !!subject.value.trim() && bodyHasContent.value
})

async function send() {
  if (!canSend.value || sending.value) return
  sending.value = true
  try {
    const html = bodyHtml.value
    const body: Record<string, any> = {
      subject: subject.value.trim(),
      body_html: html,
      body_text: htmlToText(html),
      // Only send as personal alias when one exists; otherwise fall back to the contact address.
      from_identity: props.myAlias ? fromIdentity.value : 'contact',
    }
    if (props.subscriberId) {
      body.subscriber_id = props.subscriberId
    } else {
      body.to_email = recipient.value.trim()
      if (props.toName) body.to_name = props.toName
    }

    const res = await $fetch<{ conversation: { id: number } }>('/api/admin/inbox/conversations', {
      method: 'POST',
      body,
    })
    toast.add({ title: t('inbox.toasts.emailSent'), color: 'success' })
    isOpen.value = false
    emit('sent', res.conversation.id)
  } catch (err: any) {
    toast.add({ title: t('inbox.toasts.error'), description: err?.data?.statusMessage, color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.compose-editor {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
}
.compose-editor :deep(.ProseMirror) {
  min-height: 200px;
}
</style>

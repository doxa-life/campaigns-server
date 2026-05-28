<template>
  <div class="senders-page">
    <div class="page-header">
      <div>
        <NuxtLink to="/admin/marketing" class="back-link">← Back to Marketing</NuxtLink>
        <h1>Senders</h1>
        <p class="subtitle">From addresses for marketing emails, all on <strong>{{ domain || 'your marketing domain' }}</strong></p>
      </div>
      <UButton v-if="isAdmin" icon="i-lucide-plus" @click="startNew">New Sender</UButton>
    </div>

    <UAlert
      v-if="!domain"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Marketing domain not configured"
      description="Set MARKETING_MAILGUN_DOMAIN (and MARKETING_MAILGUN_API_KEY) so these senders can deliver. Until then, marketing emails fall back to the default transactional From."
      class="mb-4"
    />

    <div class="senders-list">
      <div v-for="s in senders" :key="s.id" class="sender-row">
        <div class="sender-info">
          <div class="sender-name">
            {{ s.name }}
            <UBadge v-if="s.is_default" label="Default" color="primary" variant="subtle" size="sm" />
          </div>
          <div class="sender-address">{{ s.local_part }}@{{ domain || '…' }}</div>
          <div class="sender-reply">Reply-To: {{ s.reply_to || defaultReplyTo }}</div>
        </div>
        <div v-if="isAdmin" class="sender-actions">
          <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="edit(s)" />
          <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirmRemove(s)" />
        </div>
      </div>
      <div v-if="senders.length === 0" class="senders-empty">
        No senders yet.<span v-if="isAdmin"> Click “New Sender” to add one.</span>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <UModal v-model:open="showEditor" :title="editing?.id ? 'Edit Sender' : 'New Sender'">
      <template #body>
        <div class="editor-form">
          <UFormField label="Display name" required>
            <UInput v-model="form.name" placeholder="Doxa Prayer Updates" class="w-full" />
          </UFormField>

          <UFormField label="Email local part" required :help="`Sends from ${form.local_part || 'name'}@${domain || 'your-domain'}`">
            <UInput v-model="form.local_part" placeholder="updates" class="w-full">
              <template #trailing>
                <span class="text-muted text-sm">@{{ domain || '…' }}</span>
              </template>
            </UInput>
          </UFormField>

          <UFormField label="Reply-To" :help="`Leave blank to use ${defaultReplyTo}`">
            <UInput v-model="form.reply_to" :placeholder="defaultReplyTo" class="w-full" />
          </UFormField>

          <USwitch v-model="form.is_default" label="Set as default sender" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="outline" @click="showEditor = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!canSave" @click="save">Save</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmModal
      v-model:open="showDelete"
      title="Remove Sender?"
      message="This sender will no longer be available for new emails. Existing emails keep their record."
      confirm-text="Remove"
      confirm-color="error"
      @confirm="remove"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const { isAdmin } = useAuthUser()
const toast = useToast()
const config = useRuntimeConfig()
const defaultReplyTo = config.public.inboxContactAddress || 'contact@doxa.life'

interface Sender {
  id: number
  name: string
  local_part: string
  reply_to: string | null
  is_default: boolean
  active: boolean
}

const senders = ref<Sender[]>([])
const domain = ref('')
const showEditor = ref(false)
const saving = ref(false)
const editing = ref<Sender | null>(null)
const form = ref({ name: '', local_part: '', reply_to: '', is_default: false })

const showDelete = ref(false)
const pendingDelete = ref<Sender | null>(null)

const canSave = computed(() => form.value.name.trim() && form.value.local_part.trim())

async function load() {
  try {
    const res = await $fetch<{ senders: Sender[]; domain: string }>('/api/admin/marketing/senders')
    senders.value = res.senders || []
    domain.value = res.domain || ''
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to load senders', color: 'error' })
  }
}

function startNew() {
  editing.value = null
  form.value = { name: '', local_part: '', reply_to: '', is_default: senders.value.length === 0 }
  showEditor.value = true
}

function edit(s: Sender) {
  editing.value = s
  form.value = { name: s.name, local_part: s.local_part, reply_to: s.reply_to || '', is_default: s.is_default }
  showEditor.value = true
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const body = {
      name: form.value.name.trim(),
      local_part: form.value.local_part.trim(),
      reply_to: form.value.reply_to.trim() || null,
      is_default: form.value.is_default
    }
    if (editing.value?.id) {
      await $fetch(`/api/admin/marketing/senders/${editing.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/marketing/senders', { method: 'POST', body })
    }
    toast.add({ title: 'Saved', color: 'success' })
    showEditor.value = false
    await load()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to save sender', color: 'error' })
  } finally {
    saving.value = false
  }
}

function confirmRemove(s: Sender) {
  pendingDelete.value = s
  showDelete.value = true
}

async function remove() {
  if (!pendingDelete.value) return
  try {
    await $fetch(`/api/admin/marketing/senders/${pendingDelete.value.id}`, { method: 'DELETE' })
    await load()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to remove sender', color: 'error' })
  } finally {
    pendingDelete.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.senders-page {
  max-width: 800px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 2rem;
}

.back-link {
  color: var(--ui-text-muted);
  text-decoration: none;
  font-size: 0.875rem;
}

.back-link:hover {
  color: var(--ui-text);
}

.page-header h1 {
  margin: 0.5rem 0 0.25rem;
}

.subtitle {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.senders-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sender-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
}

.sender-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.sender-address {
  font-size: 0.875rem;
  color: var(--ui-text);
  margin-top: 0.125rem;
}

.sender-reply {
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  margin-top: 0.125rem;
}

.sender-actions {
  display: flex;
  gap: 0.25rem;
}

.senders-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  border: 1px dashed var(--ui-border);
  border-radius: 8px;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>

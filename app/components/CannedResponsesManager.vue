<template>
  <UModal v-model:open="isOpen" :title="$t('inbox.canned.title')" :ui="{ content: 'max-w-3xl' }">
    <template #body>
      <div class="canned-mgr">
        <div class="cr-list">
          <div class="cr-list-head">
            <span class="cr-list-title">{{ $t('inbox.canned.title') }}</span>
            <UButton size="xs" icon="i-lucide-plus" @click="startNew">{{ $t('inbox.canned.new') }}</UButton>
          </div>
          <button
            v-for="cr in items"
            :key="cr.id"
            type="button"
            class="cr-item"
            :class="{ active: editing && editing.id === cr.id }"
            @click="edit(cr)"
          >
            <span class="cr-item-title">{{ cr.title }}</span>
            <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click.stop="remove(cr)" />
          </button>
          <div v-if="items.length === 0" class="cr-empty">{{ $t('inbox.empty') }}</div>
        </div>

        <div v-if="editing" class="cr-editor">
          <UFormField :label="$t('inbox.canned.name')">
            <UInput v-model="editing.title" class="w-full" />
          </UFormField>
          <UFormField :label="$t('inbox.compose.language')">
            <USelect v-model="editLang" :items="languageItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField :label="$t('inbox.canned.body')">
            <UTextarea v-model="bodyForLang" :rows="8" autoresize class="w-full" />
          </UFormField>
          <div class="cr-editor-actions">
            <UButton color="primary" :loading="saving" :disabled="!editing.title.trim()" @click="save">
              {{ $t('inbox.canned.save') }}
            </UButton>
          </div>
        </div>
        <div v-else class="cr-editor-empty">
          {{ $t('inbox.canned.new') }}
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { LANGUAGES } from '~/utils/languages'

const props = defineProps<{ open?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [] }>()

const { t } = useI18n()
const toast = useToast()

interface CannedTranslation { language_code: string; body_html: string }
interface CannedResponse { id: number; title: string; translations: CannedTranslation[] }
interface EditingCanned { id: number | null; title: string; translations: Record<string, string> }

const isOpen = computed({ get: () => props.open ?? false, set: v => emit('update:open', v) })

const items = ref<CannedResponse[]>([])
const editing = ref<EditingCanned | null>(null)
const editLang = ref('en')
const saving = ref(false)

const languageItems = LANGUAGES.map(l => ({ label: `${l.flag} ${l.nativeName}`, value: l.code }))

const bodyForLang = computed({
  get: () => editing.value?.translations[editLang.value] ?? '',
  set: (val: string) => { if (editing.value) editing.value.translations[editLang.value] = val },
})

async function load() {
  try {
    const res = await $fetch<{ cannedResponses: CannedResponse[] }>('/api/admin/inbox/canned-responses')
    items.value = res.cannedResponses || []
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

function startNew() {
  editing.value = { id: null, title: '', translations: {} }
  editLang.value = 'en'
}

function edit(cr: CannedResponse) {
  const translations: Record<string, string> = {}
  for (const tr of cr.translations || []) translations[tr.language_code] = tr.body_html || ''
  editing.value = { id: cr.id, title: cr.title, translations }
  editLang.value = 'en'
}

async function save() {
  if (!editing.value || !editing.value.title.trim()) return
  saving.value = true
  const translations = Object.entries(editing.value.translations)
    .filter(([, body]) => body && body.trim())
    .map(([language_code, body_html]) => ({ language_code, body_html }))
  try {
    if (editing.value.id) {
      await $fetch(`/api/admin/inbox/canned-responses/${editing.value.id}`, {
        method: 'PUT',
        body: { title: editing.value.title.trim(), translations },
      })
    } else {
      await $fetch('/api/admin/inbox/canned-responses', {
        method: 'POST',
        body: { title: editing.value.title.trim(), translations },
      })
    }
    toast.add({ title: t('inbox.toasts.statusChanged'), color: 'success' })
    await load()
    emit('saved')
    editing.value = null
  } catch (err: any) {
    toast.add({ title: t('inbox.toasts.error'), description: err?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove(cr: CannedResponse) {
  try {
    await $fetch(`/api/admin/inbox/canned-responses/${cr.id}`, { method: 'DELETE' })
    if (editing.value?.id === cr.id) editing.value = null
    await load()
    emit('saved')
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  }
}

watch(isOpen, (v) => { if (v) { load(); editing.value = null } })
</script>

<style scoped>
.canned-mgr { display: grid; grid-template-columns: 1fr 1.4fr; gap: 1rem; min-height: 320px; }
.cr-list { border-right: 1px solid var(--ui-border); padding-right: 1rem; }
.cr-list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.cr-list-title { font-size: 0.8rem; font-weight: 600; color: var(--ui-text-muted); text-transform: uppercase; }
.cr-item { display: flex; justify-content: space-between; align-items: center; width: 100%; text-align: left; padding: 0.5rem; border-radius: 6px; cursor: pointer; gap: 0.5rem; }
.cr-item:hover { background: var(--ui-bg-elevated); }
.cr-item.active { background: var(--ui-bg-elevated); font-weight: 600; }
.cr-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-empty { padding: 1rem 0; color: var(--ui-text-muted); font-size: 0.85rem; }
.cr-editor { display: flex; flex-direction: column; gap: 0.75rem; }
.cr-editor-actions { display: flex; justify-content: flex-end; }
.cr-editor-empty { display: flex; align-items: center; justify-content: center; color: var(--ui-text-muted); font-size: 0.85rem; }
@media (max-width: 640px) { .canned-mgr { grid-template-columns: 1fr; } .cr-list { border-right: none; border-bottom: 1px solid var(--ui-border); padding-right: 0; padding-bottom: 1rem; } }
</style>

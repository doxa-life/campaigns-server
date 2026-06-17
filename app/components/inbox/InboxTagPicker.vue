<template>
  <div class="tag-picker">
    <!-- Applied tags -->
    <UBadge
      v-for="slug in modelValue"
      :key="slug"
      :color="tagColor(slug)"
      variant="subtle"
      size="xs"
      class="tag-chip"
    >
      {{ tagName(slug) }}
      <UIcon
        name="i-lucide-x"
        class="tag-chip-x"
        @click.stop="toggle(slug)"
      />
    </UBadge>

    <!-- Add / manage -->
    <UPopover v-model:open="open">
      <UButton
        icon="i-lucide-tag"
        variant="ghost"
        color="neutral"
        size="xs"
        class="tag-add-btn"
      >
        {{ modelValue.length ? $t('inbox.tags.edit') : $t('inbox.tags.add') }}
      </UButton>

      <template #content>
        <div class="tag-pop">
          <div v-if="palette.length === 0" class="tag-pop-empty">{{ $t('inbox.tags.none') }}</div>

          <ul v-else class="tag-pop-list">
            <li v-for="tag in palette" :key="tag.slug" class="tag-pop-row">
              <button type="button" class="tag-pop-toggle" @click="toggle(tag.slug)">
                <UIcon
                  :name="isSelected(tag.slug) ? 'i-lucide-check-square' : 'i-lucide-square'"
                  class="tag-pop-check"
                />
                <UBadge :color="badgeColor(tag.color)" variant="subtle" size="xs">{{ tag.name }}</UBadge>
              </button>

              <template v-if="confirmingDelete === tag.slug">
                <span class="tag-pop-confirm">
                  <UButton variant="ghost" color="neutral" size="xs" @click="confirmingDelete = null">
                    {{ $t('common.cancel') }}
                  </UButton>
                  <UButton variant="soft" color="error" size="xs" :loading="busy" @click="remove(tag.slug)">
                    {{ $t('inbox.tags.delete') }}
                  </UButton>
                </span>
              </template>
              <UButton
                v-else
                icon="i-lucide-trash-2"
                variant="ghost"
                color="neutral"
                size="xs"
                :aria-label="$t('inbox.tags.delete')"
                @click="confirmingDelete = tag.slug"
              />
            </li>
          </ul>

          <div class="tag-pop-divider" />

          <!-- Inline create -->
          <div class="tag-pop-create">
            <UInput
              v-model="newName"
              :placeholder="$t('inbox.tags.newPlaceholder')"
              size="xs"
              class="tag-pop-input"
              @keydown.enter.prevent="create"
            />
            <div class="tag-pop-swatches">
              <button
                v-for="c in COLORS"
                :key="c"
                type="button"
                class="tag-swatch"
                :class="[swatchClass[c], { 'tag-swatch-active': newColor === c }]"
                :aria-label="c"
                @click="newColor = c"
              />
            </div>
            <UButton
              icon="i-lucide-plus"
              size="xs"
              color="primary"
              :loading="busy"
              :disabled="!newName.trim()"
              block
              @click="create"
            >{{ $t('inbox.tags.create') }}</UButton>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface InboxTag { slug: string; name: string; color: string }

const props = defineProps<{
  conversationId: number
  modelValue: string[]
  palette: InboxTag[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'palette-changed'): void
}>()

const { t } = useI18n()
const toast = useToast()

// Colour tokens map 1:1 to Nuxt UI theme colours (see server/database/inbox-tags.ts).
const COLORS = ['neutral', 'primary', 'secondary', 'info', 'success', 'warning', 'error'] as const
// Static class strings so Tailwind keeps them — dynamic `bg-${c}` would be purged.
const swatchClass: Record<string, string> = {
  neutral: 'bg-neutral-500',
  primary: 'bg-primary-500',
  secondary: 'bg-secondary-500',
  info: 'bg-info-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
}

const open = ref(false)
const busy = ref(false)
const newName = ref('')
const newColor = ref<string>('neutral')
const confirmingDelete = ref<string | null>(null)

function tagName(slug: string): string {
  return props.palette.find(t => t.slug === slug)?.name || slug
}
function tagColor(slug: string): any {
  return props.palette.find(t => t.slug === slug)?.color || 'neutral'
}
// UBadge's `color` is a strict union; tags carry it as a plain string.
function badgeColor(color: string): any {
  return color
}
function isSelected(slug: string): boolean {
  return props.modelValue.includes(slug)
}

async function setTags(slugs: string[]) {
  busy.value = true
  try {
    const res = await $fetch<{ conversation: { tags: string[] } }>(
      `/api/admin/inbox/conversations/${props.conversationId}/tags`,
      { method: 'PUT', body: { tags: slugs } },
    )
    emit('update:modelValue', res.conversation.tags || [])
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    busy.value = false
  }
}

function toggle(slug: string) {
  const next = isSelected(slug)
    ? props.modelValue.filter(s => s !== slug)
    : [...props.modelValue, slug]
  setTags(next)
}

async function create() {
  const name = newName.value.trim()
  if (!name) return
  busy.value = true
  try {
    const res = await $fetch<{ tag: InboxTag }>('/api/admin/inbox/tags', {
      method: 'POST',
      body: { name, color: newColor.value },
    })
    newName.value = ''
    newColor.value = 'neutral'
    emit('palette-changed')
    // Auto-apply the freshly created tag to this conversation.
    if (!isSelected(res.tag.slug)) {
      await setTags([...props.modelValue, res.tag.slug])
    }
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function remove(slug: string) {
  busy.value = true
  try {
    await $fetch(`/api/admin/inbox/tags/${slug}`, { method: 'DELETE' })
    confirmingDelete.value = null
    emit('palette-changed')
    if (isSelected(slug)) {
      emit('update:modelValue', props.modelValue.filter(s => s !== slug))
    }
  } catch {
    toast.add({ title: t('inbox.toasts.error'), color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.tag-picker { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
.tag-add-btn { font-size: 0.65rem; padding: 0.1rem 0.3rem; gap: 0.2rem; }
.tag-add-btn :deep(svg) { width: 0.8rem; height: 0.8rem; }
.tag-chip { display: inline-flex; align-items: center; gap: 0.2rem; }
.tag-chip-x { cursor: pointer; opacity: 0.7; }
.tag-chip-x:hover { opacity: 1; }

.tag-pop { padding: 0.5rem; width: 16rem; display: flex; flex-direction: column; gap: 0.25rem; }
.tag-pop-empty { font-size: 0.8rem; color: var(--ui-text-muted); padding: 0.25rem; }
.tag-pop-list { display: flex; flex-direction: column; gap: 0.1rem; max-height: 14rem; overflow-y: auto; }
.tag-pop-row { display: flex; align-items: center; justify-content: space-between; gap: 0.25rem; }
.tag-pop-toggle { display: flex; align-items: center; gap: 0.4rem; flex: 1; min-width: 0; background: none; border: none; cursor: pointer; padding: 0.2rem 0.25rem; border-radius: 0.25rem; text-align: left; }
.tag-pop-toggle:hover { background: var(--ui-bg-elevated); }
.tag-pop-check { flex-shrink: 0; color: var(--ui-text-muted); }
.tag-pop-confirm { display: flex; align-items: center; gap: 0.15rem; flex-shrink: 0; }
.tag-pop-divider { height: 1px; background: var(--ui-border); margin: 0.35rem 0; }
.tag-pop-create { display: flex; flex-direction: column; gap: 0.4rem; }
.tag-pop-input { width: 100%; }
.tag-pop-swatches { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.tag-swatch { width: 1.1rem; height: 1.1rem; border-radius: 9999px; border: 2px solid transparent; cursor: pointer; }
.tag-swatch-active { border-color: var(--ui-text); }
</style>

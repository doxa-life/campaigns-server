<template>
  <div class="tags-widget">
    <div class="tags-row">
      <UBadge
        v-for="tag in tags"
        :key="tag"
        :color="tagColor(tag)"
        variant="subtle"
        class="tag-chip"
      >
        {{ tag }}
        <UButton
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="`Remove ${tag}`"
          @click="removeTag(tag)"
        />
      </UBadge>
      <span v-if="tags.length === 0" class="empty-hint">No tags</span>
    </div>

    <div class="add-row">
      <UInputMenu
        v-model:search-term="searchTerm"
        v-model:open="menuOpen"
        :model-value="null"
        :items="suggestionItems"
        placeholder="Add a tag..."
        :create-item="true"
        size="xs"
        class="add-input"
        @update:model-value="onSelect"
        @create="onCreate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [tags: string[]]
}>()

const tags = computed(() => props.modelValue || [])
const searchTerm = ref('')
const menuOpen = ref(false)

const distinctTags = useState<string[]>('admin-pg-tags-distinct', () => [])
const distinctLoaded = useState<boolean>('admin-pg-tags-distinct-loaded', () => false)

if (!distinctLoaded.value) {
  distinctLoaded.value = true
  $fetch<{ tags: string[] }>('/api/admin/people-groups/tags-distinct')
    .then(d => { distinctTags.value = d.tags || [] })
    .catch(() => { distinctLoaded.value = false })
}

const suggestionItems = computed(() => distinctTags.value.filter(t => !tags.value.includes(t)))

function tagColor(tag: string): 'warning' | 'primary' | 'neutral' {
  if (tag.startsWith('needs:')) return 'warning'
  return 'neutral'
}

function addTag(raw: unknown) {
  if (raw == null) return
  const trimmed = String(raw).trim()
  if (!trimmed) return
  if (!tags.value.includes(trimmed)) {
    emit('update:modelValue', [...tags.value, trimmed])
  }
  searchTerm.value = ''
  menuOpen.value = false
}

function onSelect(value: any) {
  addTag(value)
}

function onCreate(value: any) {
  addTag(value)
}

function removeTag(tag: string) {
  emit('update:modelValue', tags.value.filter(t => t !== tag))
}
</script>

<style scoped>
.tags-widget {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.add-row {
  display: flex;
  align-items: center;
}

.add-input {
  min-width: 12rem;
}
</style>

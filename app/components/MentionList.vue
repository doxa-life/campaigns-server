<script setup lang="ts">
import { ref, watch } from 'vue'

interface MentionItem {
  id: string
  label: string
}

const props = defineProps<{
  items: MentionItem[]
  command: (item: MentionItem) => void
}>()

const selectedIndex = ref(0)

watch(() => props.items, () => {
  selectedIndex.value = 0
})

function onKeyDown(event: KeyboardEvent): boolean {
  if (event.key === 'ArrowUp') {
    selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
    return true
  }
  if (event.key === 'ArrowDown') {
    selectedIndex.value = (selectedIndex.value + 1) % props.items.length
    return true
  }
  if (event.key === 'Enter') {
    selectItem(selectedIndex.value)
    return true
  }
  return false
}

function selectItem(index: number) {
  const item = props.items[index]
  if (item) {
    props.command(item)
  }
}

defineExpose({ onKeyDown })
</script>

<template>
  <div v-if="items.length > 0" class="mention-list">
    <button
      v-for="(item, index) in items"
      :key="item.id"
      class="mention-item"
      :class="{ 'is-selected': index === selectedIndex }"
      @click="selectItem(index)"
    >
      {{ item.label }}
    </button>
  </div>
  <div v-else class="mention-list">
    <div class="mention-empty">No users found</div>
  </div>
</template>

<style scoped>
.mention-list {
  background: var(--ui-bg, white);
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  padding: 0.25rem;
  max-height: 200px;
  overflow-y: auto;
}

.mention-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.375rem 0.75rem;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ui-text, #1f2937);
}

.mention-item:hover,
.mention-item.is-selected {
  background: var(--ui-bg-elevated, #f3f4f6);
}

.mention-empty {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  color: var(--ui-text-muted, #6b7280);
}
</style>

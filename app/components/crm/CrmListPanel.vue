<template>
  <div class="list-header">
    <UInput
      :model-value="modelValue"
      type="text"
      :placeholder="searchPlaceholder"
      class="search-input"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <slot name="filters" />
    <div v-if="totalCount !== undefined" class="list-count">
      {{ totalCount }}{{ hasMore ? '+' : '' }} {{ totalCount === 1 && !hasMore ? 'item' : 'items' }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue?: string
  searchPlaceholder?: string
  totalCount?: number
  hasMore?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style scoped>
.list-header {
  padding: 1rem;
  border-bottom: 1px solid var(--ui-border);
  background-color: var(--ui-bg-elevated);
}

.search-input {
  width: 100%;
  margin-bottom: 0.5rem;
}

.list-count {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  margin-top: 0.5rem;
}
</style>

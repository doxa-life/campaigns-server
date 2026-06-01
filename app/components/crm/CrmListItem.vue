<template>
  <div
    class="crm-list-item"
    :class="{ active }"
    @click="$emit('click')"
  >
    <div v-if="$slots.image" class="item-image">
      <slot name="image" />
    </div>
    <div class="item-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  active?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<style scoped>
.crm-list-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ui-border);
  cursor: pointer;
  transition: background-color 0.2s;
}

.crm-list-item:hover {
  background-color: var(--ui-bg-elevated);
}

.crm-list-item.active {
  background-color: var(--ui-bg-elevated);
  border-left: 3px solid var(--text);
}

.item-image {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.item-image :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-content {
  flex: 1;
  min-width: 0;
}
</style>

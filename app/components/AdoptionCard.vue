<template>
  <div class="adoption-row" @click="$emit('open')">
    <div class="adoption-info">
      <span class="adoption-name">{{ label }}</span>
      <UBadge
        :label="adoption.status"
        :color="adoption.status === 'active' ? 'success' : adoption.status === 'pending' ? 'warning' : 'neutral'"
        variant="outline"
        size="xs"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  adoption: { id: number; status: string }
  label: string
}>()

defineEmits<{
  open: []
}>()
</script>

<style scoped>
.adoption-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background-color: var(--ui-bg);
  cursor: pointer;
}

.adoption-row:hover .adoption-name {
  text-decoration: underline;
}

.adoption-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.adoption-name {
  font-weight: 500;
  text-underline-offset: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

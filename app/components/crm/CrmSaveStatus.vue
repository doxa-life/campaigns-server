<template>
  <span v-if="saving" class="save-status">
    <UIcon name="i-lucide-loader-2" class="animate-spin" />
    <span>Saving</span>
  </span>
  <span v-else-if="saved" class="save-status saved">
    <UIcon name="i-lucide-check" />
    <span>Saved</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  saving: boolean
  saved: boolean
}>()
</script>

<style scoped>
.save-status {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  padding: 0.25rem 0.5rem;
}

.save-status.saved {
  color: var(--ui-color-success);
}
</style>

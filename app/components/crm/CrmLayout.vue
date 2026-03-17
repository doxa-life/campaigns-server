<template>
  <div class="crm-page">
    <div class="page-header">
      <slot name="header" />
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-else class="crm-layout">
      <div class="list-panel">
        <slot name="list-header" />
        <div class="list-items">
          <div v-if="loading" class="list-loading">Loading...</div>
          <slot v-else name="list">
            <div class="empty-list">
              <slot name="list-empty">No items found</slot>
            </div>
          </slot>
        </div>
      </div>
    </div>

    <USlideover
      v-model:open="slideoverOpen"
      side="right"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <slot name="detail" />
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  error?: string
  open?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const slideoverOpen = computed({
  get: () => props.open ?? false,
  set: (val) => emit('update:open', val)
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.error {
  text-align: center;
  padding: 2rem;
  color: var(--ui-text-muted);
}

.list-loading {
  padding: 2rem;
  text-align: center;
  color: var(--ui-text-muted);
}

.crm-layout {
  min-height: 600px;
}

.list-panel {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 150px);
}

.list-items {
  overflow-y: auto;
  flex: 1;
}

.empty-list {
  padding: 2rem;
  text-align: center;
  color: var(--ui-text-muted);
}
</style>

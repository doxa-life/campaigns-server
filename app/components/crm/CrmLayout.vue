<template>
  <div class="crm-page">
    <div class="page-header">
      <slot name="header" />
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-else class="crm-layout" :class="{ 'has-rail': !!$slots['list-rail'] }">
      <aside v-if="$slots['list-rail']" class="rail-panel">
        <slot name="list-rail" />
      </aside>
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
      :ui="{ content: 'sm:max-w-6xl' }"
    >
      <template #header>
        <DialogTitle as="div" class="slideover-header">
          <div class="slideover-header-info">
            <slot name="detail-header" />
          </div>
          <div class="slideover-header-actions">
            <slot name="detail-actions" />
          </div>
          <div class="slideover-close">
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="slideoverOpen = false"
            />
          </div>
        </DialogTitle>
        <DialogDescription class="sr-only">Record details</DialogDescription>
      </template>
      <template #body>
        <slot name="detail" />
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import { DialogTitle, DialogDescription } from 'reka-ui'

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

.crm-layout.has-rail {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.crm-layout.has-rail .list-panel {
  flex: 1;
  min-width: 0;
}

.rail-panel {
  width: 210px;
  flex-shrink: 0;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow-y: auto;
  max-height: calc(100vh - 150px);
}

@media (max-width: 768px) {
  .crm-layout.has-rail {
    flex-direction: column;
    align-items: stretch;
  }

  .rail-panel {
    width: 100%;
    max-height: none;
  }
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

.slideover-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.slideover-header-info {
  flex: 1;
  min-width: 0;
}

.slideover-header-info :deep(h2) {
  margin: 0;
  font-size: 1.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slideover-header-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.slideover-close {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .slideover-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    position: relative;
  }

  .slideover-header-actions {
    flex-wrap: wrap;
  }

  /* Keep the close button pinned top-right while everything else stacks. */
  .slideover-close {
    position: absolute;
    top: 0;
    right: 0;
  }

  .slideover-header-info {
    padding-right: 2.5rem;
  }
}
</style>

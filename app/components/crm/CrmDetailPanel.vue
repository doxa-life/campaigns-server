<template>
  <div class="crm-detail-panel">
    <div v-if="$slots['secondary-actions']" class="secondary-actions">
      <slot name="secondary-actions" />
    </div>

    <UTabs v-if="tabs.length > 0" :items="tabs" class="detail-tabs">
      <template v-for="tab in tabs" :key="tab.slot" #[tab.slot]>
        <div class="tab-content">
          <slot :name="'tab-' + tab.slot" />
        </div>
      </template>
    </UTabs>

    <div v-else class="details-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Tab {
  label: string
  slot: string
  icon?: string
}

withDefaults(defineProps<{
  tabs?: Tab[]
}>(), {
  tabs: () => []
})
</script>

<style scoped>
.crm-detail-panel {
  height: 100%;
}

.secondary-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
}

.details-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.details-body :deep(form) {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>

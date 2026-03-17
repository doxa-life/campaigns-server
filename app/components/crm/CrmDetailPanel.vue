<template>
  <div class="crm-detail-panel">
    <div v-if="$slots.top" class="top-bar">
      <slot name="top" />
    </div>

    <!-- Desktop: two columns -->
    <div class="desktop-layout">
      <div class="detail-column">
        <slot name="details" />
      </div>
      <div v-if="sideTabs.length > 0" class="side-column">
        <UTabs :items="sideTabs">
          <template v-for="tab in sideTabs" :key="tab.slot" #[tab.slot]>
            <div class="side-tab-content">
              <slot :name="'side-' + tab.slot" />
            </div>
          </template>
        </UTabs>
      </div>
    </div>

    <!-- Mobile: all tabs -->
    <div class="mobile-layout">
      <UTabs :items="mobileTabs">
        <template #details>
          <div class="mobile-tab-content">
            <slot name="details" />
          </div>
        </template>
        <template v-for="tab in sideTabs" :key="tab.slot" #[tab.slot]>
          <div class="mobile-tab-content">
            <slot :name="'side-' + tab.slot" />
          </div>
        </template>
      </UTabs>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Tab {
  label: string
  slot: string
  icon?: string
}

const props = withDefaults(defineProps<{
  sideTabs?: Tab[]
}>(), {
  sideTabs: () => []
})

const mobileTabs = computed(() => [
  { label: 'Details', slot: 'details', icon: 'i-lucide-file-text' },
  ...props.sideTabs
])
</script>

<style scoped>
.crm-detail-panel {
  height: 100%;
}

.top-bar {
  display: flex;
  gap: 0.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 1rem;
}

.desktop-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  height: 100%;
}

.mobile-layout {
  display: none;
}

.detail-column {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  min-width: 0;
}

.detail-column :deep(form) {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.side-column {
  overflow-y: auto;
  min-height: 0;
  border-left: 1px solid var(--ui-border);
  padding-left: 1.5rem;
}

.side-tab-content {
  padding-top: 1rem;
}

.mobile-tab-content {
  padding-top: 1rem;
}

@media (max-width: 768px) {
  .desktop-layout {
    display: none;
  }

  .mobile-layout {
    display: block;
  }
}
</style>

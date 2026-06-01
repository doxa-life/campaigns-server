<template>
  <div class="crm-detail-panel">
    <div v-if="$slots.top" class="top-bar">
      <slot name="top" />
    </div>

    <!-- Desktop: two columns -->
    <div class="desktop-layout">
      <div class="detail-column">
        <template v-if="detailTabs.length > 0">
          <UTabs :items="detailTabs">
            <template v-for="tab in detailTabs" :key="tab.slot" #[tab.slot]>
              <div class="detail-tab-content">
                <slot :name="'detail-' + tab.slot" />
              </div>
            </template>
          </UTabs>
        </template>
        <template v-else>
          <slot name="details" />
        </template>
      </div>
      <div v-if="sideTabs.length > 0" class="side-column">
        <UTabs :items="sideTabs">
          <template #trailing="{ item }">
            <UBadge v-if="item.badge != null" :label="item.badge" variant="subtle" size="xs" />
          </template>
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
      <UTabs :items="mobileTabs" size="xs">
        <template #trailing="{ item }">
          <UBadge v-if="item.badge != null" :label="item.badge" variant="subtle" size="xs" />
        </template>
        <template v-for="tab in detailTabs" :key="'mobile-detail-' + tab.slot" #[tab.slot]>
          <div class="mobile-tab-content">
            <slot :name="'detail-' + tab.slot" />
          </div>
        </template>
        <template v-if="detailTabs.length === 0" #details>
          <div class="mobile-tab-content">
            <slot name="details" />
          </div>
        </template>
        <template v-for="tab in sideTabs" :key="'mobile-side-' + tab.slot" #[tab.slot]>
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
  badge?: string | number
}

const props = withDefaults(defineProps<{
  detailTabs?: Tab[]
  sideTabs?: Tab[]
}>(), {
  detailTabs: () => [],
  sideTabs: () => []
})

const mobileTabs = computed(() => {
  const leftTabs = props.detailTabs.length > 0
    ? props.detailTabs
    : [{ label: 'Details', slot: 'details', icon: 'i-lucide-file-text' }]
  return [...leftTabs, ...props.sideTabs].map(({ icon, ...tab }) => tab)
})
</script>

<style scoped>
.crm-detail-panel {
  height: 100%;
}

.top-bar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 1rem;
}

.desktop-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.5rem;
}

.mobile-layout {
  display: none;
}

.detail-column {
  min-width: 0;
}

.detail-column :deep(form) {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-tab-content {
  padding-top: 1rem;
  padding-bottom: 3rem;
}

.side-column {
  border-left: 1px solid var(--ui-border);
  padding-left: 1.5rem;
}

.side-tab-content {
  padding-top: 1rem;
  padding-bottom: 3rem;
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

  .top-bar :deep(button),
  .top-bar :deep(a) {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
  }
}
</style>

<template>
  <CrmFormSection title="Activity Log">
    <div v-if="loading" class="activity-loading">
      Loading...
    </div>
    <div v-else-if="activities.length === 0" class="activity-empty">
      No activity recorded yet
    </div>
    <div v-else class="activity-list">
      <ActivityItem v-for="activity in activities" :key="activity.id" :activity="activity" />
    </div>
  </CrmFormSection>
</template>

<script setup lang="ts">
import ActivityItem, { type Activity } from './crm/ActivityItem.vue'

const props = defineProps<{
  tableName: string
  recordId: number | string
}>()

const activities = ref<Activity[]>([])
const loading = ref(false)

async function fetchActivity() {
  loading.value = true
  try {
    const data = await $fetch<{ activities: Activity[] }>(
      `/api/admin/activity/${props.tableName}/${props.recordId}`
    )
    activities.value = data.activities
  } catch {
    activities.value = []
  } finally {
    loading.value = false
  }
}

function refresh() {
  fetchActivity()
}

defineExpose({ refresh })

watch(() => [props.tableName, props.recordId], () => {
  fetchActivity()
}, { immediate: true })
</script>

<style scoped>
.activity-loading,
.activity-empty {
  padding: 1rem;
  text-align: center;
  color: var(--color-neutral-500);
  font-size: 0.875rem;
}

.activity-list {
  display: flex;
  flex-direction: column;
}
</style>

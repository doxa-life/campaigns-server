<template>
  <CrmFormSection title="Activity Log">
    <div v-if="loading" class="activity-loading">
      Loading...
    </div>
    <div v-else-if="activities.length === 0" class="activity-empty">
      No activity recorded yet
    </div>
    <div v-else class="activity-list">
      <div v-for="activity in activities" :key="activity.id" class="activity-item">
        <div class="activity-header">
          <UBadge
            :label="formatEventType(activity.eventType)"
            :color="getEventColor(activity.eventType)"
            :icon="getEventIcon(activity.eventType)"
            size="xs"
          />
          <span class="activity-time">{{ formatTimestamp(activity.timestamp) }}</span>
        </div>
        <div class="activity-user">
          <template v-if="activity.userName">
            by {{ activity.userName }}
          </template>
        </div>
        <div v-if="activity.metadata?.contact_added" class="activity-detail">
          Contact added: {{ activity.metadata.contact_added }}
        </div>
        <div v-if="activity.metadata?.contact_removed" class="activity-detail">
          Contact removed: #{{ activity.metadata.contact_removed }}
        </div>
        <div v-if="activity.metadata?.added_to_group" class="activity-detail">
          Added to group: {{ activity.metadata.added_to_group }}
        </div>
        <div v-if="activity.metadata?.removed_from_group" class="activity-detail">
          Removed from group: {{ activity.metadata.removed_from_group }}
        </div>
        <div v-if="activity.metadata?.adoption_added" class="activity-detail">
          Adoption added: {{ activity.metadata.adoption_added }}
        </div>
        <div v-if="activity.metadata?.adoption_removed" class="activity-detail">
          Adoption removed: #{{ activity.metadata.adoption_removed }}
        </div>
        <div v-if="activity.metadata?.changes" class="activity-changes">
          <div
            v-for="(change, field) in activity.metadata.changes"
            :key="field"
            class="change-item"
          >
            <span class="change-field">{{ formatFieldName(field as string) }}</span>
            <span class="change-to">changed to: {{ formatValue(field as string, change.to) }}</span>
          </div>
        </div>
      </div>
    </div>
  </CrmFormSection>
</template>

<script setup lang="ts">
import { allFields } from '~/utils/people-group-fields'
import { LANGUAGES } from '~~/config/languages'

interface Activity {
  id: string | number
  timestamp: number
  eventType: string
  tableName: string
  userId: string | null
  userName: string | null
  metadata: any
}

const props = defineProps<{
  tableName: string
  recordId: number
}>()

const { t } = useI18n()

const activities = ref<Activity[]>([])
const loading = ref(false)

// Build lookup maps from people-group field definitions
const fieldByKey = computed(() => {
  const map = new Map<string, typeof allFields[number]>()
  for (const f of allFields) map.set(f.key, f)
  return map
})

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

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatEventType(eventType: string): string {
  const types: Record<string, string> = {
    'CREATE': 'Created',
    'UPDATE': 'Updated',
    'DELETE': 'Deleted'
  }
  return types[eventType] || eventType
}

function getEventColor(eventType: string): 'success' | 'warning' | 'error' | 'neutral' {
  const colors: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
    'CREATE': 'success',
    'UPDATE': 'warning',
    'DELETE': 'error'
  }
  return colors[eventType] || 'neutral'
}

function getEventIcon(eventType: string): string | undefined {
  const icons: Record<string, string> = {
    'CREATE': 'i-lucide-plus',
    'UPDATE': 'i-lucide-pencil',
    'DELETE': 'i-lucide-trash'
  }
  return icons[eventType]
}

const NON_FIELD_LABELS: Record<string, string> = {
  'primary_subscriber_id': 'Primary Contact',
  'country': 'Country',
  'description': 'Description',
  'repeating': 'Repeating',
  'role': 'Role',
  'status': 'Status',
  'show_publicly': 'Show Publicly'
}

function formatFieldName(field: string): string {
  // Description per language: description_en → "Description (English)"
  const descMatch = field.match(/^description_(.+)$/)
  if (descMatch) {
    const lang = LANGUAGES.find(l => l.code === descMatch[1])
    return `Description (${lang?.name || descMatch[1]})`
  }

  // People-group field definitions (covers both table columns and metadata keys)
  const def = fieldByKey.value.get(field)
  if (def) return t(def.labelKey)

  return NON_FIELD_LABELS[field] || field.replace(/_/g, ' ')
}

function formatValue(field: string, value: any): string {
  if (value === null || value === undefined || value === '') {
    return '(empty)'
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  // Try to resolve an option label from the field definition
  const def = fieldByKey.value.get(field)
  if (def?.options) {
    const option = def.options.find(o => String(o.value) === String(value))
    if (option) {
      if (option.labelKey) return t(option.labelKey)
      if (option.label) return option.label
    }
  }

  return String(value)
}
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

.activity-item {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.activity-time {
  font-size: 0.75rem;
  color: var(--color-neutral-500);
}

.activity-user {
  font-size: 0.75rem;
  color: var(--color-neutral-500);
  margin-top: 0.25rem;
}

.activity-detail {
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: var(--color-neutral-600);
}

.activity-changes {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
}

.change-item {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  padding: 0.125rem 0;
  flex-wrap: wrap;
}

.change-field {
  font-weight: 500;
  color: var(--color-neutral-600);
}

.change-to {
  color: var(--color-neutral-500);
  word-break: break-word;
}
</style>

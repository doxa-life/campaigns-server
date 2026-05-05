<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold">Onboarding</h1>
        <p class="text-sm text-muted">People groups with outstanding setup work</p>
      </div>
      <UButton
        size="sm"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="status === 'pending'"
        @click="refresh()"
      >
        Refresh
      </UButton>
    </div>

    <div class="flex flex-wrap gap-2 mb-4">
      <UButton
        v-for="f in filterChips"
        :key="f.key"
        size="xs"
        :variant="activeFilter === f.key ? 'solid' : 'outline'"
        :color="activeFilter === f.key ? 'primary' : 'neutral'"
        @click="activeFilter = activeFilter === f.key ? null : f.key"
      >
        {{ f.label }} ({{ f.count }})
      </UButton>
    </div>

    <UCard v-if="status === 'pending'" class="text-center py-8">
      <UIcon name="i-lucide-loader" class="animate-spin text-2xl" />
    </UCard>

    <UCard v-else-if="filteredRows.length === 0" class="text-center py-8">
      <p class="text-muted">No outstanding work — every people group is fully set up.</p>
    </UCard>

    <div v-else class="rows">
      <NuxtLink
        v-for="row in filteredRows"
        :key="row.id"
        :to="`/admin/people-groups/${row.id}`"
        class="row"
      >
        <div class="row-header">
          <span class="row-name">{{ row.name }}</span>
          <span class="row-country">{{ row.country_code || '—' }}</span>
        </div>
        <div class="row-badges">
          <UBadge v-if="row.prompts_pending" color="warning" variant="subtle">
            <UIcon name="i-lucide-book-open" />
            Day in the Life prompts pending
          </UBadge>
          <UBadge
            v-for="locale in row.translation_pending_locales"
            :key="locale"
            color="info"
            variant="subtle"
          >
            translation: {{ locale }}
          </UBadge>
          <UBadge
            v-for="tag in row.needs_tags"
            :key="tag"
            color="warning"
            variant="subtle"
          >
            {{ tag }}
          </UBadge>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface OnboardingRow {
  id: number
  name: string
  slug: string | null
  country_code: string | null
  status: string | null
  engagement_status: string | null
  created_at: string
  prompts_pending: boolean
  translation_pending_locales: string[]
  needs_tags: string[]
}

const { data, status, refresh } = await useFetch<{ peopleGroups: OnboardingRow[] }>(
  '/api/admin/people-groups/onboarding-status',
  { default: () => ({ peopleGroups: [] }) }
)

const rows = computed(() => data.value?.peopleGroups || [])

const activeFilter = ref<string | null>(null)

const filterChips = computed(() => {
  const all = rows.value
  const promptsCount = all.filter(r => r.prompts_pending).length
  const translationCount = all.filter(r => r.translation_pending_locales.length > 0).length
  const needsCount = all.filter(r => r.needs_tags.length > 0).length
  return [
    { key: 'prompts', label: 'Day in the Life prompts pending', count: promptsCount },
    { key: 'translation', label: 'Translation pending', count: translationCount },
    { key: 'needs', label: 'Needs assets', count: needsCount },
  ]
})

const filteredRows = computed(() => {
  if (!activeFilter.value) return rows.value
  if (activeFilter.value === 'prompts') return rows.value.filter(r => r.prompts_pending)
  if (activeFilter.value === 'translation') return rows.value.filter(r => r.translation_pending_locales.length > 0)
  if (activeFilter.value === 'needs') return rows.value.filter(r => r.needs_tags.length > 0)
  return rows.value
})
</script>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: var(--ui-bg);
  transition: background 0.15s ease;
}

.row:hover {
  background: var(--ui-bg-elevated);
}

.row-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.row-name {
  font-weight: 600;
}

.row-country {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.row-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
</style>

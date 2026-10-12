<template>
  <div class="reactivate-page">
    <div class="page-header">
      <div>
        <NuxtLink to="/admin/marketing" class="back-link">← Back to Marketing</NuxtLink>
        <h1>Reactivate Inactive Subscribers</h1>
        <p class="subtitle">
          Prayer times the system marked inactive, for subscribers who gave Doxa general consent.
          Anyone who unsubscribed is never listed.
        </p>
      </div>
      <UButton
        v-if="canEdit"
        icon="i-lucide-rotate-ccw"
        :disabled="selectedIds.length === 0"
        @click="() => { showConfirm = true }"
      >
        Reactivate {{ selectedIds.length }}
      </UButton>
    </div>

    <UAlert
      v-if="!canEdit"
      color="warning"
      variant="soft"
      icon="i-lucide-lock"
      title="Admins only"
      description="You need permission to edit subscribers to reactivate them."
    />

    <template v-else>
      <div v-if="!loading && rows.length > 0" class="list-toolbar">
        <UCheckbox
          :model-value="allSelected ? true : (selectedIds.length > 0 ? 'indeterminate' : false)"
          :label="`${rows.length} prayer times · ${subscriberCount} subscribers`"
          @update:model-value="toggleAll"
        />
      </div>

      <div class="rows">
        <div v-if="loading" class="rows-empty">Loading…</div>
        <div v-else-if="rows.length === 0" class="rows-empty">
          No inactive subscribers to reactivate.
        </div>
        <div v-for="row in rows" v-else :key="row.id" class="row" @click="toggle(row.id)">
          <UCheckbox
            :model-value="selected.has(row.id)"
            @click.stop
            @update:model-value="toggle(row.id)"
          />
          <div class="row-info">
            <div class="row-name">
              <NuxtLink :to="`/admin/subscribers/${row.subscriber_id}`" @click.stop>
                {{ row.subscriber_name || row.email }}
              </NuxtLink>
            </div>
            <div class="row-detail">{{ row.email }} · {{ row.people_group_name }}</div>
          </div>
          <div class="row-date">Inactive since {{ formatDate(row.inactive_since) }}</div>
        </div>
      </div>
    </template>

    <ConfirmModal
      v-model:open="showConfirm"
      title="Reactivate subscribers?"
      :message="`${selectedIds.length} prayer time(s) will go back to active, and their daily reminder emails will start again.`"
      confirm-text="Reactivate"
      :loading="saving"
      @confirm="reactivate"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface InactiveSubscription {
  id: number
  subscriber_id: number
  subscriber_name: string
  email: string
  people_group_id: number
  people_group_name: string
  inactive_since: string
}

const { canAccessUnscoped } = useAuthUser()
const toast = useToast()

const canEdit = computed(() => canAccessUnscoped('subscribers.edit'))
const rows = ref<InactiveSubscription[]>([])
const subscriberCount = ref(0)
const selected = ref(new Set<number>())
const loading = ref(true)
const saving = ref(false)
const showConfirm = ref(false)

const selectedIds = computed(() => rows.value.filter(r => selected.value.has(r.id)).map(r => r.id))
const allSelected = computed(() => rows.value.length > 0 && selectedIds.value.length === rows.value.length)

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(rows.value.map(r => r.id))
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString()
}

async function load() {
  if (!canEdit.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await $fetch<{ subscriptions: InactiveSubscription[]; subscriber_count: number }>('/api/admin/subscriptions/inactive')
    rows.value = res.subscriptions
    subscriberCount.value = res.subscriber_count
    selected.value = new Set(res.subscriptions.map(r => r.id))
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to load inactive subscribers', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function reactivate() {
  saving.value = true
  try {
    const res = await $fetch<{ reactivated_count: number; subscriber_count: number }>('/api/admin/subscriptions/reactivate', {
      method: 'POST',
      body: { subscription_ids: selectedIds.value }
    })
    toast.add({
      title: 'Reactivated',
      description: `${res.reactivated_count} prayer time(s) for ${res.subscriber_count} subscriber(s) are active again.`,
      color: 'success'
    })
    showConfirm.value = false
    await load()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to reactivate', color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.reactivate-page {
  max-width: 900px;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 2rem;
}

.back-link {
  color: var(--ui-text-muted);
  text-decoration: none;
  font-size: 0.875rem;
}

.back-link:hover {
  color: var(--ui-text);
}

.page-header h1 {
  margin: 0.5rem 0 0.25rem;
}

.subtitle {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.list-toolbar {
  padding: 0 1rem 0.75rem;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  cursor: pointer;
}

.row-info {
  flex: 1;
  min-width: 0;
}

.row-name {
  font-weight: 600;
}

.row-detail,
.row-date {
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}

.rows-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  border: 1px dashed var(--ui-border);
  border-radius: 8px;
}
</style>

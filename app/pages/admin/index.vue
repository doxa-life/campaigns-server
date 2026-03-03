<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div v-if="status === 'pending'" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-[var(--ui-text-dimmed)]" />
    </div>

    <div v-else-if="data" class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-book-open" class="text-blue-500 text-lg" />
            <span class="font-semibold">Prayer</span>
          </div>
        </template>
        <AdminDashboardBar
          :active-value="data.prayer.withPrayer"
          :inactive-value="data.prayer.withoutPrayer"
          active-label="With Prayer"
          inactive-label="Without"
          active-color="#3b82f6"
        />
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-users" class="text-purple-500 text-lg" />
            <span class="font-semibold">Adoption</span>
          </div>
        </template>
        <AdminDashboardBar
          :active-value="data.adoption.adopted"
          :inactive-value="data.adoption.notAdopted"
          active-label="Adopted"
          inactive-label="Not Adopted"
          active-color="#a855f7"
        />
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-heart-handshake" class="text-green-500 text-lg" />
            <span class="font-semibold">Engagement</span>
          </div>
        </template>
        <AdminDashboardBar
          :active-value="data.engagement.engaged"
          :inactive-value="data.engagement.unengaged"
          active-label="Engaged"
          inactive-label="Unengaged"
          active-color="#22c55e"
        />
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const { data, status } = useFetch('/api/admin/dashboard/stats')
</script>

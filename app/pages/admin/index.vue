<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div class="flex gap-2 mb-6">
      <UButton
        v-for="tab in tabs"
        :key="tab.value"
        :label="tab.label"
        :icon="tab.icon"
        size="xs"
        :color="activeTab === tab.value ? 'primary' : 'neutral'"
        :variant="activeTab === tab.value ? 'subtle' : 'soft'"
        @click="activeTab = tab.value"
      />
    </div>

    <template v-if="activeTab === 'general'">
      <div v-if="status === 'pending'" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-[var(--ui-text-dimmed)]" />
      </div>

      <div v-else-if="data" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-book-open" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">People Groups with Prayer</span>
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
                <UIcon name="i-lucide-users" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">People Group Adoption</span>
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
                <UIcon name="i-lucide-heart-handshake" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">People Group Engagement</span>
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

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <UCard>
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-clock" class="text-[var(--ui-primary)] text-2xl" />
              <div>
                <p class="text-sm text-[var(--ui-text-dimmed)]">Total Prayer Time Committed</p>
                <p class="text-2xl font-bold">{{ formatMinutes(data.prayerTime.committed) }}</p>
              </div>
            </div>
          </UCard>
          <UCard>
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-calendar-check" class="text-[var(--ui-primary)] text-2xl" />
              <div>
                <p class="text-sm text-[var(--ui-text-dimmed)]">Daily Prayer Time Committed</p>
                <p class="text-2xl font-bold">{{ formatMinutes(data.prayerTime.dailyCommitted) }}</p>
              </div>
            </div>
          </UCard>
          <UCard>
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-timer" class="text-[var(--ui-primary)] text-2xl" />
              <div>
                <p class="text-sm text-[var(--ui-text-dimmed)]">Total Prayer Time Recorded</p>
                <p class="text-2xl font-bold">{{ formatMinutes(data.prayerTime.recorded) }}</p>
              </div>
            </div>
          </UCard>
          <UCard>
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-activity" class="text-[var(--ui-primary)] text-2xl" />
              <div>
                <p class="text-sm text-[var(--ui-text-dimmed)]">Last 24h Prayer Time Recorded</p>
                <p class="text-2xl font-bold">{{ formatMinutes(data.prayerTime.last24h) }}</p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>

    <template v-if="activeTab === 'prayer'">
      <div v-if="prayerStatus === 'pending'" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-[var(--ui-text-dimmed)]" />
      </div>

      <div v-else-if="prayerDaily" class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-bar-chart-3" class="text-[var(--ui-primary)] text-lg" />
              <span class="font-semibold">Daily Prayer Recorded</span>
              <span class="text-sm text-[var(--ui-text-dimmed)]">(last 30 days)</span>
            </div>
          </template>
          <div class="flex items-end gap-1 h-48">
            <div
              v-for="day in prayerDaily"
              :key="day.date"
              class="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              <div
                class="w-full rounded-t-sm bg-[var(--ui-primary)] opacity-80 group-hover:opacity-100 transition-all min-w-[4px]"
                :style="{ height: barHeight(day.minutes) }"
              />
              <span class="text-[10px] text-[var(--ui-text-dimmed)] mt-1 tabular-nums leading-none">
                {{ day.date.slice(8) }}
              </span>
              <div class="absolute bottom-full mb-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {{ formatChartDate(day.date) }}: {{ day.minutes }}m
              </div>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-users" class="text-[var(--ui-primary)] text-lg" />
              <span class="font-semibold">Unique People Praying</span>
              <span class="text-sm text-[var(--ui-text-dimmed)]">(last 30 days)</span>
            </div>
          </template>
          <div class="flex items-end gap-1 h-48">
            <div
              v-for="day in prayerDaily"
              :key="day.date"
              class="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              <div
                class="w-full rounded-t-sm bg-amber-500 opacity-80 group-hover:opacity-100 transition-all min-w-[4px]"
                :style="{ height: uniquePeopleBarHeight(day.unique_sessions) }"
              />
              <span class="text-[10px] text-[var(--ui-text-dimmed)] mt-1 tabular-nums leading-none">
                {{ day.date.slice(8) }}
              </span>
              <div class="absolute bottom-full mb-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {{ formatChartDate(day.date) }}: {{ day.unique_sessions }} {{ day.unique_sessions === 1 ? 'person' : 'people' }}
              </div>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-calendar-check" class="text-[var(--ui-primary)] text-lg" />
              <span class="font-semibold">Daily Prayer Committed</span>
              <span class="text-sm text-[var(--ui-text-dimmed)]">(last 30 days)</span>
            </div>
          </template>
          <div class="flex items-end gap-1 h-48">
            <div
              v-for="day in prayerDaily"
              :key="day.date"
              class="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              <div
                class="w-full rounded-t-sm bg-emerald-500 opacity-80 group-hover:opacity-100 transition-all min-w-[4px]"
                :style="{ height: committedBarHeight(day.committed) }"
              />
              <span class="text-[10px] text-[var(--ui-text-dimmed)] mt-1 tabular-nums leading-none">
                {{ day.date.slice(8) }}
              </span>
              <div class="absolute bottom-full mb-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {{ formatChartDate(day.date) }}: {{ formatMinutes(day.committed) }}
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

const activeTab = ref('general')

const tabs = [
  { label: 'General', value: 'general', icon: 'i-lucide-layout-dashboard' },
  { label: 'Prayer', value: 'prayer', icon: 'i-lucide-clock' }
]

const { data, status } = useFetch('/api/admin/dashboard/stats')
const { data: prayerDaily, status: prayerStatus } = useFetch('/api/admin/dashboard/prayer-daily')

const maxPrayerMinutes = computed(() => {
  if (!prayerDaily.value) return 1
  return Math.max(1, ...prayerDaily.value.map((d: any) => d.minutes))
})

function barHeight(minutes: number): string {
  if (minutes === 0) return '0%'
  const pct = (minutes / maxPrayerMinutes.value) * 100
  return `${Math.max(pct, 2)}%`
}

const maxUniquePeople = computed(() => {
  if (!prayerDaily.value) return 1
  return Math.max(1, ...prayerDaily.value.map((d: any) => d.unique_sessions))
})

function uniquePeopleBarHeight(count: number): string {
  if (count === 0) return '0%'
  const pct = (count / maxUniquePeople.value) * 100
  return `${Math.max(pct, 2)}%`
}

const maxCommittedMinutes = computed(() => {
  if (!prayerDaily.value) return 1
  return Math.max(1, ...prayerDaily.value.map((d: any) => d.committed))
})

function committedBarHeight(minutes: number): string {
  if (minutes === 0) return '0%'
  const pct = (minutes / maxCommittedMinutes.value) * 100
  return `${Math.max(pct, 2)}%`
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = Math.round(minutes % 60)
  if (remaining === 0) return `${hours.toLocaleString()}h`
  return `${hours.toLocaleString()}h ${remaining}m`
}
</script>

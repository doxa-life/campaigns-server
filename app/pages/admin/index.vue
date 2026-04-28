<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <!-- Navigation Links -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      <NuxtLink
        v-for="link in navLinks"
        :key="link.to"
        :to="link.to"
        class="nav-card"
      >
        <UIcon :name="link.icon" class="text-xl text-[var(--ui-text-muted)]" />
        <span class="text-sm font-medium">{{ link.label }}</span>
      </NuxtLink>
    </div>

    <!-- Stats -->
    <h2 class="text-lg font-semibold mb-3">Stats</h2>
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

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <UCard>
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-hand-heart" class="text-[var(--ui-primary)] text-2xl" />
              <div>
                <p class="text-sm text-[var(--ui-text-dimmed)]">People Signed Up to Pray</p>
                <p class="text-2xl font-bold">{{ data.prayerSignups }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <div class="max-w-md">
          <UCard v-if="data.signupsByLanguage?.length">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-languages" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">Signups by Language</span>
              </div>
            </template>
            <div class="flex flex-col gap-2">
              <div
                v-for="entry in data.signupsByLanguage"
                :key="entry.language"
                class="flex items-center gap-3"
              >
                <span class="text-xs text-[var(--ui-text-dimmed)] w-28 text-right shrink-0">
                  {{ languageLabel(entry.language) }}
                </span>
                <div class="flex-1">
                  <div
                    class="h-6 rounded bg-[var(--ui-primary)] opacity-80 transition-all duration-500"
                    :style="{ width: languageBarWidth(entry.count) }"
                  />
                </div>
                <span class="text-xs font-semibold w-10 shrink-0 tabular-nums">{{ entry.count }}</span>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>

    <template v-if="activeTab === 'subscribers'">
      <div v-if="subscribersStatus === 'pending'" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-[var(--ui-text-dimmed)]" />
      </div>

      <div v-else-if="subscribersData" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-languages" class="text-[var(--ui-primary)] text-lg" />
                  <span class="font-semibold">Languages</span>
                </div>
                <span class="text-sm text-[var(--ui-text-dimmed)] tabular-nums">
                  {{ subscriberTotalCount }} subscribers
                </span>
              </div>
            </template>
            <div v-if="languagePieSlices.length" class="flex flex-col md:flex-row items-center justify-center gap-6">
              <svg viewBox="0 0 100 100" class="w-44 h-44 shrink-0 -rotate-90">
                <path
                  v-for="slice in languagePieSlices"
                  :key="slice.language"
                  :d="slice.path"
                  :fill="slice.color"
                  class="transition-opacity hover:opacity-80"
                >
                  <title>{{ languageLabel(slice.language) }}: {{ slice.count }} ({{ slice.percent }}%)</title>
                </path>
              </svg>
              <div class="flex flex-col gap-1.5">
                <div
                  v-for="slice in languagePieSlices"
                  :key="slice.language"
                  class="flex items-center gap-2 text-xs"
                >
                  <span class="inline-block w-3 h-3 rounded-sm shrink-0" :style="{ backgroundColor: slice.color }" />
                  <span class="truncate min-w-28">{{ languageLabel(slice.language) }}</span>
                  <span class="font-semibold tabular-nums w-8 text-right">{{ slice.count }}</span>
                  <span class="text-[var(--ui-text-dimmed)] tabular-nums w-12 text-right">{{ slice.percent }}%</span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-[var(--ui-text-dimmed)]">No active subscribers.</p>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-timer" class="text-[var(--ui-primary)] text-lg" />
                  <span class="font-semibold">Length of Commitment</span>
                </div>
                <span class="text-sm text-[var(--ui-text-dimmed)] tabular-nums">
                  {{ durationTotalCount }} subscriptions
                </span>
              </div>
            </template>
            <div v-if="subscribersData.byDuration.length" class="flex flex-col gap-2">
              <div
                v-for="entry in subscribersData.byDuration"
                :key="entry.duration"
                class="flex items-center gap-3"
              >
                <span class="text-xs text-[var(--ui-text-dimmed)] w-20 text-right shrink-0">
                  {{ durationLabel(entry.duration) }}
                </span>
                <div class="flex-1">
                  <div
                    class="h-6 rounded bg-[var(--ui-primary)] opacity-80 transition-all duration-500"
                    :style="{ width: durationBarWidth(entry.count) }"
                  />
                </div>
                <span class="text-xs font-semibold w-10 shrink-0 tabular-nums">{{ entry.count }}</span>
              </div>
            </div>
            <p v-else class="text-sm text-[var(--ui-text-dimmed)]">No active subscriptions.</p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-clock" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">Prayer Commitment Time of Day</span>
              </div>
              <span class="text-sm text-[var(--ui-text-dimmed)]">in subscriber's local time · 5-min buckets</span>
            </div>
          </template>
          <div class="flex items-end gap-px h-48">
            <div
              v-for="bucket in subscribersData.byTimeOfDayLocal"
              :key="bucket.bucket"
              class="flex-1 flex flex-col items-end justify-end h-full group relative min-w-0"
            >
              <div
                class="w-full bg-[var(--ui-primary)] opacity-80 group-hover:opacity-100 transition-all rounded-t-sm"
                :style="{ height: timeOfDayLocalBarHeight(bucket.count) }"
              />
              <div class="absolute bottom-full mb-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {{ bucketToLabel(bucket.bucket) }}: {{ bucket.count }}
              </div>
            </div>
          </div>
          <div class="flex justify-between mt-2 text-[10px] text-[var(--ui-text-dimmed)] tabular-nums">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-globe" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">Prayer Commitment Time of Day (UTC)</span>
              </div>
              <span class="text-sm text-[var(--ui-text-dimmed)]">normalized across timezones · 5-min buckets</span>
            </div>
          </template>
          <div class="flex items-end gap-px h-48">
            <div
              v-for="bucket in subscribersData.byTimeOfDayUtc"
              :key="bucket.bucket"
              class="flex-1 flex flex-col items-end justify-end h-full group relative min-w-0"
            >
              <div
                class="w-full bg-[var(--ui-primary)] opacity-80 group-hover:opacity-100 transition-all rounded-t-sm"
                :style="{ height: timeOfDayUtcBarHeight(bucket.count) }"
              />
              <div class="absolute bottom-full mb-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {{ bucketToLabel(bucket.bucket) }} UTC: {{ bucket.count }}
              </div>
            </div>
          </div>
          <div class="flex justify-between mt-2 text-[10px] text-[var(--ui-text-dimmed)] tabular-nums">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </UCard>

      </div>
    </template>

    <template v-if="activeTab === 'prayer'">
      <div v-if="prayerStatus === 'pending'" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-[var(--ui-text-dimmed)]" />
      </div>

      <div v-else-if="prayerDaily" class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-users" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">Unique People Praying</span>
                <span class="text-sm text-[var(--ui-text-dimmed)]">(last 30 days)</span>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <span class="flex items-center gap-1">
                  <span class="inline-block w-2.5 h-2.5 rounded-sm bg-[#92b195]/50" />
                  Signed up
                </span>
                <span class="flex items-center gap-1">
                  <span class="inline-block w-2.5 h-2.5 rounded-sm bg-[#3b463d]" />
                  Prayed
                </span>
              </div>
            </div>
          </template>
          <div class="flex items-end gap-1 h-48">
            <div
              v-for="day in prayerDaily"
              :key="day.date"
              class="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              <div class="w-full relative flex items-end" :style="{ height: '100%' }">
                <div
                  class="absolute bottom-0 w-full rounded-t-sm bg-[#92b195]/50 group-hover:bg-[#92b195]/70 transition-all min-w-[4px]"
                  :style="{ height: uniquePeopleBarHeight(day.unique_subscribers) }"
                />
                <div
                  class="absolute bottom-0 w-full rounded-t-sm bg-[#3b463d] opacity-80 group-hover:opacity-100 transition-all min-w-[4px]"
                  :style="{ height: uniquePeopleBarHeight(day.unique_sessions) }"
                />
              </div>
              <span class="text-[10px] text-[var(--ui-text-dimmed)] mt-1 tabular-nums leading-none">
                {{ day.date.slice(8) }}
              </span>
              <div class="absolute bottom-full mb-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {{ formatChartDate(day.date) }}: {{ day.unique_sessions }} prayed / {{ day.unique_subscribers }} signed up
              </div>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-bar-chart-3" class="text-[var(--ui-primary)] text-lg" />
                <span class="font-semibold">Daily Prayer Time</span>
                <span class="text-sm text-[var(--ui-text-dimmed)]">(last 30 days)</span>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <span class="flex items-center gap-1">
                  <span class="inline-block w-2.5 h-2.5 rounded-sm bg-[#92b195]/50" />
                  Committed
                </span>
                <span class="flex items-center gap-1">
                  <span class="inline-block w-2.5 h-2.5 rounded-sm bg-[#3b463d]" />
                  Recorded
                </span>
              </div>
            </div>
          </template>
          <div class="flex items-end gap-1 h-48">
            <div
              v-for="day in prayerDaily"
              :key="day.date"
              class="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              <div class="w-full relative flex items-end" :style="{ height: '100%' }">
                <div
                  class="absolute bottom-0 w-full rounded-t-sm bg-[#92b195]/50 group-hover:bg-[#92b195]/70 transition-all min-w-[4px]"
                  :style="{ height: prayerTimeBarHeight(day.committed) }"
                />
                <div
                  class="absolute bottom-0 w-full rounded-t-sm bg-[#3b463d] opacity-80 group-hover:opacity-100 transition-all min-w-[4px]"
                  :style="{ height: prayerTimeBarHeight(day.minutes) }"
                />
              </div>
              <span class="text-[10px] text-[var(--ui-text-dimmed)] mt-1 tabular-nums leading-none">
                {{ day.date.slice(8) }}
              </span>
              <div class="absolute bottom-full mb-1 px-1.5 py-0.5 rounded text-xs bg-[var(--ui-bg-inverted)] text-[var(--ui-text-inverted)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {{ formatChartDate(day.date) }}: {{ formatMinutes(day.minutes) }} recorded / {{ formatMinutes(day.committed) }} committed
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

const { canAccess, canAccessUnscoped } = useAuthUser()

const allNavLinks = [
  { label: 'People Groups', to: '/admin/people-groups', icon: 'i-lucide-globe', permission: 'people_groups.view' },
  { label: 'Contacts', to: '/admin/subscribers', icon: 'i-lucide-user', permission: 'subscribers.view' },
  { label: 'Groups', to: '/admin/groups', icon: 'i-lucide-users', permission: 'groups.view' },
  { label: 'Libraries', to: '/admin/libraries', icon: 'i-lucide-book-open', permission: 'content.view', unscopedOnly: true },
  { label: 'Users', to: '/admin/users', icon: 'i-lucide-user-cog', permission: 'users.manage' },
  { label: 'Profile', to: '/admin/profile', icon: 'i-lucide-circle-user' }
]

const navLinks = computed(() =>
  allNavLinks.filter(link => {
    if (!link.permission) return true
    return link.unscopedOnly ? canAccessUnscoped(link.permission) : canAccess(link.permission)
  })
)

const activeTab = ref('general')

const tabs = [
  { label: 'General', value: 'general', icon: 'i-lucide-layout-dashboard' },
  { label: 'Prayer', value: 'prayer', icon: 'i-lucide-clock' },
  { label: 'Subscribers', value: 'subscribers', icon: 'i-lucide-users' }
]

const { data, status } = useFetch('/api/admin/dashboard/stats')
const { data: prayerDaily, status: prayerStatus } = useFetch('/api/admin/dashboard/prayer-daily')
const { data: subscribersData, status: subscribersStatus } = useFetch('/api/admin/dashboard/subscribers')

const maxUniquePeople = computed(() => {
  if (!prayerDaily.value) return 1
  return Math.max(1, ...prayerDaily.value.map((d: any) => Math.max(d.unique_sessions, d.unique_subscribers)))
})

function uniquePeopleBarHeight(count: number): string {
  if (count === 0) return '0%'
  const pct = (count / maxUniquePeople.value) * 100
  return `${Math.max(pct, 2)}%`
}

const maxPrayerTime = computed(() => {
  if (!prayerDaily.value) return 1
  return Math.max(1, ...prayerDaily.value.map((d: any) => Math.max(d.minutes, d.committed)))
})

function prayerTimeBarHeight(minutes: number): string {
  if (minutes === 0) return '0%'
  const pct = (minutes / maxPrayerTime.value) * 100
  return `${Math.max(pct, 2)}%`
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const languageMap = Object.fromEntries(LANGUAGES.map(l => [l.code, l]))

function languageLabel(code: string): string {
  const lang = languageMap[code]
  return lang ? `${lang.flag} ${lang.name}` : code
}

const totalSignups = computed(() => {
  if (!data.value?.signupsByLanguage) return 0
  return data.value.signupsByLanguage.reduce((sum: number, e: any) => sum + e.count, 0)
})

const maxLanguageCount = computed(() => {
  if (!data.value?.signupsByLanguage?.length) return 1
  return Math.max(1, data.value.signupsByLanguage[0].count)
})

function languageBarWidth(count: number): string {
  if (count === 0) return '0%'
  const pct = (count / maxLanguageCount.value) * 100
  return `${Math.max(pct, 2)}%`
}

const subscriberTotalCount = computed(() => {
  if (!subscribersData.value?.byLanguage) return 0
  return subscribersData.value.byLanguage.reduce((sum: number, e: any) => sum + e.count, 0)
})

const PIE_COLORS = [
  '#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308', '#8b5cf6', '#10b981', '#f43f5e'
]

const languagePieSlices = computed(() => {
  const entries = subscribersData.value?.byLanguage ?? []
  const total = subscriberTotalCount.value
  if (!entries.length || total === 0) return []

  const cx = 50
  const cy = 50
  const r = 40
  let cumulative = 0

  return entries.map((entry: any, idx: number) => {
    const fraction = entry.count / total
    const startAngle = cumulative * 2 * Math.PI
    cumulative += fraction
    const endAngle = cumulative * 2 * Math.PI
    const largeArc = fraction > 0.5 ? 1 : 0

    let path: string
    if (entries.length === 1 || fraction >= 0.9999) {
      path = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
    } else {
      const x1 = cx + r * Math.cos(startAngle)
      const y1 = cy + r * Math.sin(startAngle)
      const x2 = cx + r * Math.cos(endAngle)
      const y2 = cy + r * Math.sin(endAngle)
      path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
    }

    return {
      language: entry.language as string,
      count: entry.count as number,
      percent: Math.round(fraction * 1000) / 10,
      color: PIE_COLORS[idx % PIE_COLORS.length],
      path,
    }
  })
})

const timeOfDayLocalMax = computed(() => {
  if (!subscribersData.value?.byTimeOfDayLocal?.length) return 1
  return Math.max(1, ...subscribersData.value.byTimeOfDayLocal.map((b: any) => b.count))
})

function timeOfDayLocalBarHeight(count: number): string {
  if (count === 0) return '0%'
  const pct = (count / timeOfDayLocalMax.value) * 100
  return `${Math.max(pct, 2)}%`
}

const timeOfDayUtcMax = computed(() => {
  if (!subscribersData.value?.byTimeOfDayUtc?.length) return 1
  return Math.max(1, ...subscribersData.value.byTimeOfDayUtc.map((b: any) => b.count))
})

function timeOfDayUtcBarHeight(count: number): string {
  if (count === 0) return '0%'
  const pct = (count / timeOfDayUtcMax.value) * 100
  return `${Math.max(pct, 2)}%`
}

function bucketToLabel(bucket: number): string {
  const hour = Math.floor(bucket / 12)
  const minute = (bucket % 12) * 5
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const durationTotalCount = computed(() => {
  if (!subscribersData.value?.byDuration) return 0
  return subscribersData.value.byDuration.reduce((sum: number, d: any) => sum + d.count, 0)
})

const durationMax = computed(() => {
  if (!subscribersData.value?.byDuration?.length) return 1
  return Math.max(1, ...subscribersData.value.byDuration.map((d: any) => d.count))
})

function durationBarWidth(count: number): string {
  if (count === 0) return '0%'
  const pct = (count / durationMax.value) * 100
  return `${Math.max(pct, 2)}%`
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = minutes / 60
  return h === 1 ? '1 hour' : `${h} hours`
}

</script>

<style scoped>
.nav-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background-color: var(--ui-bg-elevated);
  text-decoration: none;
  color: var(--ui-text);
  transition: border-color 0.2s, background-color 0.2s;
}

.nav-card:hover {
  border-color: var(--ui-border-accented);
  background-color: var(--ui-bg);
}
</style>

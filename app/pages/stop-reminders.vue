<template>
  <div class="min-h-[calc(100vh-200px)] py-12 px-4">
    <div class="max-w-md mx-auto">
      <div v-if="pending" class="flex items-center justify-center min-h-[40vh]">
        <div class="text-center">
          <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
          <p>{{ $t('common.loading') }}</p>
        </div>
      </div>

      <!-- Reminder couldn't be found (invalid/old link or already removed) -->
      <UCard v-else-if="!target" class="text-center">
        <UIcon name="i-lucide-bell-off" class="w-12 h-12 mx-auto mb-4 text-[var(--ui-text-muted)]" />
        <h1 class="text-xl font-bold mb-2">{{ $t('campaign.profile.stopRemindersPageTitle') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">
          {{ $t('campaign.profile.error.notFound') }}
        </p>
        <UButton v-if="profileId" :to="localePath(`/subscriber?id=${profileId}`)" variant="outline">
          {{ $t('campaign.profile.pageTitle') }}
        </UButton>
      </UCard>

      <!-- Confirmation after a choice is made -->
      <UCard v-else-if="done" class="text-center">
        <UIcon
          :name="doneIcon"
          class="w-12 h-12 mx-auto mb-4"
          :class="done === 'mute' ? 'text-[var(--ui-primary)]' : 'text-amber-500'"
        />
        <p class="text-base mb-6">{{ doneMessage }}</p>
        <UButton :to="localePath(`/subscriber?id=${profileId}`)" variant="outline">
          {{ $t('campaign.profile.pageTitle') }}
        </UButton>
      </UCard>

      <!-- Already stopped (no longer praying at this time / unsubscribed) -->
      <UCard v-else-if="alreadyStopped" class="text-center">
        <UIcon name="i-lucide-circle-stop" class="w-12 h-12 mx-auto mb-4 text-amber-500" />
        <h1 class="text-xl font-bold mb-2">{{ $t('campaign.profile.alreadyStoppedTitle') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">
          {{ $t('campaign.profile.alreadyStoppedMessage', { time }) }}
        </p>
        <UButton :to="localePath(`/subscriber?id=${profileId}`)" variant="outline">
          {{ $t('campaign.profile.pageTitle') }}
        </UButton>
      </UCard>

      <!-- The choice: mute this time, stop praying at this time, or stop everything -->
      <div v-else>
        <div class="text-center mb-6">
          <div class="inline-flex p-3 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)] mb-4">
            <UIcon name="i-lucide-bell-off" class="w-7 h-7" />
          </div>
          <h1 class="text-2xl font-bold mb-1">
            {{ $t('campaign.profile.stopReminderTitle', { time, campaign: target.peopleGroup.title }) }}
          </h1>
          <p class="text-[var(--ui-text-muted)]">{{ $t('campaign.profile.stopRemindersQuestion') }}</p>
        </div>

        <div class="space-y-3">
          <UAlert
            v-if="isMuted"
            color="neutral"
            variant="soft"
            icon="i-lucide-bell-off"
            :title="$t('campaign.profile.alreadyMutedNote', { time })"
          />
          <button
            v-if="!isMuted"
            class="option-card"
            :disabled="processing"
            @click="choose('mute')"
          >
            <UIcon name="i-lucide-bell-off" class="option-icon" />
            <div>
              <div class="font-medium">{{ $t('campaign.profile.muteOption', { time }) }}</div>
              <div class="option-hint">{{ $t('campaign.profile.muteOptionHint', { time }) }}</div>
            </div>
          </button>

          <button
            class="option-card"
            :disabled="processing"
            @click="choose('not_praying')"
          >
            <UIcon name="i-lucide-pause" class="option-icon" />
            <div>
              <div class="font-medium">{{ $t('campaign.profile.stopTimeOption', { time }) }}</div>
              <div class="option-hint">{{ $t('campaign.profile.stopTimeOptionHint') }}</div>
            </div>
          </button>

          <button
            v-if="hasMultiple"
            class="option-card"
            :disabled="processing"
            @click="stopAll"
          >
            <UIcon name="i-lucide-circle-slash" class="option-icon" />
            <div>
              <div class="font-medium">{{ $t('campaign.profile.stopAllOption') }}</div>
              <div class="option-hint">{{ $t('campaign.profile.stopAllOptionHint', { campaign: target.peopleGroup.title }) }}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

const slug = route.query.slug as string
const profileId = route.query.id as string
const sid = Number(route.query.sid)

interface ProfileResponse {
  peopleGroups: Array<{
    id: number
    title: string
    slug: string
    reminders: Array<{ id: number; status: string; reminders_paused: boolean; time_preference: string | null }>
  }>
}

const { data, pending } = await useFetch<ProfileResponse>(`/api/profile/${profileId}`)

// Locate the people group and reminder this stop link refers to.
const target = computed(() => {
  for (const peopleGroup of data.value?.peopleGroups || []) {
    if (peopleGroup.slug !== slug) continue
    const reminder = peopleGroup.reminders.find(r => r.id === sid)
    if (reminder) return { peopleGroup, reminder }
  }
  return null
})

// Format a "HH:MM" preference as a friendly clock time (e.g. "9:00 AM").
function formatTime(value: string | null): string {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  if (h === undefined || m === undefined) return value
  const period = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

const time = computed(() => formatTime(target.value?.reminder.time_preference ?? null))

// This time is no longer being prayed (stopped) — offer to restart, not re-stop.
const alreadyStopped = computed(() => {
  const status = target.value?.reminder.status
  return status === 'inactive' || status === 'unsubscribed'
})

// Still praying but the daily email is already silenced — hide the mute option.
const isMuted = computed(() =>
  target.value?.reminder.status === 'active' && !!target.value?.reminder.reminders_paused
)

// Offer "stop everything" only when there's more than one active prayer time here.
const hasMultiple = computed(() =>
  (target.value?.peopleGroup.reminders.filter(r => r.status === 'active').length ?? 0) > 1
)

const processing = ref(false)
const done = ref<'mute' | 'not_praying' | 'stop_all' | null>(null)

const doneIcon = computed(() =>
  done.value === 'mute' ? 'i-lucide-bell-off' : done.value === 'stop_all' ? 'i-lucide-circle-slash' : 'i-lucide-pause'
)
const doneMessage = computed(() => {
  if (done.value === 'mute') return t('campaign.profile.muteSuccess')
  if (done.value === 'stop_all') return t('campaign.profile.stopAllSuccess', { campaign: target.value?.peopleGroup.title })
  return t('campaign.profile.notPrayingSuccess')
})

async function choose(action: 'mute' | 'not_praying') {
  processing.value = true
  try {
    await $fetch(`/api/people-groups/${slug}/reminder/${sid}/stop`, {
      method: 'POST',
      body: { profile_id: profileId, action }
    })
    done.value = action
  } catch (err: any) {
    toast.add({ title: err.data?.statusMessage || t('campaign.profile.error.failed'), color: 'error' })
  } finally {
    processing.value = false
  }
}

async function stopAll() {
  processing.value = true
  try {
    await $fetch(`/api/people-groups/${slug}/stop-all`, {
      method: 'POST',
      body: { profile_id: profileId }
    })
    done.value = 'stop_all'
  } catch (err: any) {
    toast.add({ title: err.data?.statusMessage || t('campaign.profile.error.failed'), color: 'error' })
  } finally {
    processing.value = false
  }
}

useHead({
  title: t('campaign.profile.stopRemindersPageTitle')
})
</script>

<style scoped>
.option-card {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  text-align: left;
  padding: 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.option-card:hover:not(:disabled) {
  background: var(--ui-bg-elevated);
  border-color: var(--ui-primary);
}
.option-card:disabled {
  opacity: 0.5;
  cursor: default;
}
.option-icon {
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.125rem;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}
.option-hint {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-top: 0.25rem;
}
</style>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-xs text-[var(--ui-text-muted)]">{{ $t('calendar.addToCalendar') }}:</span>
    <UButton
      :href="googleUrl"
      target="_blank"
      variant="outline"
      size="xs"
      icon="i-lucide-calendar"
    >
      {{ $t('calendar.googleCalendar') }}
    </UButton>
    <UButton
      :to="icsUrl"
      external
      variant="outline"
      size="xs"
      icon="i-lucide-download"
    >
      {{ $t('calendar.downloadIcs') }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()

const props = defineProps<{
  subscriptionId: number
  profileId: string
  campaignName: string
  campaignSlug: string
  trackingId?: string
  frequency: string
  daysOfWeek?: number[]
  timePreference: string
  timezone: string
  durationMinutes: number
}>()

const config = useRuntimeConfig()
const prayerUrl = computed(() => {
  const base = config.public.siteUrl || window.location.origin
  const path = `/${props.campaignSlug}/prayer`
  return props.trackingId ? `${base}${path}?uid=${props.trackingId}` : `${base}${path}`
})

const googleUrl = computed(() =>
  generateGoogleCalendarUrl({
    title: `Prayer for the ${props.campaignName}`,
    description: t('calendar.eventDescription', { duration: props.durationMinutes, campaign: props.campaignName }),
    frequency: props.frequency,
    daysOfWeek: props.daysOfWeek,
    timePreference: props.timePreference,
    timezone: props.timezone,
    durationMinutes: props.durationMinutes,
    url: prayerUrl.value
  })
)

const icsUrl = computed(() =>
  getIcsDownloadUrl(props.subscriptionId, props.profileId)
)
</script>

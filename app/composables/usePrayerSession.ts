import { type ComputedRef, type Ref, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useToast, useI18n, getVisitorId } from '#imports'

const MAX_PRAYER_DURATION_SECONDS = 2 * 60 * 60

export function usePrayerSession(slug: string, contentDate: ComputedRef<string> | Ref<string>, peopleGroupId?: ComputedRef<number | undefined> | Ref<number | undefined>) {
  const route = useRoute()
  const toast = useToast()
  const { t, locale } = useI18n()

  const trackingId = computed(() => {
    return (route.query.uid as string) || getVisitorId()
  })

  const pageOpenTime = ref(Date.now())
  const sessionId = ref(`${Date.now()}-${Math.random().toString(36).substring(2, 9)}`)
  const autoSaveTimeouts = ref<ReturnType<typeof setTimeout>[]>([])
  const autoSaveComplete = ref(false)
  const prayedMarked = ref(false)
  const submitting = ref(false)
  const autoCheckpointTracked = ref(false)

  function getDurationSeconds() {
    const rawDuration = Math.floor((Date.now() - pageOpenTime.value) / 1000)
    return Math.min(rawDuration, MAX_PRAYER_DURATION_SECONDS)
  }

  async function autoSavePrayerSession(trackCheckpoint = false) {
    if (prayedMarked.value || autoSaveComplete.value) return

    try {
      const duration = getDurationSeconds()
      const timestamp = new Date().toISOString()

      // The browser sets `trackEvent` only on the save that should fan out to
      // Statinator (the 30s checkpoint). The session endpoint handles the
      // forward via trackEventInBackground; no separate analytics call needed.
      const shouldTrack = trackCheckpoint && !autoCheckpointTracked.value && duration > 0
      if (shouldTrack) autoCheckpointTracked.value = true

      await $fetch(`/api/people-groups/${slug}/prayer-content/${contentDate.value}/session`, {
        method: 'POST',
        body: {
          session_id: sessionId.value,
          tracking_id: trackingId.value || null,
          duration,
          timestamp,
          people_group_id: peopleGroupId?.value,
          track_event: shouldTrack ? 'prayer_auto_tracked' : undefined,
          language: locale.value
        }
      })
    } catch (err: any) {
      console.error('Failed to auto-save prayer session:', err)
    }
  }

  function cancelAutoSaveTimeouts() {
    autoSaveTimeouts.value.forEach(timeout => clearTimeout(timeout))
    autoSaveTimeouts.value = []
    autoSaveComplete.value = true
  }

  async function markAsPrayed() {
    if (prayedMarked.value || submitting.value) return

    submitting.value = true
    cancelAutoSaveTimeouts()

    try {
      const duration = getDurationSeconds()
      const timestamp = new Date().toISOString()

      await $fetch(`/api/people-groups/${slug}/prayer-content/${contentDate.value}/session`, {
        method: 'POST',
        body: {
          session_id: sessionId.value,
          tracking_id: trackingId.value || null,
          duration,
          timestamp,
          people_group_id: peopleGroupId?.value,
          track_event: 'prayer_logged',
          language: locale.value
        }
      })

      prayedMarked.value = true
    } catch (err: any) {
      console.error('Failed to record prayer:', err)
      toast.add({
        title: 'Error',
        description: t('prayerFuel.error.recordFailed'),
        color: 'error'
      })
    } finally {
      submitting.value = false
    }
  }

  function formatDate(dateString: string, language: string) {
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year!, month! - 1, day!)
    return date.toLocaleDateString(language || 'en', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  function setupAutoSave() {
    pageOpenTime.value = Date.now()

    // Report immediately with duration 0
    autoSavePrayerSession()

    // Schedule: 30s, 60s, then every 60s up to 15 minutes
    const intervals: number[] = [30 * 1000, 60 * 1000]
    for (let t = 2 * 60 * 1000; t <= 15 * 60 * 1000; t += 60 * 1000) {
      intervals.push(t)
    }

    intervals.forEach((interval) => {
      const timeout = setTimeout(() => {
        autoSavePrayerSession(interval === 30 * 1000)
      }, interval)
      autoSaveTimeouts.value.push(timeout)
    })
  }

  onMounted(() => {
    setupAutoSave()
  })

  onUnmounted(() => {
    cancelAutoSaveTimeouts()
  })

  return {
    prayedMarked,
    submitting,
    trackingId,
    markAsPrayed,
    formatDate
  }
}

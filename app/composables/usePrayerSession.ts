import { type ComputedRef, type Ref, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useToast, useI18n, useTracking, getVisitorId } from '#imports'

const MAX_PRAYER_DURATION_SECONDS = 2 * 60 * 60

export function usePrayerSession(slug: string, contentDate: ComputedRef<string> | Ref<string>, peopleGroupId?: ComputedRef<number | undefined> | Ref<number | undefined>) {
  const route = useRoute()
  const toast = useToast()
  const { t } = useI18n()
  const { trackEvent } = useTracking()

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

  function trackAutoCheckpoint() {
    if (autoCheckpointTracked.value) return
    autoCheckpointTracked.value = true

    const duration = getDurationSeconds()
    if (duration <= 0) return

    trackEvent('prayer_auto_tracked', {
      value: duration,
      metadata: {
        people_group_slug: slug,
        content_date: contentDate.value,
        source: 'auto'
      }
    })
  }

  async function autoSavePrayerSession(trackCheckpoint = false) {
    if (prayedMarked.value || autoSaveComplete.value) return

    try {
      const duration = getDurationSeconds()
      const timestamp = new Date().toISOString()

      await $fetch(`/api/people-groups/${slug}/prayer-content/${contentDate.value}/session`, {
        method: 'POST',
        body: {
          sessionId: sessionId.value,
          trackingId: trackingId.value || null,
          duration,
          timestamp,
          peopleGroupId: peopleGroupId?.value
        }
      })

      if (trackCheckpoint) {
        trackAutoCheckpoint()
      }
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
          sessionId: sessionId.value,
          trackingId: trackingId.value || null,
          duration,
          timestamp,
          peopleGroupId: peopleGroupId?.value
        }
      })

      prayedMarked.value = true
      trackEvent('prayer_logged', {
        value: duration,
        metadata: {
          people_group_slug: slug,
          content_date: contentDate.value,
          source: 'explicit'
        }
      })
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
    const date = new Date(dateString)
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

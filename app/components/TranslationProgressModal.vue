<template>
  <UModal
    v-model:open="isOpen"
    title="Translation Progress"
    :close="isComplete"
  >
    <template #body>
      <div class="progress-body">
        <!-- Progress Bar -->
        <div class="progress-container">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${progressPercent}%` }"
              :class="{ 'has-errors': stats.failed > 0 }"
            />
          </div>
          <div class="progress-text">
            {{ completedCount }} of {{ stats.total }} translations
          </div>
        </div>

        <!-- Status Breakdown -->
        <div class="status-breakdown">
          <div class="status-item">
            <span class="status-dot pending" />
            <span>Pending: {{ stats.pending }}</span>
          </div>
          <div class="status-item">
            <span class="status-dot processing" />
            <span>Processing: {{ stats.processing }}</span>
          </div>
          <div class="status-item">
            <span class="status-dot completed" />
            <span>Completed: {{ stats.completed }}</span>
          </div>
          <div v-if="stats.failed > 0" class="status-item">
            <span class="status-dot failed" />
            <span>Failed: {{ stats.failed }}</span>
          </div>
        </div>

        <!-- Status Message -->
        <div class="status-message">
          <template v-if="!isComplete">
            <p>Translation in progress. This may take a few minutes...</p>
          </template>
          <template v-else-if="stats.failed > 0">
            <p class="warning">
              Translation completed with {{ stats.failed }} error(s).
            </p>
          </template>
          <template v-else-if="verseWarnings.length > 0">
            <p class="warning">
              Translation completed with {{ verseWarnings.length }} verse warning(s).
            </p>
          </template>
          <template v-else>
            <p class="success">
              All translations completed successfully!
            </p>
          </template>
        </div>

        <!-- Verse Warnings -->
        <div v-if="isComplete && verseWarnings.length > 0" class="verse-warnings">
          <button class="warnings-toggle" @click="showWarnings = !showWarnings">
            {{ showWarnings ? 'Hide' : 'Show' }} verse warnings ({{ verseWarnings.length }})
          </button>
          <div v-if="showWarnings" class="warnings-list">
            <div v-for="(w, i) in verseWarnings" :key="i" class="warning-item">
              <strong>{{ w.reference }}</strong> ({{ w.language }}) — {{ w.reason }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="progress-modal-actions">
        <template v-if="!isComplete">
          <UButton
            @click="handleCancel"
            variant="outline"
            color="error"
            :loading="cancelling"
          >
            {{ cancelling ? 'Cancelling...' : 'Cancel' }}
          </UButton>
        </template>
        <template v-else>
          <UButton @click="handleClose">
            Close
          </UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface TranslationStats {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
}

interface Props {
  open?: boolean
  libraryId: number
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  libraryId: 0
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
  cancelled: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

const stats = ref<TranslationStats>({
  total: 0,
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0
})

const isComplete = ref(false)
const cancelling = ref(false)
const pollInterval = ref<NodeJS.Timeout | null>(null)
const verseWarnings = ref<Array<{ reference: string; language: string; reason: string }>>([])
const showWarnings = ref(false)

const completedCount = computed(() => {
  return stats.value.completed + stats.value.failed
})

const progressPercent = computed(() => {
  if (stats.value.total === 0) return 0
  return Math.round((completedCount.value / stats.value.total) * 100)
})

// Start polling when modal opens
watch(() => props.open, async (newVal) => {
  if (newVal && props.libraryId) {
    isComplete.value = false
    cancelling.value = false
    verseWarnings.value = []
    showWarnings.value = false
    await fetchStatus()
    startPolling()
  } else {
    stopPolling()
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopPolling()
})

async function fetchStatus() {
  try {
    const response = await $fetch(`/api/admin/libraries/${props.libraryId}/translate/status`)
    stats.value = {
      total: response.total,
      pending: response.pending,
      processing: response.processing,
      completed: response.completed,
      failed: response.failed
    }
    isComplete.value = response.isComplete

    if (isComplete.value) {
      stopPolling()
      if (response.verseWarnings?.length) {
        verseWarnings.value = response.verseWarnings
      }
    }
  } catch (error) {
    console.error('Failed to fetch translation status:', error)
  }
}

function startPolling() {
  stopPolling()
  pollInterval.value = setInterval(fetchStatus, 2000)
}

function stopPolling() {
  if (pollInterval.value) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

async function handleCancel() {
  cancelling.value = true
  try {
    await $fetch(`/api/admin/libraries/${props.libraryId}/translate/cancel`, {
      method: 'POST'
    })
    await fetchStatus()
    emit('cancelled')
  } catch (error) {
    console.error('Failed to cancel translation:', error)
  } finally {
    cancelling.value = false
  }
}

function handleClose() {
  stopPolling()
  emit('close')
  isOpen.value = false
}
</script>

<style scoped>
.progress-body {
  padding: 1.5rem;
}

.progress-container {
  margin-bottom: 1.5rem;
}

.progress-bar {
  height: 8px;
  background: var(--ui-bg-muted);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: var(--ui-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-fill.has-errors {
  background: linear-gradient(90deg, var(--ui-primary), var(--ui-warning));
}

.progress-text {
  text-align: center;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.status-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--ui-bg-muted);
  border-radius: 0.5rem;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.pending {
  background: var(--ui-text-muted);
}

.status-dot.processing {
  background: var(--ui-info);
  animation: pulse 1s infinite;
}

.status-dot.completed {
  background: var(--ui-success);
}

.status-dot.failed {
  background: var(--ui-error);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-message {
  text-align: center;
}

.status-message p {
  margin: 0;
}

.status-message .warning {
  color: var(--ui-warning);
}

.status-message .success {
  color: var(--ui-success);
}

.status-message .info {
  color: var(--ui-text-muted);
}

.verse-warnings {
  margin-top: 1rem;
}

.warnings-toggle {
  background: none;
  border: none;
  color: var(--ui-warning);
  cursor: pointer;
  font-size: 0.875rem;
  text-decoration: underline;
  padding: 0;
}

.warnings-list {
  margin-top: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--ui-border);
  border-radius: 0.375rem;
  padding: 0.5rem;
}

.warning-item {
  font-size: 0.8125rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
}

.warning-item:last-child {
  border-bottom: none;
}

.progress-modal-actions {
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>

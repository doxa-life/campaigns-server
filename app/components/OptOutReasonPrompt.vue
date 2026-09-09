<template>
  <div v-if="!submitted">
    <div class="text-center mb-5">
      <UIcon :name="icon" class="w-10 h-10 mx-auto mb-3 text-[var(--ui-text-muted)]" />
      <h2 class="text-lg font-semibold mb-1">{{ heading }}</h2>
      <p class="text-sm text-[var(--ui-text-muted)]">{{ $t('campaign.optOutReason.title') }}</p>
      <p class="text-xs text-[var(--ui-text-dimmed)] mt-1">{{ $t('campaign.optOutReason.subtitle') }}</p>
    </div>

    <div class="space-y-2">
      <button
        v-for="key in reasons"
        :key="key"
        type="button"
        class="reason-option"
        :class="{ 'reason-option--selected': selected === key }"
        :disabled="sending"
        @click="select(key)"
      >
        {{ $t(`campaign.optOutReason.reason.${key}`) }}
      </button>
    </div>

    <div v-if="selected === 'other'" class="mt-3">
      <UTextarea
        v-model="reasonText"
        :rows="3"
        :maxlength="OPT_OUT_REASON_TEXT_MAX"
        :placeholder="$t('campaign.optOutReason.otherPlaceholder')"
        :disabled="sending"
        class="w-full"
      />
      <p class="text-xs text-[var(--ui-text-dimmed)] mt-1 text-right">
        {{ $t('campaign.optOutReason.charactersLeft', { count: charactersLeft }) }}
      </p>
    </div>

    <div class="flex items-center justify-between gap-3 mt-5">
      <UButton variant="ghost" color="neutral" :disabled="sending" @click="skip">
        {{ $t('campaign.optOutReason.skip') }}
      </UButton>
      <UButton :disabled="!selected || sending" :loading="sending" @click="submit">
        {{ sending ? $t('campaign.optOutReason.sending') : $t('campaign.optOutReason.send') }}
      </UButton>
    </div>
  </div>

  <div v-else class="text-center py-4">
    <UIcon name="i-lucide-heart-handshake" class="w-10 h-10 mx-auto mb-3 text-[var(--ui-primary)]" />
    <p class="text-base">{{ $t('campaign.optOutReason.thanks') }}</p>
  </div>
</template>

<script setup lang="ts">
import { OPT_OUT_REASON_TEXT_MAX, optOutReasonsFor, type OptOutReasonKey } from '~~/config/opt-out-reasons'

const props = withDefaults(defineProps<{
  /** Profile id of the subscriber, the self-service token the opt-out pages use. */
  profileId: string
  /** Prayer times the answer applies to. Empty means there is nothing to record. */
  subscriptionIds: number[]
  /**
   * True when the button the person clicked already said they stopped praying.
   * Those answers are dropped: one repeats the click, the other contradicts it.
   */
  alreadySaidStopped?: boolean
  /** Clock time of the prayer time that was stopped, when it was a single one. */
  time?: string | null
  /** People group name, shown when every prayer time for it was stopped at once. */
  campaign?: string | null
  /** Whole people group stopped rather than one prayer time. */
  wholePeopleGroup?: boolean
  icon?: string
}>(), {
  alreadySaidStopped: false,
  time: null,
  campaign: null,
  wholePeopleGroup: false,
  icon: 'i-lucide-message-circle-question'
})

const emit = defineEmits<{
  /** Answered or skipped — either way the prompt is finished with. */
  (e: 'done'): void
  /**
   * The answer that was recorded. Lets a caller that asks once per visit reuse it
   * for further opt-outs in the same sitting instead of asking again.
   */
  (e: 'answered', payload: { reason: OptOutReasonKey, reason_text: string | null }): void
}>()

// How long the thank-you stays on screen before the prompt reports itself done.
const THANKS_MS = 1600
let thanksTimer: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => {
  if (thanksTimer) clearTimeout(thanksTimer)
})

const { t } = useI18n()
const toast = useToast()

const selected = ref<OptOutReasonKey | null>(null)
const reasonText = ref('')
const sending = ref(false)
const submitted = ref(false)

const reasons = computed(() => optOutReasonsFor(props.alreadySaidStopped))

const charactersLeft = computed(() => OPT_OUT_REASON_TEXT_MAX - reasonText.value.length)

const heading = computed(() => {
  if (props.wholePeopleGroup && props.campaign) {
    return t('campaign.optOutReason.stoppedAllTitle', { campaign: props.campaign })
  }
  if (props.time) return t('campaign.optOutReason.stoppedTitle', { time: props.time })
  return t('campaign.optOutReason.stoppedGenericTitle')
})

function select(key: OptOutReasonKey) {
  selected.value = key
  if (key !== 'other') reasonText.value = ''
}

function skip() {
  emit('done')
}

async function submit() {
  if (!selected.value || props.subscriptionIds.length === 0) {
    emit('done')
    return
  }

  sending.value = true
  try {
    await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: props.profileId,
        subscription_ids: props.subscriptionIds,
        reason: selected.value,
        reason_text: selected.value === 'other' ? reasonText.value : null
      }
    })
    submitted.value = true
    emit('answered', {
      reason: selected.value,
      reason_text: selected.value === 'other' ? (reasonText.value.trim() || null) : null
    })
    thanksTimer = setTimeout(() => emit('done'), THANKS_MS)
  } catch (err: any) {
    // The opt-out itself already succeeded, so a failure here is never worth
    // blocking on — thank them and close rather than asking them to try again.
    toast.add({ title: t('campaign.optOutReason.thanks'), color: 'neutral' })
    emit('done')
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.reason-option {
  width: 100%;
  text-align: left;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.reason-option:hover:not(:disabled) {
  background: var(--ui-bg-elevated);
  border-color: var(--ui-primary);
}
.reason-option--selected {
  border-color: var(--ui-primary);
  background: var(--ui-bg-elevated);
  font-weight: 500;
}
.reason-option:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

<template>
  <div class="min-h-[calc(100vh-200px)] flex items-center justify-center p-4 sm:p-8">
    <div class="max-w-[560px] w-full">
      <!-- Success state -->
      <UCard v-if="submitted" class="text-center py-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <UIcon name="i-lucide-check-circle" class="text-4xl text-[var(--ui-text)] shrink-0" />
          <h1 class="text-2xl font-bold m-0">{{ $t('feedback.success.title') }}</h1>
        </div>
        <p class="text-[var(--ui-text-muted)] leading-relaxed">{{ $t('feedback.success.message') }}</p>
      </UCard>

      <!-- Feedback form -->
      <UCard v-else>
        <template #header>
          <h1 class="text-2xl font-bold mb-1">{{ $t('feedback.heading') }}</h1>
          <p class="text-sm text-[var(--ui-text-muted)] m-0">{{ $t('feedback.intro') }}</p>
        </template>

        <form class="space-y-4" @submit.prevent="submit">
          <UFormField :label="$t('feedback.typeLabel')" name="feedback_type" required :error="typeError">
            <div class="flex flex-wrap justify-center gap-2">
              <UButton
                v-for="opt in typeItems"
                :key="opt.value"
                :icon="opt.icon"
                :label="opt.label"
                :color="form.feedback_type === opt.value ? 'primary' : 'neutral'"
                :variant="form.feedback_type === opt.value ? 'solid' : 'outline'"
                size="lg"
                class="justify-center"
                @click="selectType(opt.value)"
              />
            </div>
          </UFormField>

          <UFormField :label="$t('feedback.nameLabel')" name="name">
            <UInput v-model="form.name" :placeholder="$t('feedback.namePlaceholder')" class="w-full" />
          </UFormField>

          <UFormField :label="$t('feedback.emailLabel')" name="email" required :error="emailError">
            <UInput v-model="form.email" type="email" :placeholder="$t('feedback.emailPlaceholder')" class="w-full" />
          </UFormField>

          <UFormField :label="$t('feedback.messageLabel')" name="message" required :error="messageError">
            <UTextarea v-model="form.message" :rows="5" :placeholder="$t('feedback.messagePlaceholder')" class="w-full" />
          </UFormField>

          <div class="flex items-start gap-3 py-1">
            <USwitch v-model="form.consent_doxa_general" />
            <span class="text-sm text-[var(--ui-text-muted)]">{{ $t('feedback.consentLabel') }}</span>
          </div>

          <UButton type="submit" block size="lg" :loading="submitting" :disabled="submitting">
            {{ submitting ? $t('feedback.submitting') : $t('feedback.submit') }}
          </UButton>
        </form>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const { t, locale } = useI18n()
const toast = useToast()

// Identity handed over by the app. Used only on submit to link the feedback to
// the existing subscriber — never rendered, never used to look anything up.
const trackingId = (route.query.tracking_id as string) || undefined

// Device diagnostics the app appends to the URL. We forward a fixed allowlist
// (the server sanitises again); never rendered.
const DEVICE_KEYS = ['platform', 'os_version', 'device_model', 'app_version', 'app_build', 'timezone']
const device: Record<string, string> = {}
for (const key of DEVICE_KEYS) {
  const value = route.query[key]
  if (typeof value === 'string' && value) device[key] = value
}

type FeedbackType = 'compliment' | 'suggestion' | 'problem'

// Deliberately starts unselected so the user makes a conscious choice — submit
// is blocked until one is picked.
const form = reactive({
  feedback_type: null as FeedbackType | null,
  name: '',
  email: '',
  message: '',
  consent_doxa_general: false
})

const typeItems = computed<{ label: string; value: FeedbackType; icon: string }[]>(() => [
  { label: t('feedback.type.compliment'), value: 'compliment', icon: 'i-lucide-heart' },
  { label: t('feedback.type.suggestion'), value: 'suggestion', icon: 'i-lucide-lightbulb' },
  { label: t('feedback.type.problem'), value: 'problem', icon: 'i-lucide-triangle-alert' }
])

const submitting = ref(false)
const submitted = ref(false)
const typeError = ref<string | undefined>()
const emailError = ref<string | undefined>()
const messageError = ref<string | undefined>()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function selectType(value: FeedbackType) {
  form.feedback_type = value
  typeError.value = undefined
}

async function submit() {
  typeError.value = undefined
  emailError.value = undefined
  messageError.value = undefined

  const email = form.email.trim()
  const message = form.message.trim()
  let valid = true
  if (!form.feedback_type) {
    typeError.value = t('feedback.validation.type')
    valid = false
  }
  if (!EMAIL_REGEX.test(email)) {
    emailError.value = t('feedback.validation.email')
    valid = false
  }
  if (!message) {
    messageError.value = t('feedback.validation.message')
    valid = false
  }
  if (!valid) return

  submitting.value = true
  try {
    await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        name: form.name.trim() || undefined,
        email,
        message,
        feedback_type: form.feedback_type,
        consent_doxa_general: form.consent_doxa_general,
        language: locale.value,
        tracking_id: trackingId,
        device
      }
    })
    submitted.value = true
  } catch (err: any) {
    const rateLimited = err?.statusCode === 429 || err?.response?.status === 429
    toast.add({
      title: t('feedback.error.title'),
      description: rateLimited ? t('feedback.error.rateLimited') : t('feedback.error.message'),
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}

useHead(() => ({
  title: `${t('feedback.pageTitle')} - ${t('app.title')}`
}))
</script>

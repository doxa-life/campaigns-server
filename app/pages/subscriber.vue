<template>
  <div class="min-h-[calc(100vh-200px)] py-8 px-4">
    <div v-if="pending" class="flex items-center justify-center min-h-[50vh]">
      <div class="text-center">
        <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
        <p>{{ $t('common.loading') }}</p>
      </div>
    </div>

    <div v-else-if="error" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-alert-circle" class="w-16 h-16 mx-auto mb-4 text-red-500" />
        <h1 class="text-2xl font-bold mb-4">{{ $t('campaign.profile.error.title') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">
          {{ error.data?.statusMessage || $t('campaign.profile.error.notFound') }}
        </p>
        <UButton :to="localePath('/')">
          {{ $t('campaign.unsubscribe.error.goHome') }}
        </UButton>
      </UCard>
    </div>

    <div v-else-if="data" class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-2">
          <div class="p-2 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)]">
            <UIcon name="i-lucide-settings" class="w-6 h-6" />
          </div>
          <div>
            <h1 class="text-2xl font-bold">{{ $t('campaign.profile.title') }}</h1>
          </div>
        </div>
        <p class="text-[var(--ui-text-muted)] mt-4">
          {{ $t('campaign.profile.greeting', { name: globalForm.name }) }}
        </p>
      </div>

      <!-- Email Verification Warning -->
      <UAlert
        v-if="!globalForm.email_verified && globalForm.email"
        color="warning"
        icon="i-lucide-alert-triangle"
        :title="$t('campaign.profile.emailNotVerified')"
        class="mb-6"
      />

      <!-- Success/Error Messages -->
      <UAlert v-if="saveSuccess" color="success" :title="successMessage" class="mb-6" />
      <UAlert v-if="saveError" color="error" :title="saveError" class="mb-6" />

      <!-- Global Account Settings -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-user" class="w-5 h-5" />
            <span class="font-medium">{{ $t('campaign.profile.sections.account') }}</span>
          </div>
        </template>

        <div class="space-y-4">
          <UFormField :label="$t('campaign.signup.form.name.label')">
            <UInput
              v-model="globalForm.name"
              type="text"
              required
              class="w-full"
            />
          </UFormField>

          <UFormField :label="$t('campaign.signup.form.email.label')">
            <UInput
              v-model="globalForm.email"
              type="email"
              class="w-full"
            />
            <template #hint>
              <span class="text-xs">{{ $t('campaign.profile.emailHint') }}</span>
            </template>
          </UFormField>

          <div class="flex justify-end">
            <UButton
              @click="saveGlobalSettings"
              :loading="savingGlobal"
              size="sm"
            >
              {{ $t('campaign.profile.saveAccount') }}
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Communication Preferences -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-mail" class="w-5 h-5" />
            <span class="font-medium">{{ $t('campaign.profile.sections.emailPreferences') }}</span>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-[var(--ui-text-muted)]">
            {{ $t('campaign.profile.emailPreferences.description') }}
          </p>

          <!-- Doxa General Consent -->
          <div class="flex items-center justify-between py-2 border-b border-[var(--ui-border)]">
            <div>
              <p class="text-sm font-medium">{{ $t('campaign.profile.emailPreferences.doxaGeneral') }}</p>
              <p class="text-xs text-[var(--ui-text-muted)]">{{ $t('campaign.profile.emailPreferences.doxaGeneralHint') }}</p>
            </div>
            <USwitch
              v-model="consentForm.doxa_general"
              @update:model-value="updateDoxaConsent"
            />
          </div>

          <!-- Product / feedback emails -->
          <div class="flex items-center justify-between py-2 border-b border-[var(--ui-border)]">
            <div>
              <p class="text-sm font-medium">{{ $t('campaign.profile.emailPreferences.productEmails') }}</p>
              <p class="text-xs text-[var(--ui-text-muted)]">{{ $t('campaign.profile.emailPreferences.productEmailsHint') }}</p>
            </div>
            <USwitch
              v-model="consentForm.product_emails"
              @update:model-value="updateProductConsent"
            />
          </div>

          <!-- People group-specific consents -->
          <div
            v-for="pgGroup in data.peopleGroups"
            :key="'consent-' + pgGroup.id"
            class="flex items-center justify-between py-2"
          >
            <p class="text-sm">{{ $t('campaign.profile.emailPreferences.campaignUpdates', { campaign: pgGroup.title }) }}</p>
            <USwitch
              :model-value="isPeopleGroupConsented(pgGroup.id)"
              @update:model-value="(val) => updatePeopleGroupConsent(pgGroup.id, pgGroup.slug, val)"
            />
          </div>
        </div>
      </UCard>

      <!-- Prayer times (one card per reminder) -->
      <div class="space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="w-5 h-5" />
          {{ $t('campaign.profile.subscriptions') }}
        </h2>

        <UCard
          v-for="item in allReminders"
          :key="item.reminder.id"
          :class="{ 'opacity-60': item.reminder.status === 'unsubscribed' }"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ item.peopleGroup.title }}</span>
                <UBadge
                  v-if="item.reminder.status === 'unsubscribed'"
                  color="neutral"
                  size="xs"
                >
                  {{ $t('campaign.profile.unsubscribed') }}
                </UBadge>
              </div>
              <div class="flex items-center gap-2">
                <NuxtLink
                  :to="localePath(`/${item.peopleGroup.slug}`)"
                  class="text-xs text-[var(--ui-text-muted)] hover:underline"
                >
                  {{ $t('campaign.profile.viewCampaign') }}
                </NuxtLink>
                <UButton
                  v-if="item.reminder.status === 'active'"
                  variant="ghost"
                  color="error"
                  size="xs"
                  @click="confirmDeleteReminder(item.reminder, item.peopleGroup)"
                >
                  <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
                </UButton>
              </div>
            </div>
          </template>

          <div v-if="reminderForms[item.reminder.id]" class="space-y-4">
            <UFormField :label="$t('campaign.signup.form.frequency.label')">
              <USelect
                v-model="reminderForms[item.reminder.id]!.frequency"
                :items="frequencyOptions"
                required
                class="w-full"
              />
            </UFormField>

            <UFormField v-if="reminderForms[item.reminder.id]!.frequency === 'weekly'" :label="$t('campaign.signup.form.daysOfWeek.label')">
              <div class="grid grid-cols-7 gap-1 w-full">
                <label
                  v-for="day in translatedDaysOfWeek"
                  :key="day.value"
                  class="flex flex-col items-center gap-1 p-2 border border-[var(--ui-border)] rounded-lg cursor-pointer transition-colors hover:bg-[var(--ui-bg-elevated)]"
                  :class="{ 'border-[var(--ui-primary)] bg-[var(--ui-bg-elevated)]': reminderForms[item.reminder.id]!.days_of_week.includes(day.value) }"
                >
                  <UCheckbox
                    :model-value="reminderForms[item.reminder.id]!.days_of_week.includes(day.value)"
                    @update:model-value="toggleDayOfWeek(item.reminder.id, day.value)"
                  />
                  <span class="text-xs font-medium">{{ day.label }}</span>
                </label>
              </div>
            </UFormField>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField :label="$t('campaign.signup.form.time.label')">
                <UInput
                  v-model="reminderForms[item.reminder.id]!.time_preference"
                  type="time"
                  required
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="$t('campaign.signup.form.timezone.label')">
                <USelectMenu
                  v-model="reminderForms[item.reminder.id]!.timezone"
                  :items="timezoneOptions"
                  :search-input="{ placeholder: $t('campaign.signup.form.timezone.searchPlaceholder') }"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField :label="$t('campaign.signup.form.duration.label')">
              <USelect
                v-model="reminderForms[item.reminder.id]!.prayer_duration"
                :items="durationOptions"
                required
                class="w-full"
              />
            </UFormField>

            <!-- Add to Calendar -->
            <AddToCalendar
              v-if="item.reminder.calendar_urls"
              :google-url="item.reminder.calendar_urls.google"
              :ics-url="item.reminder.calendar_urls.ics"
              class="pt-2"
            />

            <div class="flex items-center justify-end gap-2 pt-2">
              <UButton
                v-if="item.reminder.status === 'unsubscribed'"
                variant="outline"
                size="sm"
                @click="resubscribeReminder(item.reminder, item.peopleGroup)"
              >
                {{ $t('campaign.profile.resubscribeButton') }}
              </UButton>
              <UButton
                @click="saveReminder(item.reminder, item.peopleGroup)"
                :loading="savingReminder === item.reminder.id"
                size="sm"
              >
                {{ $t('campaign.profile.save') }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Back Button -->
      <div v-if="data.peopleGroups.length > 0" class="flex items-center justify-start pt-8">
        <UButton
          :to="localePath(`/${data.peopleGroups[0]?.slug}`)"
          variant="ghost"
        >
          <UIcon name="i-lucide-arrow-left" class="w-4 h-4 mr-1" />
          {{ $t('prayerFuel.backTo', { campaign: data.peopleGroups[0]?.title }) }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const profileId = route.query.id as string
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

interface ProfileResponse {
  subscriber: {
    id: number
    profile_id: string
    name: string
    email: string
    email_verified: boolean
    phone: string
  }
  peopleGroups: Array<{
    id: number
    title: string
    slug: string
    reminders: Array<{
      id: number
      delivery_method: string
      frequency: string
      days_of_week: number[]
      time_preference: string
      timezone: string
      prayer_duration: number
      status: string
      calendar_urls: { google: string; ics: string } | null
    }>
  }>
  consents: {
    doxa_general: boolean
    doxa_general_at: string | null
    product_emails: boolean
    peopleGroups: Array<{
      people_group_id: number
      consented_at: string | null
    }>
  }
}

// Fetch subscriber profile using new profile API
const { data, pending, error, refresh } = await useFetch<ProfileResponse>(`/api/profile/${profileId}`)

// Global form state (name, email)
const globalForm = ref({
  name: '',
  email: '',
  email_verified: true
})

// Consent form state
const consentForm = ref({
  doxa_general: false,
  product_emails: true,
  people_group_ids: [] as number[]
})

// Per-reminder form state, keyed by reminder id (all reminders are editable at once)
interface ReminderFormState {
  frequency: string
  days_of_week: number[]
  time_preference: string
  timezone: string
  prayer_duration: number
}
const reminderForms = ref<Record<number, ReminderFormState>>({})

// Flat list of reminders across all people groups
const allReminders = computed(() =>
  (data.value?.peopleGroups || []).flatMap(peopleGroup =>
    peopleGroup.reminders.map(reminder => ({ reminder, peopleGroup }))
  )
)

const savingGlobal = ref(false)
const savingReminder = ref<number | null>(null)
const saveSuccess = ref(false)
const saveError = ref('')
const successMessage = ref('')

// Initialize global form and consent form with data
watch(data, (newData) => {
  if (newData?.subscriber) {
    globalForm.value = {
      name: newData.subscriber.name,
      email: newData.subscriber.email,
      email_verified: newData.subscriber.email_verified
    }
  }
  if (newData?.consents) {
    consentForm.value = {
      doxa_general: newData.consents.doxa_general || false,
      product_emails: newData.consents.product_emails ?? true,
      people_group_ids: (newData.consents.peopleGroups || []).map((c: any) => c.people_group_id)
    }
  }
  const forms: Record<number, ReminderFormState> = {}
  for (const peopleGroup of newData?.peopleGroups || []) {
    for (const reminder of peopleGroup.reminders) {
      forms[reminder.id] = {
        frequency: reminder.frequency,
        days_of_week: [...(reminder.days_of_week || [])],
        time_preference: reminder.time_preference,
        timezone: reminder.timezone,
        prayer_duration: reminder.prayer_duration
      }
    }
  }
  reminderForms.value = forms
}, { immediate: true })

// Frequency options
const frequencyOptions = computed(() => [
  { value: 'daily', label: t('campaign.signup.form.frequency.daily') },
  { value: 'weekly', label: t('campaign.signup.form.frequency.weekly') }
])

// Prayer duration options
const durationOptions = computed(() => [
  { value: 5, label: t('campaign.signup.form.duration.5min') },
  { value: 10, label: t('campaign.signup.form.duration.10min') },
  { value: 15, label: t('campaign.signup.form.duration.15min') },
  { value: 30, label: t('campaign.signup.form.duration.30min') },
  { value: 60, label: t('campaign.signup.form.duration.60min') }
])

// Days of week
const translatedDaysOfWeek = computed(() => [
  { value: 0, label: t('campaign.signup.form.daysOfWeek.days.sun') },
  { value: 1, label: t('campaign.signup.form.daysOfWeek.days.mon') },
  { value: 2, label: t('campaign.signup.form.daysOfWeek.days.tue') },
  { value: 3, label: t('campaign.signup.form.daysOfWeek.days.wed') },
  { value: 4, label: t('campaign.signup.form.daysOfWeek.days.thu') },
  { value: 5, label: t('campaign.signup.form.daysOfWeek.days.fri') },
  { value: 6, label: t('campaign.signup.form.daysOfWeek.days.sat') }
])

// Timezone options
const timezoneOptions = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'America/Phoenix', 'America/Toronto', 'America/Vancouver',
  'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago',
  'America/Buenos_Aires', 'America/Sao_Paulo', 'Europe/London', 'Europe/Dublin',
  'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Warsaw',
  'Europe/Prague', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Helsinki',
  'Europe/Athens', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Manila', 'Asia/Jakarta',
  'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu', 'Australia/Sydney',
  'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'UTC'
]

function toggleDayOfWeek(reminderId: number, day: number) {
  const form = reminderForms.value[reminderId]
  if (!form) return
  const index = form.days_of_week.indexOf(day)
  if (index === -1) {
    form.days_of_week.push(day)
  } else {
    form.days_of_week.splice(index, 1)
  }
}

async function saveGlobalSettings() {
  savingGlobal.value = true
  saveSuccess.value = false
  saveError.value = ''

  try {
    const response = await $fetch<{
      success: boolean
      email_changed: boolean
      subscriber: { id: number; profile_id: string; name: string; email: string; email_verified: boolean }
      consents: { doxa_general: boolean; people_group_ids: number[] }
    }>(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: {
        name: globalForm.value.name,
        email: globalForm.value.email
      }
    })

    if (response.subscriber) {
      globalForm.value.email_verified = response.subscriber.email_verified
    }

    if (response.email_changed) {
      successMessage.value = t('campaign.profile.emailChanged')
    } else {
      successMessage.value = t('campaign.profile.success')
    }
    saveSuccess.value = true

    toast.add({ title: successMessage.value, color: 'success' })

    setTimeout(() => { saveSuccess.value = false }, 5000)
  } catch (err: any) {
    saveError.value = err.data?.statusMessage || err.message || t('campaign.profile.error.failed')
  } finally {
    savingGlobal.value = false
  }
}

async function saveReminder(reminder: any, pgGroup: any) {
  const form = reminderForms.value[reminder.id]
  if (!form) return

  if (form.frequency === 'weekly' && form.days_of_week.length === 0) {
    saveError.value = t('campaign.signup.form.daysOfWeek.error')
    return
  }

  savingReminder.value = reminder.id
  saveSuccess.value = false
  saveError.value = ''

  try {
    await $fetch(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: {
        subscription_id: reminder.id,
        frequency: form.frequency,
        days_of_week: form.days_of_week,
        time_preference: form.time_preference,
        timezone: form.timezone,
        prayer_duration: form.prayer_duration
      }
    })

    successMessage.value = t('campaign.profile.success')
    saveSuccess.value = true

    toast.add({ title: successMessage.value, color: 'success' })

    await refresh()

    setTimeout(() => { saveSuccess.value = false }, 5000)
  } catch (err: any) {
    saveError.value = err.data?.statusMessage || err.message || t('campaign.profile.error.failed')
  } finally {
    savingReminder.value = null
  }
}

async function confirmDeleteReminder(reminder: any, pgGroup: any) {
  if (!confirm(t('campaign.profile.deleteReminderConfirm'))) {
    return
  }

  try {
    await $fetch(`/api/people-groups/${pgGroup.slug}/reminder/${reminder.id}`, {
      method: 'DELETE',
      query: { id: profileId }
    })

    toast.add({
      title: t('campaign.profile.deleteReminderSuccess'),
      color: 'success'
    })

    await refresh()
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage || t('campaign.profile.error.failed'),
      color: 'error'
    })
  }
}

async function resubscribeReminder(reminder: any, pgGroup: any) {
  try {
    await $fetch(`/api/people-groups/${pgGroup.slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: profileId, subscription_id: reminder.id }
    })

    toast.add({
      title: t('campaign.profile.resubscribeSuccess'),
      color: 'success'
    })

    await refresh()
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage || t('campaign.profile.error.failed'),
      color: 'error'
    })
  }
}

// Check if a people group is consented
function isPeopleGroupConsented(peopleGroupId: number): boolean {
  return consentForm.value.people_group_ids.includes(peopleGroupId)
}

// Update Doxa general consent
async function updateDoxaConsent(granted: boolean) {
  try {
    await $fetch(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: {
        consent_doxa_general: granted
      }
    })

    toast.add({
      title: t('campaign.profile.consentUpdated'),
      color: 'success'
    })
  } catch (err: any) {
    // Revert on error
    consentForm.value.doxa_general = !granted
    toast.add({
      title: err.data?.statusMessage || t('campaign.profile.error.failed'),
      color: 'error'
    })
  }
}

// Update product/feedback emails consent
async function updateProductConsent(granted: boolean) {
  try {
    await $fetch(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: {
        consent_product_emails: granted
      }
    })

    toast.add({
      title: t('campaign.profile.consentUpdated'),
      color: 'success'
    })
  } catch (err: any) {
    // Revert on error
    consentForm.value.product_emails = !granted
    toast.add({
      title: err.data?.statusMessage || t('campaign.profile.error.failed'),
      color: 'error'
    })
  }
}

// Update people group-specific consent
async function updatePeopleGroupConsent(peopleGroupId: number, peopleGroupSlug: string, granted: boolean) {
  try {
    await $fetch(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: {
        consent_people_group_id: peopleGroupId,
        consent_people_group_updates: granted
      }
    })

    // Update local state
    if (granted) {
      if (!consentForm.value.people_group_ids.includes(peopleGroupId)) {
        consentForm.value.people_group_ids.push(peopleGroupId)
      }
    } else {
      consentForm.value.people_group_ids = consentForm.value.people_group_ids.filter(id => id !== peopleGroupId)
    }

    toast.add({
      title: t('campaign.profile.consentUpdated'),
      color: 'success'
    })
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage || t('campaign.profile.error.failed'),
      color: 'error'
    })
  }
}

useHead({
  title: t('campaign.profile.pageTitle')
})
</script>

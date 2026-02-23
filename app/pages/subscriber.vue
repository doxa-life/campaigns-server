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

      <!-- Subscriptions (grouped by people group) -->
      <div class="space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="w-5 h-5" />
          {{ $t('campaign.profile.subscriptions') }}
        </h2>

        <div v-for="pgGroup in data.peopleGroups" :key="pgGroup.id">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ pgGroup.title }}</span>
                  <UBadge
                    v-if="pgGroup.reminders.length > 1"
                    color="neutral"
                    size="xs"
                  >
                    {{ pgGroup.reminders.length }} {{ $t('campaign.profile.reminders') }}
                  </UBadge>
                </div>
                <NuxtLink
                  :to="localePath(`/${pgGroup.slug}`)"
                  class="text-xs text-[var(--ui-text-muted)] hover:underline"
                >
                  {{ $t('campaign.profile.viewCampaign') }}
                </NuxtLink>
              </div>
            </template>

            <!-- Reminders list -->
            <div class="space-y-4">
              <div
                v-for="(reminder, index) in pgGroup.reminders"
                :key="reminder.id"
                class="p-4 border border-[var(--ui-border)] rounded-lg"
                :class="{ 'opacity-60': reminder.status === 'unsubscribed' }"
              >
                <!-- Reminder header -->
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{{ $t('campaign.profile.reminder') }} {{ index + 1 }}</span>
                    <UBadge
                      v-if="reminder.status === 'unsubscribed'"
                      color="neutral"
                      size="xs"
                    >
                      {{ $t('campaign.profile.unsubscribed') }}
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-1">
                    <UButton
                      v-if="editingReminder !== reminder.id"
                      variant="ghost"
                      size="xs"
                      @click="startEditingReminder(reminder, pgGroup)"
                    >
                      <UIcon name="i-lucide-pencil" class="w-4 h-4" />
                    </UButton>
                    <UButton
                      v-if="reminder.status === 'active' && editingReminder !== reminder.id"
                      variant="ghost"
                      color="error"
                      size="xs"
                      @click="confirmDeleteReminder(reminder, pgGroup)"
                    >
                      <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
                    </UButton>
                  </div>
                </div>

                <!-- View Mode -->
                <div v-if="editingReminder !== reminder.id" class="text-sm space-y-2">
                  <div class="flex justify-between">
                    <span class="text-[var(--ui-text-muted)]">{{ $t('campaign.signup.form.frequency.label') }}:</span>
                    <span>{{ reminder.frequency === 'daily' ? $t('campaign.signup.form.frequency.daily') : $t('campaign.signup.form.frequency.weekly') }}</span>
                  </div>
                  <div v-if="reminder.frequency === 'weekly'" class="flex justify-between">
                    <span class="text-[var(--ui-text-muted)]">{{ $t('campaign.signup.form.daysOfWeek.label') }}:</span>
                    <span>{{ formatDaysOfWeek(reminder.days_of_week) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-[var(--ui-text-muted)]">{{ $t('campaign.signup.form.time.label') }}:</span>
                    <span>{{ reminder.time_preference }} ({{ reminder.timezone }})</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-[var(--ui-text-muted)]">{{ $t('campaign.signup.form.duration.label') }}:</span>
                    <span>{{ reminder.prayer_duration }} {{ $t('common.minutes') }}</span>
                  </div>

                  <!-- Resubscribe button for unsubscribed reminders -->
                  <div v-if="reminder.status === 'unsubscribed'" class="pt-2">
                    <UButton
                      variant="outline"
                      size="xs"
                      @click="resubscribeReminder(reminder, pgGroup)"
                    >
                      {{ $t('campaign.profile.resubscribeButton') }}
                    </UButton>
                  </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="space-y-4">
                  <UFormField :label="$t('campaign.signup.form.frequency.label')">
                    <USelect
                      v-model="reminderForm.frequency"
                      :items="frequencyOptions"
                      required
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField v-if="reminderForm.frequency === 'weekly'" :label="$t('campaign.signup.form.daysOfWeek.label')">
                    <div class="grid grid-cols-7 gap-1 w-full">
                      <label
                        v-for="day in translatedDaysOfWeek"
                        :key="day.value"
                        class="flex flex-col items-center gap-1 p-2 border border-[var(--ui-border)] rounded-lg cursor-pointer transition-colors hover:bg-[var(--ui-bg-elevated)]"
                        :class="{ 'border-[var(--ui-primary)] bg-[var(--ui-bg-elevated)]': reminderForm.days_of_week.includes(day.value) }"
                      >
                        <UCheckbox
                          :model-value="reminderForm.days_of_week.includes(day.value)"
                          @update:model-value="toggleDayOfWeek(day.value)"
                        />
                        <span class="text-xs font-medium">{{ day.label }}</span>
                      </label>
                    </div>
                  </UFormField>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <UFormField :label="$t('campaign.signup.form.time.label')">
                      <UInput
                        v-model="reminderForm.time_preference"
                        type="time"
                        required
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField :label="$t('campaign.signup.form.timezone.label')">
                      <USelectMenu
                        v-model="reminderForm.timezone"
                        :items="timezoneOptions"
                        :search-input="{ placeholder: $t('campaign.signup.form.timezone.searchPlaceholder') }"
                        class="w-full"
                      />
                    </UFormField>
                  </div>

                  <UFormField :label="$t('campaign.signup.form.duration.label')">
                    <USelect
                      v-model="reminderForm.prayer_duration"
                      :items="durationOptions"
                      required
                      class="w-full"
                    />
                  </UFormField>

                  <div class="flex items-center justify-between pt-2">
                    <UButton
                      variant="ghost"
                      size="sm"
                      @click="cancelEditingReminder"
                    >
                      {{ $t('common.cancel') }}
                    </UButton>
                    <UButton
                      @click="saveReminder(reminder, pgGroup)"
                      :loading="savingReminder === reminder.id"
                      size="sm"
                    >
                      {{ $t('campaign.profile.save') }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>
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
    }>
  }>
  consents: {
    doxa_general: boolean
    doxa_general_at: string | null
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
  people_group_ids: [] as number[]
})

// Reminder form state (for editing individual reminders)
const reminderForm = ref({
  frequency: 'daily',
  days_of_week: [] as number[],
  time_preference: '09:00',
  timezone: 'UTC',
  prayer_duration: 10
})

// Edit state
const editingReminder = ref<number | null>(null)
const editingPeopleGroupSlug = ref<string | null>(null)
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
      people_group_ids: (newData.consents.peopleGroups || []).map((c: any) => c.people_group_id)
    }
  }
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

function toggleDayOfWeek(day: number) {
  const index = reminderForm.value.days_of_week.indexOf(day)
  if (index === -1) {
    reminderForm.value.days_of_week.push(day)
  } else {
    reminderForm.value.days_of_week.splice(index, 1)
  }
}

function formatDaysOfWeek(days: number[]) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days.map(d => dayNames[d]).join(', ')
}

function startEditingReminder(reminder: any, pgGroup: any) {
  editingReminder.value = reminder.id
  editingPeopleGroupSlug.value = pgGroup.slug
  reminderForm.value = {
    frequency: reminder.frequency,
    days_of_week: reminder.days_of_week || [],
    time_preference: reminder.time_preference,
    timezone: reminder.timezone,
    prayer_duration: reminder.prayer_duration
  }
}

function cancelEditingReminder() {
  editingReminder.value = null
  editingPeopleGroupSlug.value = null
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
  if (reminderForm.value.frequency === 'weekly' && reminderForm.value.days_of_week.length === 0) {
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
        frequency: reminderForm.value.frequency,
        days_of_week: reminderForm.value.days_of_week,
        time_preference: reminderForm.value.time_preference,
        timezone: reminderForm.value.timezone,
        prayer_duration: reminderForm.value.prayer_duration
      }
    })

    successMessage.value = t('campaign.profile.success')
    saveSuccess.value = true
    editingReminder.value = null
    editingPeopleGroupSlug.value = null

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

<template>
  <div class="min-h-[calc(100vh-200px)] py-8 px-4">
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <div class="text-center">
        <UIcon name="i-lucide-loader" class="w-10 h-10 animate-spin mb-4" />
        <p>{{ $t('campaign.unsubscribe.processing') }}</p>
      </div>
    </div>

    <div v-else-if="loadError" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-alert-circle" class="w-16 h-16 mx-auto mb-4 text-red-500" />
        <h1 class="text-2xl font-bold mb-4">{{ $t('campaign.unsubscribe.error.title') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">
          {{ loadError }}
        </p>
        <UButton :to="localePath('/')">
          {{ $t('campaign.unsubscribe.error.goHome') }}
        </UButton>
      </UCard>
    </div>

    <!-- Confirm step (issue #69): the opt-out fires only on this explicit click,
         never on GET load, so email scanners/prefetchers can't silently unsubscribe. -->
    <div v-else-if="!performed" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-mail-x" class="w-12 h-12 mx-auto mb-4 text-[var(--ui-text-muted)]" />
        <h1 class="text-2xl font-bold mb-2">{{ $t('campaign.unsubscribe.confirm.title') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">{{ confirmPrompt }}</p>
        <UButton
          color="error"
          size="lg"
          :loading="performing"
          @click="confirmUnsubscribe"
        >
          {{ performing ? $t('campaign.unsubscribe.confirm.processing') : $t('campaign.unsubscribe.confirm.button') }}
        </UButton>
      </UCard>
    </div>

    <!-- Doxa General / People-group marketing / Product email preferences view -->
    <div v-else-if="(isDoxaType || isPeopleGroupMarketing || isProductType) && profileData" class="max-w-2xl mx-auto">
      <UCard class="mb-6 text-center">
        <UIcon name="i-lucide-check-circle" class="w-12 h-12 mx-auto mb-4 text-green-500" />
        <h1 class="text-2xl font-bold mb-2">{{ $t('campaign.unsubscribe.success.title') }}</h1>
        <p class="text-[var(--ui-text)]">
          <template v-if="linkTarget">
            {{ $t('campaign.unsubscribe.unsubscribedFrom', { item: linkTargetLabel }) }}
          </template>
          <template v-else>
            {{ $t('campaign.unsubscribe.preferencesUpdated') }}
          </template>
        </p>
        <p v-if="linkTarget" class="text-sm text-[var(--ui-text-muted)] mt-2">
          {{ $t('campaign.unsubscribe.remindersUnaffected') }}
        </p>
      </UCard>

      <!-- Communication Preferences for Doxa -->
      <div class="mt-6">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-mail" class="w-5 h-5" />
          {{ $t('campaign.profile.sections.emailPreferences') }}
        </h2>

        <UCard>
          <div class="space-y-4">
            <p class="text-sm text-[var(--ui-text-muted)]">
              {{ $t('campaign.profile.emailPreferences.description') }}
            </p>

            <!-- Doxa General Consent -->
            <div
              class="flex items-center justify-between py-2 border-b border-[var(--ui-border)] transition-colors"
              :class="{ 'bg-[var(--ui-bg-elevated)] ring-1 ring-amber-400/60 -mx-3 px-3 rounded-md border-transparent': linkTarget === 'doxa' }"
            >
              <div>
                <p class="text-sm font-medium flex items-center gap-2">
                  {{ $t('campaign.profile.emailPreferences.doxaGeneral') }}
                  <UBadge v-if="justUnsubscribed === 'doxa'" color="warning" variant="solid" size="md">
                    {{ $t('campaign.unsubscribe.justTurnedOff') }}
                  </UBadge>
                </p>
                <p class="text-sm text-[var(--ui-text-muted)]">{{ $t('campaign.profile.emailPreferences.doxaGeneralHint') }}</p>
              </div>
              <USwitch
                v-model="doxaConsentForm.doxa_general"
                @update:model-value="updateDoxaConsentDirect"
              />
            </div>

            <!-- Product / feedback emails -->
            <div
              class="flex items-center justify-between py-2 border-b border-[var(--ui-border)] transition-colors"
              :class="{ 'bg-[var(--ui-bg-elevated)] ring-1 ring-amber-400/60 -mx-3 px-3 rounded-md border-transparent': linkTarget === 'product' }"
            >
              <div>
                <p class="text-sm font-medium flex items-center gap-2">
                  {{ $t('campaign.profile.emailPreferences.productEmails') }}
                  <UBadge v-if="justUnsubscribed === 'product'" color="warning" variant="solid" size="md">
                    {{ $t('campaign.unsubscribe.justTurnedOff') }}
                  </UBadge>
                </p>
                <p class="text-sm text-[var(--ui-text-muted)]">{{ $t('campaign.profile.emailPreferences.productEmailsHint') }}</p>
              </div>
              <USwitch
                v-model="doxaConsentForm.product_emails"
                @update:model-value="updateProductConsentDirect"
              />
            </div>

            <!-- People group-specific consents -->
            <div
              v-for="pg in profileData.peopleGroups"
              :key="'consent-' + pg.id"
              class="flex items-center justify-between py-2"
            >
              <p class="text-sm">{{ $t('campaign.profile.emailPreferences.campaignUpdates', { campaign: pg.title }) }}</p>
              <USwitch
                :model-value="isDoxaPeopleGroupConsented(pg.id)"
                @update:model-value="(val: boolean) => updateDoxaPeopleGroupConsent(pg.id, val)"
              />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Subscriptions for Doxa view -->
      <div v-if="doxaLocalPeopleGroups.length > 0" class="mt-6">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="w-5 h-5" />
          {{ $t('campaign.unsubscribe.yourSubscriptions') }}
        </h2>

        <div class="space-y-4">
          <UCard v-for="pg in doxaLocalPeopleGroups" :key="'sub-' + pg.id">
            <template #header>
              <div class="flex items-center justify-between">
                <span class="font-medium">{{ pg.title }}</span>
                <UBadge color="neutral" size="md">
                  {{ doxaActiveRemindersCount(pg) }} {{ $t('campaign.unsubscribe.active') }}
                </UBadge>
              </div>
            </template>

            <div class="space-y-2">
              <div
                v-for="reminder in pg.reminders"
                :key="reminder.id"
                class="flex items-center justify-between p-3 border border-[var(--ui-border)] rounded-lg"
                :class="{ 'opacity-60': reminder.status === 'unsubscribed' }"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm">{{ formatReminderSchedule(reminder) }}</span>
                  <UBadge v-if="reminder.status === 'unsubscribed'" color="neutral" size="md">
                    {{ $t('campaign.profile.unsubscribed') }}
                  </UBadge>
                </div>
                <UButton
                  v-if="reminder.status === 'active'"
                  size="md"
                  variant="ghost"
                  color="error"
                  :loading="doxaUnsubscribingId === reminder.id"
                  @click="doxaUnsubscribeFromReminder(pg.slug, pg.id, reminder.id)"
                >
                  {{ $t('campaign.unsubscribe.unsubscribeButton') }}
                </UButton>
                <UButton
                  v-else
                  size="md"
                  variant="ghost"
                  :loading="doxaResubscribingId === reminder.id"
                  @click="doxaResubscribeReminder(pg.slug, reminder.id)"
                >
                  {{ $t('campaign.profile.resubscribeButton') }}
                </UButton>
              </div>
            </div>

            <!-- Unsubscribe from entire people group -->
            <div v-if="doxaActiveRemindersCount(pg) > 1" class="mt-4 pt-4 border-t border-[var(--ui-border)]">
              <UButton
                variant="outline"
                color="error"
                size="md"
                :loading="doxaUnsubscribingFromPeopleGroupId === pg.id"
                @click="doxaUnsubscribeFromEntirePeopleGroup(pg)"
                class="w-full"
              >
                {{ $t('campaign.unsubscribe.unsubscribeFromAll', { campaign: pg.title }) }}
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </div>

    <!-- Resubscribed successfully -->
    <div v-else-if="resubscribed && data" class="flex items-center justify-center min-h-[50vh]">
      <UCard class="max-w-md w-full text-center">
        <UIcon name="i-lucide-check-circle" class="w-16 h-16 mx-auto mb-4 text-green-500" />
        <h1 class="text-2xl font-bold mb-4">{{ $t('campaign.unsubscribe.resubscribed.title') }}</h1>
        <p class="text-[var(--ui-text-muted)] mb-6">
          {{ $t('campaign.unsubscribe.resubscribed.message') }}
        </p>
        <UButton :to="localePath(`/${data?.people_group?.slug}`)">
          {{ $t('campaign.unsubscribe.resubscribed.viewCampaign') }}
        </UButton>
      </UCard>
    </div>

    <!-- Main unsubscribe content -->
    <div v-else-if="data" class="max-w-2xl mx-auto">
      <!-- Success message -->
      <UCard class="mb-6 text-center">
        <UIcon name="i-lucide-check-circle" class="w-12 h-12 mx-auto mb-4 text-green-500" />
        <h1 class="text-2xl font-bold mb-2">
          {{ data.already_unsubscribed ? $t('campaign.unsubscribe.alreadyDone.title') : $t('campaign.unsubscribe.success.title') }}
        </h1>
        <p class="text-[var(--ui-text-muted)]">
          {{ data.unsubscribed_from_people_group
            ? $t('campaign.unsubscribe.unsubscribedFromCampaign', { campaign: data.people_group.title })
            : data.already_unsubscribed
              ? $t('campaign.unsubscribe.alreadyDone.message')
              : $t('campaign.unsubscribe.success.message')
          }}
        </p>

        <!-- Show unsubscribed reminder details -->
        <div v-if="data.unsubscribed_reminder && !data.unsubscribed_from_people_group" class="mt-4 p-3 bg-[var(--ui-bg-elevated)] rounded-lg text-sm">
          <p class="font-medium">{{ data.people_group.title }} - {{ formatReminderSchedule(data.unsubscribed_reminder) }}</p>
        </div>

        <!-- Resubscribe button -->
        <div class="mt-6">
          <UButton @click="resubscribe" :loading="resubscribing" variant="outline">
            {{ resubscribing ? $t('campaign.unsubscribe.success.resubscribing') : $t('campaign.unsubscribe.success.resubscribe') }}
          </UButton>
        </div>
      </UCard>

      <!-- All Subscriptions -->
      <div v-if="allPeopleGroups.length > 0">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="w-5 h-5" />
          {{ $t('campaign.unsubscribe.yourSubscriptions') }}
        </h2>

        <div class="space-y-4">
          <UCard v-for="pg in allPeopleGroups" :key="pg.id">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ pg.title }}</span>
                  <UBadge v-if="pg.id === data.people_group.id" color="primary" size="md">{{ $t('campaign.unsubscribe.current') }}</UBadge>
                </div>
                <UBadge color="neutral" size="md">
                  {{ activeRemindersCount(pg) }} {{ $t('campaign.unsubscribe.active') }}
                </UBadge>
              </div>
            </template>

            <div class="space-y-2">
              <div
                v-for="reminder in pg.reminders"
                :key="reminder.id"
                class="flex items-center justify-between p-3 border border-[var(--ui-border)] rounded-lg"
                :class="{ 'opacity-60': reminder.status === 'unsubscribed' }"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm">{{ formatReminderSchedule(reminder) }}</span>
                  <UBadge v-if="reminder.status === 'unsubscribed'" color="neutral" size="md">
                    {{ $t('campaign.profile.unsubscribed') }}
                  </UBadge>
                </div>
                <UButton
                  v-if="reminder.status === 'active'"
                  size="md"
                  variant="ghost"
                  color="error"
                  :loading="unsubscribingId === reminder.id"
                  @click="unsubscribeFromReminder(pg.slug, pg.id, reminder.id)"
                >
                  {{ $t('campaign.unsubscribe.unsubscribeButton') }}
                </UButton>
                <UButton
                  v-else
                  size="md"
                  variant="ghost"
                  :loading="resubscribingId === reminder.id"
                  @click="resubscribeReminder(pg.slug, reminder.id)"
                >
                  {{ $t('campaign.profile.resubscribeButton') }}
                </UButton>
              </div>
            </div>

            <!-- Unsubscribe from entire people group -->
            <div v-if="activeRemindersCount(pg) > 1" class="mt-4 pt-4 border-t border-[var(--ui-border)]">
              <UButton
                variant="outline"
                color="error"
                size="md"
                :loading="unsubscribingFromPeopleGroupId === pg.id"
                @click="unsubscribeFromEntirePeopleGroup(pg)"
                class="w-full"
              >
                {{ $t('campaign.unsubscribe.unsubscribeFromAll', { campaign: pg.title }) }}
              </UButton>
            </div>
          </UCard>
        </div>
      </div>

      <!-- No subscriptions message -->
      <div v-else class="text-center text-[var(--ui-text-muted)] mt-6">
        <p>{{ $t('campaign.unsubscribe.noActiveSubscriptions') }}</p>
      </div>

      <!-- Communication Preferences -->
      <div v-if="profileData?.consents" class="mt-6">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-mail" class="w-5 h-5" />
          {{ $t('campaign.profile.sections.emailPreferences') }}
        </h2>

        <UCard>
          <div class="space-y-4">
            <p class="text-sm text-[var(--ui-text-muted)]">
              {{ $t('campaign.profile.emailPreferences.description') }}
            </p>

            <!-- Doxa General Consent -->
            <div class="flex items-center justify-between py-2 border-b border-[var(--ui-border)]">
              <div>
                <p class="text-sm font-medium">{{ $t('campaign.profile.emailPreferences.doxaGeneral') }}</p>
                <p class="text-sm text-[var(--ui-text-muted)]">{{ $t('campaign.profile.emailPreferences.doxaGeneralHint') }}</p>
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
                <p class="text-sm text-[var(--ui-text-muted)]">{{ $t('campaign.profile.emailPreferences.productEmailsHint') }}</p>
              </div>
              <USwitch
                v-model="consentForm.product_emails"
                @update:model-value="updateProductConsent"
              />
            </div>

            <!-- People group-specific consents -->
            <div
              v-for="pg in allPeopleGroups"
              :key="'consent-' + pg.id"
              class="flex items-center justify-between py-2"
            >
              <p class="text-sm">{{ $t('campaign.profile.emailPreferences.campaignUpdates', { campaign: pg.title }) }}</p>
              <USwitch
                :model-value="isPeopleGroupConsented(pg.id)"
                @update:model-value="(val: boolean) => updatePeopleGroupConsent(pg.id, pg.slug, val)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

interface Reminder {
  id: number
  frequency: string
  days_of_week: number[]
  time_preference: string
  timezone: string
  status: 'active' | 'unsubscribed'
}

interface PeopleGroupWithReminders {
  id: number
  title: string
  slug: string
  reminders: Reminder[]
}

interface UnsubscribeData {
  success: boolean
  message: string
  already_unsubscribed: boolean
  unsubscribed_from_people_group: boolean
  people_group: {
    id: number
    title: string
    slug: string
  }
  unsubscribed_reminder: Reminder | null
  other_reminders_in_people_group: Reminder[]
  other_people_groups: PeopleGroupWithReminders[]
}

interface ProfileData {
  subscriber: {
    id: number
    profile_id: string
    name: string
    email: string
    email_verified: boolean
  }
  peopleGroups: PeopleGroupWithReminders[]
  consents: {
    doxa_general: boolean
    doxa_general_at: string | null
    product_emails: boolean
    peopleGroups: Array<{ people_group_id: number; consented_at: string | null }>
  }
}

const route = useRoute()
const slug = route.query.slug as string
const profileId = route.query.id as string
const subscriptionId = route.query.sid as string | undefined
const unsubscribeType = route.query.type as string | undefined
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

// Determine if this is a Doxa-type unsubscribe
const isDoxaType = computed(() => unsubscribeType === 'doxa' || (!slug && !unsubscribeType))

// A people-group MARKETING unsubscribe (from a marketing email). This targets the
// people-group communication consent — NOT the daily prayer reminder subscriptions,
// which is what a `slug`-only link (from reminder emails) does.
const isPeopleGroupMarketing = computed(() => unsubscribeType === 'people_group' && !!slug)

// A product/feedback email unsubscribe (surveys, evaluations) sent to active
// subscribers. Targets only the product-emails consent — leaves prayer reminders
// and the marketing consents untouched.
const isProductType = computed(() => unsubscribeType === 'product')

// Set when this visit actually flipped a preference off — drives the "Just turned
// off" badge. Stays null if the preference was already off.
const justUnsubscribed = ref<'product' | 'doxa' | 'people_group' | null>(null)

// What this link controls, regardless of prior state — so even a repeat visit
// (when the toggle was already off) still points out which preference it is.
const linkTarget = computed<'product' | 'doxa' | 'people_group' | null>(() => {
  if (isProductType.value) return 'product'
  if (isPeopleGroupMarketing.value) return 'people_group'
  if (isDoxaType.value) return 'doxa'
  return null
})
const linkTargetLabel = computed(() => {
  if (linkTarget.value === 'product') return t('campaign.profile.emailPreferences.productEmails')
  if (linkTarget.value === 'doxa') return t('campaign.profile.emailPreferences.doxaGeneral')
  if (linkTarget.value === 'people_group') return t('campaign.unsubscribe.peopleGroupUpdatesLabel')
  return ''
})

// Name of the people group this link targets (for the confirm prompt), resolved
// from the loaded profile by slug. Empty when unknown → a generic prompt is used.
const confirmGroupName = computed(() =>
  profileData.value?.peopleGroups.find(p => p.slug === slug)?.title || ''
)

// The single-CTA confirm prompt, phrased per unsubscribe type.
const confirmPrompt = computed(() => {
  if (isProductType.value) return t('campaign.unsubscribe.confirm.product')
  if (isPeopleGroupMarketing.value) {
    return confirmGroupName.value
      ? t('campaign.unsubscribe.confirm.peopleGroup', { campaign: confirmGroupName.value })
      : t('campaign.unsubscribe.confirm.peopleGroupGeneric')
  }
  if (isDoxaType.value) return t('campaign.unsubscribe.confirm.doxa')
  return confirmGroupName.value
    ? t('campaign.unsubscribe.confirm.reminders', { campaign: confirmGroupName.value })
    : t('campaign.unsubscribe.confirm.remindersGeneric')
})

// Loading and error state
const loading = ref(true)
const loadError = ref<string | null>(null)

// The opt-out is gated behind an explicit click (issue #69): GET load only reads,
// so email scanners/prefetchers that fetch the link can't silently unsubscribe.
const performed = ref(false)
const performing = ref(false)

// People group unsubscribe data
const data = ref<UnsubscribeData | null>(null)
const error = ref<any>(null)

// Profile data (for both Doxa and people group views)
const profileData = ref<ProfileData | null>(null)

// Doxa consent form
const doxaConsentForm = ref({
  doxa_general: false,
  product_emails: true,
  people_group_ids: [] as number[]
})

// Doxa local people groups for reactive updates
const doxaLocalPeopleGroups = ref<PeopleGroupWithReminders[]>([])

// Doxa-specific loading states
const doxaUnsubscribingId = ref<number | null>(null)
const doxaResubscribingId = ref<number | null>(null)
const doxaUnsubscribingFromPeopleGroupId = ref<number | null>(null)

// Load data based on type
async function loadData() {
  loading.value = true
  loadError.value = null

  try {
    if (isDoxaType.value) {
      // Read-only on load — the opt-out happens on explicit confirm (issue #69).
      const response = await $fetch<ProfileData>(`/api/profile/${profileId}`)
      profileData.value = response

      // Initialize consent form
      doxaConsentForm.value = {
        doxa_general: response.consents?.doxa_general || false,
        product_emails: response.consents?.product_emails ?? true,
        people_group_ids: (response.consents?.peopleGroups || []).map(c => c.people_group_id)
      }

      // Initialize local people groups for reactive updates
      doxaLocalPeopleGroups.value = response.peopleGroups.map(c => ({
        ...c,
        reminders: c.reminders.map(r => ({ ...r, status: r.status || 'active' as const }))
      }))
    } else if (isPeopleGroupMarketing.value) {
      // People-group MARKETING unsubscribe: removes the communication consent for
      // this people group (on confirm). Must NOT cancel the daily prayer reminders.
      const response = await $fetch<ProfileData>(`/api/profile/${profileId}`)
      profileData.value = response

      doxaConsentForm.value = {
        doxa_general: response.consents?.doxa_general || false,
        product_emails: response.consents?.product_emails ?? true,
        people_group_ids: (response.consents?.peopleGroups || []).map(c => c.people_group_id)
      }
      doxaLocalPeopleGroups.value = response.peopleGroups.map(c => ({
        ...c,
        reminders: c.reminders.map(r => ({ ...r, status: r.status || 'active' as const }))
      }))
    } else if (isProductType.value) {
      // Product/feedback email opt-out (on confirm): turns off the product-emails
      // consent only. Leaves prayer reminders and the marketing consents untouched.
      const response = await $fetch<ProfileData>(`/api/profile/${profileId}`)
      profileData.value = response

      doxaConsentForm.value = {
        doxa_general: response.consents?.doxa_general || false,
        product_emails: response.consents?.product_emails ?? true,
        people_group_ids: (response.consents?.peopleGroups || []).map(c => c.people_group_id)
      }
      doxaLocalPeopleGroups.value = response.peopleGroups.map(c => ({
        ...c,
        reminders: c.reminders.map(r => ({ ...r, status: r.status || 'active' as const }))
      }))
    } else if (slug) {
      // Prayer-reminder unsubscribe. Read-only on load — the unsubscribe call
      // (which mutates) only runs on explicit confirm (issue #69).
      const profData = await $fetch<ProfileData>(`/api/profile/${profileId}`)
      profileData.value = profData

      // Initialize consent form
      if (profData?.consents) {
        consentForm.value = {
          doxa_general: profData.consents.doxa_general || false,
          product_emails: profData.consents.product_emails ?? true,
          people_group_ids: (profData.consents.peopleGroups || []).map((c: any) => c.people_group_id)
        }
      }
    } else {
      loadError.value = 'Invalid unsubscribe link. Missing required parameters.'
    }
  } catch (err: any) {
    loadError.value = err.data?.statusMessage || 'Failed to process unsubscribe request'
    error.value = err
  } finally {
    loading.value = false
  }
}

// Initialize on mount
onMounted(() => {
  loadData()
})

// Perform the opt-out. Only ever called from the confirm button click — never on
// load — so the mutation requires a deliberate human action (issue #69).
async function confirmUnsubscribe() {
  performing.value = true
  try {
    if (isProductType.value) {
      await $fetch(`/api/profile/${profileId}`, {
        method: 'PUT',
        body: { consent_product_emails: false }
      })
      doxaConsentForm.value.product_emails = false
      justUnsubscribed.value = 'product'
    } else if (isPeopleGroupMarketing.value) {
      // Slug is resolved to the people group server-side, so this works even if the
      // subscriber has no prayer subscription for it.
      const upd = await $fetch<{ consents?: { doxa_general: boolean; people_group_ids: number[] } }>(`/api/profile/${profileId}`, {
        method: 'PUT',
        body: { consent_people_group_slug: slug, consent_people_group_updates: false }
      })
      doxaConsentForm.value.people_group_ids = upd.consents?.people_group_ids || []
      justUnsubscribed.value = 'people_group'
    } else if (isDoxaType.value) {
      await $fetch(`/api/profile/${profileId}`, {
        method: 'PUT',
        body: { consent_doxa_general: false }
      })
      doxaConsentForm.value.doxa_general = false
      justUnsubscribed.value = 'doxa'
    } else if (slug) {
      data.value = await $fetch<UnsubscribeData>(`/api/people-groups/${slug}/unsubscribe`, {
        query: { id: profileId, sid: subscriptionId }
      })
    }
    performed.value = true
  } catch (err: any) {
    toast.add({
      title: t('campaign.unsubscribe.error.title'),
      description: t('campaign.unsubscribe.error.message'),
      color: 'error'
    })
  } finally {
    performing.value = false
  }
}

// Consent form state for people group view
const consentForm = ref({
  doxa_general: false,
  product_emails: true,
  people_group_ids: [] as number[]
})

// State
const resubscribing = ref(false)
const resubscribed = ref(false)
const unsubscribingId = ref<number | null>(null)
const unsubscribingFromPeopleGroupId = ref<number | null>(null)
const resubscribingId = ref<number | null>(null)

// Local reactive copy of people groups for UI updates
const localPeopleGroups = ref<PeopleGroupWithReminders[]>([])

// Initialize local people groups when data loads
watch(data, (newData) => {
  if (newData) {
    const groups: PeopleGroupWithReminders[] = []

    // Add current people group if it has reminders
    if (newData.other_reminders_in_people_group && newData.other_reminders_in_people_group.length > 0) {
      groups.push({
        id: newData.people_group.id,
        title: newData.people_group.title,
        slug: newData.people_group.slug,
        reminders: newData.other_reminders_in_people_group.map(r => ({ ...r, status: r.status || 'active' as const }))
      })
    }

    // Add other people groups
    if (newData.other_people_groups) {
      groups.push(...newData.other_people_groups.map(c => ({
        ...c,
        reminders: c.reminders.map(r => ({ ...r, status: r.status || 'active' as const }))
      })))
    }

    localPeopleGroups.value = groups
  }
}, { immediate: true })

// Use local people groups for display
const allPeopleGroups = computed(() => localPeopleGroups.value)

// Count active reminders in a people group
function activeRemindersCount(pg: PeopleGroupWithReminders): number {
  return pg.reminders.filter(r => r.status === 'active').length
}

// Format reminder schedule for display
function formatReminderSchedule(reminder: Reminder) {
  const time = reminder.time_preference
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  if (reminder.frequency === 'daily') {
    return t('campaign.unsubscribe.reminderFormat.daily', { time })
  } else {
    const days = reminder.days_of_week.map(d => dayNames[d]).join(', ')
    return t('campaign.unsubscribe.reminderFormat.weekly', { days, time })
  }
}

// Unsubscribe from a specific reminder
async function unsubscribeFromReminder(peopleGroupSlug: string, peopleGroupId: number, reminderId: number) {
  try {
    unsubscribingId.value = reminderId
    await $fetch(`/api/people-groups/${peopleGroupSlug}/unsubscribe`, {
      query: { id: profileId, sid: reminderId }
    })

    // Mark reminder as unsubscribed
    const pg = localPeopleGroups.value.find(c => c.id === peopleGroupId)
    if (pg) {
      const reminder = pg.reminders.find(r => r.id === reminderId)
      if (reminder) {
        reminder.status = 'unsubscribed'
      }
    }

    toast.add({ title: 'Unsubscribed', description: 'Successfully unsubscribed from this reminder', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to unsubscribe', color: 'error' })
  } finally {
    unsubscribingId.value = null
  }
}

// Unsubscribe from entire people group
async function unsubscribeFromEntirePeopleGroup(pg: PeopleGroupWithReminders) {
  try {
    unsubscribingFromPeopleGroupId.value = pg.id
    await $fetch(`/api/people-groups/${pg.slug}/unsubscribe`, {
      query: { id: profileId, all: 'true' }
    })

    // Mark all reminders as unsubscribed
    const localPg = localPeopleGroups.value.find(c => c.id === pg.id)
    if (localPg) {
      localPg.reminders.forEach(r => {
        r.status = 'unsubscribed'
      })
    }

    toast.add({ title: 'Unsubscribed', description: `Unsubscribed from all ${pg.title} reminders`, color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to unsubscribe', color: 'error' })
  } finally {
    unsubscribingFromPeopleGroupId.value = null
  }
}

// Resubscribe to a specific reminder
async function resubscribeReminder(peopleGroupSlug: string, reminderId: number) {
  try {
    resubscribingId.value = reminderId
    await $fetch(`/api/people-groups/${peopleGroupSlug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: profileId, subscription_id: reminderId }
    })

    // Mark reminder as active
    for (const pg of localPeopleGroups.value) {
      const reminder = pg.reminders.find(r => r.id === reminderId)
      if (reminder) {
        reminder.status = 'active'
        break
      }
    }

    toast.add({ title: 'Resubscribed', description: 'Successfully resubscribed to this reminder', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to resubscribe', color: 'error' })
  } finally {
    resubscribingId.value = null
  }
}

// Resubscribe to the reminder that was just unsubscribed (from the initial page load)
async function resubscribe() {
  try {
    resubscribing.value = true
    await $fetch(`/api/people-groups/${slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: profileId }
    })
    resubscribed.value = true
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to resubscribe', color: 'error' })
  } finally {
    resubscribing.value = false
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

// Update product/feedback emails consent (reminder-view form)
async function updateProductConsent(granted: boolean) {
  try {
    await $fetch(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: { consent_product_emails: granted }
    })

    toast.add({
      title: t('campaign.profile.consentUpdated'),
      color: 'success'
    })
  } catch (err: any) {
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

// Doxa-specific helper functions
function doxaActiveRemindersCount(pg: PeopleGroupWithReminders): number {
  return pg.reminders.filter(r => r.status === 'active').length
}

// Doxa unsubscribe from a specific reminder
async function doxaUnsubscribeFromReminder(peopleGroupSlug: string, peopleGroupId: number, reminderId: number) {
  try {
    doxaUnsubscribingId.value = reminderId
    await $fetch(`/api/people-groups/${peopleGroupSlug}/unsubscribe`, {
      query: { id: profileId, sid: reminderId }
    })

    // Mark reminder as unsubscribed
    const pg = doxaLocalPeopleGroups.value.find(c => c.id === peopleGroupId)
    if (pg) {
      const reminder = pg.reminders.find(r => r.id === reminderId)
      if (reminder) {
        reminder.status = 'unsubscribed'
      }
    }

    toast.add({ title: 'Unsubscribed', description: 'Successfully unsubscribed from this reminder', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to unsubscribe', color: 'error' })
  } finally {
    doxaUnsubscribingId.value = null
  }
}

// Doxa resubscribe to a specific reminder
async function doxaResubscribeReminder(peopleGroupSlug: string, reminderId: number) {
  try {
    doxaResubscribingId.value = reminderId
    await $fetch(`/api/people-groups/${peopleGroupSlug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: profileId, subscription_id: reminderId }
    })

    // Mark reminder as active
    for (const pg of doxaLocalPeopleGroups.value) {
      const reminder = pg.reminders.find(r => r.id === reminderId)
      if (reminder) {
        reminder.status = 'active'
        break
      }
    }

    toast.add({ title: 'Resubscribed', description: 'Successfully resubscribed to this reminder', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to resubscribe', color: 'error' })
  } finally {
    doxaResubscribingId.value = null
  }
}

// Doxa unsubscribe from entire people group
async function doxaUnsubscribeFromEntirePeopleGroup(pg: PeopleGroupWithReminders) {
  try {
    doxaUnsubscribingFromPeopleGroupId.value = pg.id
    await $fetch(`/api/people-groups/${pg.slug}/unsubscribe`, {
      query: { id: profileId, all: 'true' }
    })

    // Mark all reminders as unsubscribed
    const localPg = doxaLocalPeopleGroups.value.find(c => c.id === pg.id)
    if (localPg) {
      localPg.reminders.forEach(r => {
        r.status = 'unsubscribed'
      })
    }

    toast.add({ title: 'Unsubscribed', description: `Unsubscribed from all ${pg.title} reminders`, color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: 'Failed to unsubscribe', color: 'error' })
  } finally {
    doxaUnsubscribingFromPeopleGroupId.value = null
  }
}

function isDoxaPeopleGroupConsented(peopleGroupId: number): boolean {
  return doxaConsentForm.value.people_group_ids.includes(peopleGroupId)
}

async function updateDoxaConsentDirect(granted: boolean) {
  try {
    await $fetch(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: { consent_doxa_general: granted }
    })

    toast.add({
      title: t('campaign.profile.consentUpdated'),
      color: 'success'
    })
  } catch (err: any) {
    // Revert on error
    doxaConsentForm.value.doxa_general = !granted
    toast.add({
      title: err.data?.statusMessage || t('campaign.profile.error.failed'),
      color: 'error'
    })
  }
}

async function updateProductConsentDirect(granted: boolean) {
  try {
    await $fetch(`/api/profile/${profileId}`, {
      method: 'PUT',
      body: { consent_product_emails: granted }
    })

    toast.add({
      title: t('campaign.profile.consentUpdated'),
      color: 'success'
    })
  } catch (err: any) {
    doxaConsentForm.value.product_emails = !granted
    toast.add({
      title: err.data?.statusMessage || t('campaign.profile.error.failed'),
      color: 'error'
    })
  }
}

async function updateDoxaPeopleGroupConsent(peopleGroupId: number, granted: boolean) {
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
      if (!doxaConsentForm.value.people_group_ids.includes(peopleGroupId)) {
        doxaConsentForm.value.people_group_ids.push(peopleGroupId)
      }
    } else {
      doxaConsentForm.value.people_group_ids = doxaConsentForm.value.people_group_ids.filter(id => id !== peopleGroupId)
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

// Set page title
useHead({
  title: t('campaign.unsubscribe.pageTitle')
})
</script>

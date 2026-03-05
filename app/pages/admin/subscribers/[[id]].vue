<template>
  <CrmLayout :loading="loading" :error="error">
    <template #header>
      <div>
        <h1>All Subscribers</h1>
      </div>
    </template>

    <template #list-header>
      <CrmListPanel
        v-model="searchQuery"
        search-placeholder="Search by name, email, phone, contact ID, or tracking ID..."
        :total-count="filteredSubscribers.length"
      >
        <template #filters>
          <USelectMenu
            v-model="filterPeopleGroupId"
            :items="peopleGroupOptions"
            value-key="value"
            placeholder="All People Groups"
            virtualize
            class="filter-select"
          />
        </template>
      </CrmListPanel>
    </template>

    <template #list>
      <template v-if="filteredSubscribers.length === 0">
        <div class="empty-list">No subscribers found</div>
      </template>
      <CrmListItem
        v-else
        v-for="subscriber in filteredSubscribers"
        :key="subscriber.id"
        :active="selectedSubscriber?.id === subscriber.id"
        @click="selectSubscriber(subscriber)"
      >
        <div class="subscriber-name">{{ subscriber.name }}</div>
        <div class="subscriber-contact">
          {{ subscriber.primary_email || subscriber.primary_phone || 'No contact' }}
        </div>
        <div class="subscriber-meta">
          <UBadge
            v-for="(count, groupName) in getSubscriptionsByGroup(subscriber.subscriptions)"
            :key="groupName"
            :label="`${groupName} (${count})`"
            variant="subtle"
            color="success"
            size="xs"
          />
          <span class="date">{{ formatDate(subscriber.created_at) }}</span>
        </div>
      </CrmListItem>
    </template>

    <template #detail>
      <CrmDetailPanel :has-selection="!!selectedSubscriber">
        <template #header>
          <h2>{{ selectedSubscriber?.name }}</h2>
        </template>

        <template #actions>
          <UButton type="button" @click="resetForm" variant="outline">Reset</UButton>
          <UButton @click="openDeleteModal" color="error" variant="outline">Delete</UButton>
          <UButton @click="saveChanges" :loading="saving">
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </UButton>
        </template>

        <form v-if="selectedSubscriber" @submit.prevent="saveChanges">
          <!-- Contact Information -->
          <CrmFormSection title="Contact Information">
            <UFormField label="Name" required>
              <UInput v-model="subscriberForm.name" type="text" class="w-full" />
            </UFormField>

            <UFormField v-if="selectedSubscriber.primary_email" label="Email">
              <div class="contact-display">{{ selectedSubscriber.primary_email }}</div>
            </UFormField>

            <UFormField v-if="selectedSubscriber.primary_phone" label="Phone">
              <div class="contact-display">{{ selectedSubscriber.primary_phone }}</div>
            </UFormField>

            <UFormField label="Preferred Language">
              <div class="contact-display">{{ formatLanguage(selectedSubscriber.preferred_language) }}</div>
            </UFormField>
          </CrmFormSection>

          <!-- Marketing Consents -->
          <CrmFormSection title="Marketing Consents">
            <div class="consents-list">
              <div class="consent-item">
                <div class="consent-label">
                  <span class="consent-name">Doxa General Updates</span>
                  <UBadge
                    :label="selectedSubscriber.consents.doxa_general ? 'Opted In' : 'Not Opted In'"
                    :color="selectedSubscriber.consents.doxa_general ? 'success' : 'neutral'"
                    :variant="selectedSubscriber.consents.doxa_general ? 'solid' : 'outline'"
                    size="xs"
                  />
                </div>
                <span v-if="selectedSubscriber.consents.doxa_general && selectedSubscriber.consents.doxa_general_at" class="consent-date">
                  since {{ formatDate(selectedSubscriber.consents.doxa_general_at) }}
                </span>
              </div>

              <div v-if="selectedSubscriber.consents.people_group_names.length > 0" class="consent-item">
                <div class="consent-label">
                  <span class="consent-name">People Group Marketing</span>
                </div>
                <div class="people-group-consents">
                  <UBadge
                    v-for="(name, idx) in selectedSubscriber.consents.people_group_names"
                    :key="selectedSubscriber.consents.people_group_ids[idx]"
                    :label="name"
                    color="primary"
                    variant="subtle"
                    size="xs"
                  />
                </div>
              </div>

              <div v-else class="consent-item">
                <div class="consent-label">
                  <span class="consent-name">People Group Marketing</span>
                  <UBadge label="None" color="neutral" variant="outline" size="xs" />
                </div>
              </div>
            </div>
          </CrmFormSection>

          <!-- Subscriptions -->
          <CrmFormSection :title="`Subscriptions (${selectedSubscriber.subscriptions.length})`">
            <div v-if="selectedSubscriber.subscriptions.length === 0" class="no-subscriptions">
              No active subscriptions
            </div>

            <div v-else class="subscriptions-list">
              <div
                v-for="subscription in selectedSubscriber.subscriptions"
                :key="subscription.id"
                class="subscription-card"
              >
                <div class="subscription-header" @click="toggleSubscription(subscription.id)">
                  <div class="subscription-title">
                    <span class="people-group-name">{{ subscription.people_group_name }}</span>
                    <UBadge
                      :label="subscription.status"
                      variant="outline"
                      :color="subscription.status === 'active' ? 'success' : 'error'"
                      size="xs"
                    />
                  </div>
                  <UIcon
                    :name="expandedSubscriptions.has(subscription.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="expand-icon"
                  />
                </div>

                <div v-if="expandedSubscriptions.has(subscription.id)" class="subscription-details">
                  <UFormField label="Delivery Method">
                    <div class="field-display">
                      <UBadge
                        :label="subscription.delivery_method"
                        :variant="subscription.delivery_method === 'email' ? 'solid' : 'outline'"
                        :color="subscription.delivery_method === 'email' ? 'primary' : 'neutral'"
                        size="xs"
                      />
                    </div>
                  </UFormField>

                  <UFormField label="Frequency">
                    <USelect
                      v-model="getSubscriptionForm(subscription.id).frequency"
                      :items="frequencyOptions"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField v-if="subscription.frequency !== 'daily' && subscription.days_of_week" label="Days of Week">
                    <div class="field-display">{{ formatDaysOfWeek(subscription.days_of_week) }}</div>
                  </UFormField>

                  <UFormField label="Time Preference">
                    <UInput
                      v-model="getSubscriptionForm(subscription.id).time_preference"
                      type="time"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField v-if="subscription.timezone" label="Timezone">
                    <div class="field-display">{{ subscription.timezone }}</div>
                  </UFormField>

                  <UFormField label="Prayer Duration">
                    <div class="field-display">{{ formatDuration(subscription.prayer_duration) }}</div>
                  </UFormField>

                  <UFormField v-if="subscription.next_reminder_utc" label="Next Reminder">
                    <div class="field-display">{{ formatDateTime(subscription.next_reminder_utc) }}</div>
                  </UFormField>

                  <UFormField label="Status">
                    <USelect
                      v-model="getSubscriptionForm(subscription.id).status"
                      :items="statusOptions"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>

                  <div class="subscription-actions">
                    <UButton
                      size="xs"
                      variant="outline"
                      :loading="sendingReminder[subscription.id]"
                      :disabled="subscription.delivery_method !== 'email'"
                      @click="sendReminder(subscription)"
                    >
                      Send Reminder
                    </UButton>
                    <UButton
                      size="xs"
                      variant="outline"
                      :loading="sendingFollowup[subscription.id]"
                      :disabled="subscription.delivery_method !== 'email'"
                      @click="sendFollowup(subscription)"
                    >
                      Send Follow-up
                    </UButton>
                    <UButton size="xs" variant="ghost" @click="filterByPeopleGroup(subscription)">
                      Filter by People Group
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </CrmFormSection>

          <!-- Metadata -->
          <CrmFormSection title="Metadata">
            <div class="info-row">
              <span class="label">Tracking ID:</span>
              <span class="value monospace">{{ selectedSubscriber.tracking_id }}</span>
            </div>

            <div class="info-row">
              <span class="label">Profile Link:</span>
              <div class="profile-link-container">
                <span class="value profile-link-text">{{ getProfileUrl(selectedSubscriber) }}</span>
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-copy"
                  @click="copyProfileLink(selectedSubscriber)"
                />
              </div>
            </div>

            <div class="info-row">
              <span class="label">Subscriber Since:</span>
              <span class="value">{{ formatDateTime(selectedSubscriber.created_at) }}</span>
            </div>
          </CrmFormSection>

          <!-- Activity Log -->
          <CrmFormSection title="Activity Log">
            <div v-if="loadingActivityLog" class="activity-loading">
              Loading...
            </div>
            <div v-else-if="activityLog.length === 0" class="activity-empty">
              No activity recorded yet
            </div>
            <div v-else class="activity-list">
              <div v-for="activity in activityLog" :key="activity.id" class="activity-item">
                <div class="activity-header">
                  <UBadge
                    :label="formatEventType(activity.eventType)"
                    :color="getEventColor(activity.eventType)"
                    :icon="getEventIcon(activity.eventType)"
                    size="xs"
                  />
                  <span class="activity-time">{{ formatTimestamp(activity.timestamp) }}</span>
                </div>
                <div class="activity-user">
                  <template v-if="activity.metadata?.source === 'self_service'">
                    by subscriber (self-service)
                  </template>
                  <template v-else-if="activity.userName">
                    by {{ activity.userName }}
                  </template>
                </div>
                <div v-if="activity.eventType === 'PRAYER'" class="prayer-details">
                  {{ formatPrayerDuration(activity.metadata.duration ?? 0) }}
                  <template v-if="activity.metadata.peopleGroupName">
                    for {{ activity.metadata.peopleGroupName }}
                  </template>
                </div>
                <div v-if="activity.eventType === 'EMAIL'" class="email-details">
                  Day {{ activity.metadata.sentDate }}
                  <template v-if="activity.metadata.peopleGroupName">
                    · {{ activity.metadata.peopleGroupName }}
                  </template>
                </div>
                <div v-if="activity.eventType === 'FOLLOWUP_RESPONSE'" class="followup-details">
                  {{ formatFollowupResponse(activity.metadata.response ?? '') }}
                  <template v-if="activity.metadata.peopleGroupName">
                    · {{ activity.metadata.peopleGroupName }}
                  </template>
                </div>
                <div v-if="activity.metadata?.changes" class="activity-changes">
                  <div
                    v-for="(change, field) in activity.metadata.changes"
                    :key="field"
                    class="change-item"
                  >
                    <span class="change-field">{{ formatFieldName(field as string) }}:</span>
                    <span class="change-from">{{ formatValue(change.from) }}</span>
                    <span class="change-arrow">→</span>
                    <span class="change-to">{{ formatValue(change.to) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </CrmFormSection>
        </form>

        <template #empty>
          Select a subscriber to view details
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Subscriber"
    :message="subscriberToDelete ? `Are you sure you want to delete &quot;${subscriberToDelete.name}&quot;?` : ''"
    warning="This will delete all subscriptions for this subscriber. This action cannot be undone."
    confirm-text="Delete"
    confirm-color="primary"
    :loading="deleting"
    @confirm="confirmDelete"
    @cancel="cancelDelete"
  />
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface Contact {
  id: number
  type: 'email' | 'phone'
  value: string
  verified: boolean
}

interface Subscription {
  id: number
  people_group_id: number
  people_group_name: string
  people_group_slug: string
  delivery_method: 'email' | 'whatsapp' | 'app'
  frequency: string
  days_of_week: string | null
  time_preference: string
  timezone: string
  prayer_duration: number
  next_reminder_utc: string | null
  status: 'active' | 'inactive' | 'unsubscribed'
  created_at: string
  updated_at: string
}

interface SubscriberConsents {
  doxa_general: boolean
  doxa_general_at: string | null
  people_group_ids: number[]
  people_group_names: string[]
}

interface GeneralSubscriber {
  id: number
  tracking_id: string
  profile_id: string
  name: string
  preferred_language: string
  created_at: string
  updated_at: string
  contacts: Contact[]
  primary_email: string | null
  primary_phone: string | null
  subscriptions: Subscription[]
  consents: SubscriberConsents
}

interface PeopleGroup {
  id: number
  name: string
  slug: string
}

interface SubscriptionForm {
  frequency: string
  time_preference: string
  status: 'active' | 'inactive' | 'unsubscribed'
}

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Data
const subscribers = ref<GeneralSubscriber[]>([])
const peopleGroups = ref<PeopleGroup[]>([])
const selectedSubscriber = ref<GeneralSubscriber | null>(null)

// Loading states
const loading = ref(true)
const error = ref('')
const saving = ref(false)

// Filters
const searchQuery = ref('')
const filterPeopleGroupId = ref<number | null>(null)

// Form state
const subscriberForm = ref({ name: '' })
const subscriptionForms = ref<Map<number, SubscriptionForm>>(new Map())

// Expansion state for subscription cards
const expandedSubscriptions = ref<Set<number>>(new Set())

// Delete modal state
const showDeleteModal = ref(false)
const subscriberToDelete = ref<GeneralSubscriber | null>(null)
const deleting = ref(false)

// Activity log state
interface ActivityLogEntry {
  id: string
  timestamp: number
  eventType: string
  tableName: string
  userId: string | null
  userName: string | null
  metadata: {
    changes?: Record<string, { from: any; to: any }>
    deletedRecord?: Record<string, any>
    source?: string
    duration?: number
    peopleGroupName?: string
    sentDate?: string
    response?: string
  }
}
const activityLog = ref<ActivityLogEntry[]>([])
const loadingActivityLog = ref(false)

// Send reminder state
const sendingReminder = ref<Record<number, boolean>>({})
const sendingFollowup = ref<Record<number, boolean>>({})

// Helpers
function getSubscriptionsByGroup(subscriptions: any[]) {
  const grouped: Record<string, number> = {}
  for (const sub of subscriptions) {
    const name = sub.people_group_name || 'Unknown'
    grouped[name] = (grouped[name] || 0) + 1
  }
  return grouped
}

// Options
const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Unsubscribed', value: 'unsubscribed' }
]

const frequencyOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' }
]

const peopleGroupOptions = computed(() => {
  return [
    { label: 'All People Groups', value: null },
    ...peopleGroups.value.map(c => ({ label: c.name, value: c.id }))
  ]
})

const filteredSubscribers = computed(() => {
  let filtered = subscribers.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.primary_email?.toLowerCase().includes(query) ||
      s.primary_phone?.includes(query) ||
      String(s.id) === query ||
      s.tracking_id.toLowerCase().includes(query)
    )
  }

  if (filterPeopleGroupId.value) {
    filtered = filtered.filter(s =>
      s.subscriptions.some(sub => sub.people_group_id === filterPeopleGroupId.value)
    )
  }

  return filtered
})

async function loadData() {
  try {
    loading.value = true
    error.value = ''

    const peopleGroupsResponse = await $fetch<{ peopleGroups: PeopleGroup[] }>('/api/admin/people-groups')
    peopleGroups.value = peopleGroupsResponse.peopleGroups

    const subscribersResponse = await $fetch<{ subscribers: GeneralSubscriber[] }>('/api/admin/subscribers')
    subscribers.value = subscribersResponse.subscribers
  } catch (err: any) {
    error.value = 'Failed to load subscribers'
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function selectSubscriber(subscriber: GeneralSubscriber, updateUrl = true) {
  selectedSubscriber.value = subscriber
  subscriberForm.value = { name: subscriber.name }
  if (updateUrl && import.meta.client) {
    const params = new URLSearchParams()
    if (filterPeopleGroupId.value) params.set('peopleGroup', String(filterPeopleGroupId.value))
    if (route.query.from) params.set('from', route.query.from as string)
    if (route.query.peopleGroupId) params.set('peopleGroupId', route.query.peopleGroupId as string)
    const queryString = params.toString()
    window.history.replaceState({}, '', `/admin/subscribers/${subscriber.id}${queryString ? '?' + queryString : ''}`)
  }

  subscriptionForms.value = new Map()
  for (const sub of subscriber.subscriptions) {
    subscriptionForms.value.set(sub.id, {
      frequency: sub.frequency,
      time_preference: sub.time_preference,
      status: sub.status
    })
  }

  expandedSubscriptions.value = new Set()
  const firstSubscription = subscriber.subscriptions[0]
  if (firstSubscription) {
    expandedSubscriptions.value.add(firstSubscription.id)
  }

  await loadActivityLog(subscriber)
}

function getSubscriptionForm(subscriptionId: number): SubscriptionForm {
  let form = subscriptionForms.value.get(subscriptionId)
  if (!form) {
    const subscription = selectedSubscriber.value?.subscriptions.find(s => s.id === subscriptionId)
    form = {
      frequency: subscription?.frequency || '',
      time_preference: subscription?.time_preference || '',
      status: subscription?.status || 'active'
    }
    subscriptionForms.value.set(subscriptionId, form)
  }
  return form
}

function toggleSubscription(subscriptionId: number) {
  if (expandedSubscriptions.value.has(subscriptionId)) {
    expandedSubscriptions.value.delete(subscriptionId)
  } else {
    expandedSubscriptions.value.add(subscriptionId)
  }
}

async function loadActivityLog(subscriber: GeneralSubscriber) {
  if (!subscriber.subscriptions.length) {
    activityLog.value = []
    return
  }

  try {
    loadingActivityLog.value = true
    const allActivities: ActivityLogEntry[] = []

    for (const subscription of subscriber.subscriptions) {
      try {
        const response = await $fetch<{ activities: ActivityLogEntry[] }>(`/api/admin/subscribers/${subscription.id}/activity`)
        allActivities.push(...response.activities)
      } catch (err) {
        console.error(`Failed to load activity for subscription ${subscription.id}:`, err)
      }
    }

    activityLog.value = allActivities
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((activity, index, self) =>
        index === self.findIndex(a => a.id === activity.id)
      )
  } catch (err: any) {
    console.error('Failed to load activity:', err)
    activityLog.value = []
  } finally {
    loadingActivityLog.value = false
  }
}

async function sendReminder(subscription: Subscription) {
  if (sendingReminder.value[subscription.id]) return

  try {
    sendingReminder.value[subscription.id] = true
    await $fetch(`/api/admin/subscribers/${subscription.id}/send-reminder`, {
      method: 'POST'
    })

    toast.add({
      title: 'Reminder Sent',
      description: `Prayer reminder email sent for ${subscription.people_group_name}`,
      color: 'success'
    })

    // Refresh activity log to show the new email
    if (selectedSubscriber.value) {
      await loadActivityLog(selectedSubscriber.value)
    }
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to send reminder',
      color: 'error'
    })
  } finally {
    sendingReminder.value[subscription.id] = false
  }
}

async function sendFollowup(subscription: Subscription) {
  if (sendingFollowup.value[subscription.id]) return

  try {
    sendingFollowup.value[subscription.id] = true
    await $fetch(`/api/admin/subscribers/${subscription.id}/send-followup`, {
      method: 'POST'
    })

    toast.add({
      title: 'Follow-up Sent',
      description: `Commitment check-in email sent for ${subscription.people_group_name}`,
      color: 'success'
    })

    // Refresh activity log to show the new email
    if (selectedSubscriber.value) {
      await loadActivityLog(selectedSubscriber.value)
    }
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to send follow-up',
      color: 'error'
    })
  } finally {
    sendingFollowup.value[subscription.id] = false
  }
}

async function saveChanges() {
  if (!selectedSubscriber.value) return

  try {
    saving.value = true
    const subscriber = selectedSubscriber.value
    const nameChanged = subscriberForm.value.name !== subscriber.name

    const changedSubscriptions: number[] = []
    for (const [subId, form] of subscriptionForms.value.entries()) {
      const original = subscriber.subscriptions.find(s => s.id === subId)
      if (original) {
        if (
          form.frequency !== original.frequency ||
          form.time_preference !== original.time_preference ||
          form.status !== original.status
        ) {
          changedSubscriptions.push(subId)
        }
      }
    }

    if (changedSubscriptions.length > 0) {
      const firstSubId = changedSubscriptions[0]!
      const form = subscriptionForms.value.get(firstSubId)
      if (!form) return

      await $fetch(`/api/admin/subscribers/${firstSubId}`, {
        method: 'PUT',
        body: {
          name: subscriberForm.value.name,
          ...form
        }
      })

      for (const subId of changedSubscriptions.slice(1)) {
        const subForm = subscriptionForms.value.get(subId)
        if (!subForm) continue
        await $fetch(`/api/admin/subscribers/${subId}`, {
          method: 'PUT',
          body: subForm
        })
      }
    } else if (nameChanged && subscriber.subscriptions.length > 0) {
      const firstSub = subscriber.subscriptions[0]
      if (!firstSub) return
      const form = subscriptionForms.value.get(firstSub.id) || {
        frequency: firstSub.frequency,
        time_preference: firstSub.time_preference,
        status: firstSub.status
      }

      await $fetch(`/api/admin/subscribers/${firstSub.id}`, {
        method: 'PUT',
        body: {
          name: subscriberForm.value.name,
          ...form
        }
      })
    }

    await loadData()

    const updated = subscribers.value.find(s => s.id === subscriber.id)
    if (updated) {
      selectSubscriber(updated)
    }

    toast.add({
      title: 'Success',
      description: 'Changes saved successfully',
      color: 'success'
    })
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to save changes',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function resetForm() {
  if (selectedSubscriber.value) {
    selectSubscriber(selectedSubscriber.value)
  }
}

function openDeleteModal() {
  if (!selectedSubscriber.value) return
  subscriberToDelete.value = selectedSubscriber.value
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!subscriberToDelete.value) return

  try {
    deleting.value = true

    for (const subscription of subscriberToDelete.value.subscriptions) {
      await $fetch(`/api/admin/subscribers/${subscription.id}`, {
        method: 'DELETE'
      })
    }

    toast.add({
      title: 'Success',
      description: `Subscriber "${subscriberToDelete.value.name}" has been deleted.`,
      color: 'success'
    })

    subscribers.value = subscribers.value.filter(s => s.id !== subscriberToDelete.value!.id)
    selectedSubscriber.value = null
    showDeleteModal.value = false
    subscriberToDelete.value = null

    if (import.meta.client) {
      const params = new URLSearchParams()
      if (filterPeopleGroupId.value) params.set('peopleGroup', String(filterPeopleGroupId.value))
      if (route.query.from) params.set('from', route.query.from as string)
      if (route.query.peopleGroupId) params.set('peopleGroupId', route.query.peopleGroupId as string)
      const queryString = params.toString()
      window.history.replaceState({}, '', `/admin/subscribers${queryString ? '?' + queryString : ''}`)
    }
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to delete subscriber',
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

function cancelDelete() {
  showDeleteModal.value = false
  subscriberToDelete.value = null
}

function filterByPeopleGroup(subscription: Subscription) {
  filterPeopleGroupId.value = subscription.people_group_id
  router.push({ query: { peopleGroup: subscription.people_group_id } })
}

// Formatting functions
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString()
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString()
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDaysOfWeek(daysJson: string | null): string {
  if (!daysJson) return ''
  try {
    const days = JSON.parse(daysJson) as number[]
    return days.sort((a, b) => a - b).map(d => dayNames[d]).join(', ')
  } catch {
    return ''
  }
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '10 min'
  if (minutes >= 60) return `${minutes / 60} hour${minutes > 60 ? 's' : ''}`
  return `${minutes} min`
}

function getProfileUrl(subscriber: GeneralSubscriber): string {
  const baseUrl = window.location.origin
  return `${baseUrl}/subscriber?id=${subscriber.profile_id}`
}

async function copyProfileLink(subscriber: GeneralSubscriber) {
  const url = getProfileUrl(subscriber)
  try {
    await navigator.clipboard.writeText(url)
    toast.add({
      title: 'Copied!',
      description: 'Profile link copied to clipboard',
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to copy link',
      color: 'error'
    })
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatEventType(eventType: string): string {
  const types: Record<string, string> = {
    'CREATE': 'Created',
    'UPDATE': 'Updated',
    'DELETE': 'Deleted',
    'PRAYER': 'Prayed',
    'EMAIL': 'Email Sent',
    'FOLLOWUP_RESPONSE': 'Check-in Response'
  }
  return types[eventType] || eventType
}

function getEventColor(eventType: string): 'success' | 'warning' | 'error' | 'neutral' | 'primary' {
  const colors: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
    'CREATE': 'success',
    'UPDATE': 'warning',
    'DELETE': 'error',
    'PRAYER': 'primary',
    'EMAIL': 'neutral',
    'FOLLOWUP_RESPONSE': 'primary'
  }
  return colors[eventType] || 'neutral'
}

function getEventIcon(eventType: string): string | undefined {
  const icons: Record<string, string> = {
    'UPDATE': 'i-lucide-pencil',
    'PRAYER': 'i-lucide-hand-helping',
    'EMAIL': 'i-lucide-mail',
    'FOLLOWUP_RESPONSE': 'i-lucide-message-circle'
  }
  return icons[eventType]
}

function formatFieldName(field: string): string {
  const names: Record<string, string> = {
    'name': 'Name',
    'email': 'Email',
    'phone': 'Phone',
    'frequency': 'Frequency',
    'time_preference': 'Time',
    'status': 'Status',
    'delivery_method': 'Delivery Method',
    'prayer_duration': 'Prayer Duration',
    'timezone': 'Timezone',
    'days_of_week': 'Days of Week'
  }
  return names[field] || field.replace(/_/g, ' ')
}

function formatValue(value: any): string {
  if (value === null || value === undefined || value === '') {
    return '(empty)'
  }
  return String(value)
}

function formatPrayerDuration(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.round(seconds / 60)
    return `${mins} min`
  }
  return `${seconds} sec`
}

function formatFollowupResponse(response: string): string {
  const responses: Record<string, string> = {
    'committed': 'Answered: Yes, still praying',
    'sometimes': 'Answered: Sometimes',
    'not_praying': 'Answered: No longer praying'
  }
  return responses[response] || response
}

function formatLanguage(code: string): string {
  const languages: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'pt': 'Portuguese',
    'de': 'German',
    'it': 'Italian',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'ru': 'Russian',
    'hi': 'Hindi'
  }
  return languages[code] || code
}

// Handle URL-based selection
function handleUrlSelection() {
  const idParam = route.params.id as string | undefined
  if (!idParam) return

  const id = parseInt(idParam)
  const subscriber = subscribers.value.find(s => s.id === id)
  if (subscriber) {
    selectSubscriber(subscriber, false)
  }
}

onMounted(async () => {
  const peopleGroupParam = route.query.peopleGroup
  if (peopleGroupParam) {
    filterPeopleGroupId.value = parseInt(peopleGroupParam as string)
  }
  await loadData()
  handleUrlSelection()
})
</script>

<style scoped>
.filter-select {
  width: 100%;
}

.empty-list {
  padding: 2rem;
  text-align: center;
  color: var(--ui-text-muted);
}

.subscriber-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.subscriber-contact {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 0.5rem;
}

.subscriber-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}

.date {
  color: var(--ui-text-muted);
}

.contact-display,
.field-display {
  padding: 0.5rem 0.75rem;
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  font-size: 0.875rem;
}

.no-subscriptions {
  padding: 1rem;
  text-align: center;
  color: var(--ui-text-muted);
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
}

.subscriptions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.subscription-card {
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  overflow: hidden;
}

.subscription-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: var(--ui-bg);
  cursor: pointer;
  transition: background-color 0.2s;
}

.subscription-header:hover {
  background-color: var(--ui-bg-elevated);
}

.subscription-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.people-group-name {
  font-weight: 500;
}

.expand-icon {
  width: 1rem;
  height: 1rem;
  color: var(--ui-text-muted);
}

.subscription-details {
  padding: 1rem;
  border-top: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.subscription-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ui-border);
  margin-top: 0.5rem;
}

/* Activity Log Styles */
.activity-loading,
.activity-empty {
  padding: 0.75rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
}

.activity-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--ui-border);
  border-radius: 4px;
}

.activity-item {
  padding: 0.5rem;
  border-bottom: 1px solid var(--ui-border);
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.activity-time {
  color: var(--ui-text-muted);
  font-size: 0.7rem;
}

.activity-user {
  color: var(--ui-text-muted);
  font-size: 0.7rem;
  margin-bottom: 0.25rem;
}

.prayer-details,
.email-details,
.followup-details {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  margin-top: 0.25rem;
}

.activity-changes {
  margin-top: 0.25rem;
  padding: 0.375rem;
  background-color: var(--ui-bg);
  border-radius: 4px;
  font-size: 0.75rem;
}

.change-item {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.125rem 0;
}

.change-field {
  font-weight: 500;
  margin-right: 0.25rem;
}

.change-from {
  color: var(--ui-text-muted);
  text-decoration: line-through;
}

.change-arrow {
  color: var(--ui-text-muted);
  margin: 0 0.25rem;
}

.change-to {
  font-weight: 500;
}

/* Profile Link Styles */
.profile-link-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.profile-link-text {
  font-size: 0.75rem;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ui-border);
  font-size: 0.875rem;
}

.info-row .label {
  font-weight: 500;
}

.info-row .value {
  color: var(--ui-text-muted);
}

.monospace {
  font-family: monospace;
}

/* Consent Styles */
.consents-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.consent-item {
  padding: 0.75rem;
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
}

.consent-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.consent-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.consent-date {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  margin-top: 0.25rem;
}

.people-group-consents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.5rem;
}
</style>

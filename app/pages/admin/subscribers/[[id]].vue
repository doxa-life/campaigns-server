<template>
  <CrmLayout
    :loading="loading"
    :error="error"
    v-model:open="slideoverOpen"
  >
    <template #header>
      <div>
        <h1>Contacts</h1>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreateModal">New Contact</UButton>
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
          <USelectMenu
            v-model="filterSource"
            :items="sourceOptions"
            value-key="value"
            placeholder="All Sources"
            class="filter-select"
          />
        </template>
      </CrmListPanel>
    </template>

    <template #list>
      <template v-if="filteredSubscribers.length === 0">
        <div class="empty-list">No contacts found</div>
      </template>
      <CrmListItem
        v-else
        v-for="subscriber in filteredSubscribers"
        :key="subscriber.id"
        :active="selectedSubscriber?.id === subscriber.id"
        @click="selectSubscriber(subscriber)"
      >
        <div class="subscriber-name">{{ subscriber.name }} <span v-if="subscriber.preferred_language" class="language-flag">{{ getLanguageFlag(subscriber.preferred_language) }}</span></div>
        <div class="subscriber-contact">
          {{ subscriber.primary_email || subscriber.primary_phone || 'No contact' }}
        </div>
        <div class="subscriber-meta">
          <template v-if="isEmailVerified(subscriber)">
            <UBadge
              v-for="(count, groupName) in getSubscriptionsByGroup(subscriber.subscriptions)"
              :key="groupName"
              :label="count > 1 ? `${groupName} x${count}` : `${groupName}`"
              variant="outline"
              color="neutral"
              size="xs"
            />
            <UBadge
              v-for="source in subscriber.sources"
              :key="source"
              :label="getFieldOptionLabel('sources', source)"
              variant="subtle"
              color="info"
              size="xs"
            />
            <UBadge
              v-if="subscriber.consents?.doxa_general"
              label="Doxa"
              color="success"
              size="xs"
            />
            <span v-if="subscriber.total_prayer_minutes > 0" class="prayer-time">
              <UIcon name="i-lucide-timer" />{{ formatMinutes(subscriber.total_prayer_minutes) }}
            </span>
            <span v-if="subscriber.comment_count > 0" class="comment-count">
              <UIcon name="i-lucide-message-square" />{{ subscriber.comment_count }}
            </span>
          </template>
          <UBadge
            v-else
            label="Unverified"
            color="error"
            variant="subtle"
            size="xs"
          />
          <span class="date">{{ formatDate(subscriber.created_at) }}</span>
        </div>
      </CrmListItem>
    </template>

    <template v-if="selectedSubscriber" #detail-header>
      <h2>{{ selectedSubscriber.name }}</h2>
    </template>

    <template v-if="selectedSubscriber" #detail-actions>
      <CrmSaveStatus :saving="saving" :saved="!!savedField" />
      <UButton size="sm" @click="openDeleteModal" color="error" variant="outline">Delete</UButton>
    </template>

    <template #detail>
      <CrmDetailPanel v-if="selectedSubscriber" :side-tabs="sideTabs">

        <template #details>
          <div class="stats-grid">
            <div class="stat-block">
              <span class="stat-label">Status</span>
              <UBadge
                :label="subscriberStatus"
                :color="subscriberStatus === 'Active' ? 'success' : 'error'"
                variant="subtle"
              />
            </div>
            <div class="stat-block">
              <span class="stat-label">Subscriptions</span>
              <span class="stat-value">{{ activeSubscriptionCount }}</span>
            </div>
            <div class="stat-block">
              <span class="stat-label">Prayer Sessions</span>
              <span class="stat-value">{{ selectedSubscriber.prayer_session_count }}</span>
            </div>
            <div class="stat-block">
              <span class="stat-label">Prayer Time</span>
              <span class="stat-value">{{ selectedSubscriber.total_prayer_minutes }}m</span>
            </div>
          </div>

          <form @submit.prevent>
            <CrmFormSection title="Contact Information">
              <UFormField :label="getSubscriberFieldLabel('name')" required>
                <UInput
                  :model-value="subscriberForm.name"
                  @update:model-value="v => { subscriberForm.name = v }"
                  @blur="flushSubscriberAutoSave"
                  type="text"
                  class="w-full"
                />
              </UFormField>

              <UFormField>
                <template #label>
                  <span class="inline-flex items-center gap-1">
                    {{ getSubscriberFieldLabel('email') }}
                    <UBadge
                      :label="emailVerified ? 'Verified' : 'Unverified'"
                      :color="emailVerified ? 'success' : 'error'"
                      variant="subtle"
                      size="xs"
                    />
                  </span>
                </template>
                <UInput
                  :model-value="subscriberForm.email"
                  @update:model-value="v => { subscriberForm.email = v }"
                  @blur="flushSubscriberAutoSave"
                  type="email"
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="getSubscriberFieldLabel('phone')">
                <UInput
                  :model-value="subscriberForm.phone"
                  @update:model-value="v => { subscriberForm.phone = v }"
                  @blur="flushSubscriberAutoSave"
                  type="tel"
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="getSubscriberFieldLabel('role')">
                <UInput
                  :model-value="subscriberForm.role"
                  @update:model-value="v => { subscriberForm.role = v }"
                  @blur="flushSubscriberAutoSave"
                  type="text"
                  class="w-full"
                  placeholder="e.g. Pastor, Missions Pastor"
                />
              </UFormField>

              <UFormField :label="getSubscriberFieldLabel('preferred_language')">
                <USelectMenu
                  :model-value="subscriberForm.preferred_language"
                  @update:model-value="v => { subscriberForm.preferred_language = v; subscriberFieldChanged('preferred_language', 'immediate') }"
                  :items="languageOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="getSubscriberFieldLabel('country')">
                <USelectMenu
                  :model-value="subscriberForm.country"
                  @update:model-value="v => { subscriberForm.country = v; subscriberFieldChanged('country', 'immediate') }"
                  :items="countryOptions"
                  value-key="value"
                  placeholder="Select country..."
                  searchable
                  class="w-full"
                />
              </UFormField>

              <UFormField :label="getSubscriberFieldLabel('sources')">
                <USelectMenu
                  :model-value="subscriberForm.sources"
                  @update:model-value="v => { subscriberForm.sources = v; subscriberFieldChanged('sources', 'immediate') }"
                  :items="sourceEditOptions"
                  value-key="value"
                  multiple
                  placeholder="No sources"
                  class="w-full"
                />
              </UFormField>
            </CrmFormSection>

            <CrmFormSection title="Groups">
              <template #header-extra>
                <UButton size="xs" variant="outline" icon="i-lucide-plus" @click="showAddGroupModal = true">
                  Add
                </UButton>
              </template>

              <div v-if="subscriberGroups.length === 0" class="p-4 text-center text-muted text-sm">
                Not in any groups
              </div>
              <div v-else class="groups-list">
                <div v-for="g in subscriberGroups" :key="g.group_id" class="group-row">
                  <NuxtLink :to="`/admin/groups/${g.group_id}`" class="group-link">
                    {{ g.name }}
                  </NuxtLink>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-x"
                    @click="removeFromGroup(g.group_id)"
                  />
                </div>
              </div>
            </CrmFormSection>

            <CrmFormSection title="Marketing Consents">
              <div v-if="!emailVerified" class="unverified-notice">
                <UIcon name="i-lucide-info" />
                <span>Email not verified — consents are not active</span>
              </div>
              <div class="consents-list" :class="{ 'consents-disabled': !emailVerified }">
                <div class="consent-item">
                  <div class="consent-label">
                    <span class="consent-name">Doxa General Updates</span>
                    <USwitch
                      :model-value="selectedSubscriber.consents.doxa_general"
                      :disabled="!emailVerified"
                      @update:model-value="toggleDoxaConsent"
                    />
                  </div>
                  <span v-if="selectedSubscriber.consents.doxa_general && selectedSubscriber.consents.doxa_general_at" class="consent-date">
                    since {{ formatDate(selectedSubscriber.consents.doxa_general_at) }}
                  </span>
                </div>

                <div class="consent-item">
                  <div class="consent-label">
                    <span class="consent-name">People Group Marketing</span>
                  </div>
                  <div v-if="selectedSubscriber.consents.people_group_names.length > 0" class="people-group-consents">
                    <UBadge
                      v-for="(name, idx) in selectedSubscriber.consents.people_group_names"
                      :key="selectedSubscriber.consents.people_group_ids[idx]"
                      :label="name"
                      color="primary"
                      variant="subtle"
                      size="xs"
                      :trailing-icon="emailVerified ? 'i-lucide-x' : undefined"
                      :class="{ 'cursor-pointer': emailVerified }"
                      @click="emailVerified && removePeopleGroupConsent(selectedSubscriber.consents.people_group_ids[idx]!)"
                    />
                  </div>
                  <div v-else class="consent-empty">None</div>
                  <USelectMenu
                    v-if="emailVerified && availablePeopleGroupConsentOptions.length > 0"
                    :items="availablePeopleGroupConsentOptions"
                    value-key="value"
                    placeholder="Add people group..."
                    class="mt-2"
                    @update:model-value="addPeopleGroupConsent"
                  />
                </div>
              </div>
            </CrmFormSection>

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
                        :color="subscription.status === 'active' ? 'success' : subscription.status === 'pending' ? 'warning' : 'error'"
                        size="xs"
                      />
                    </div>
                    <UIcon
                      :name="expandedSubscriptions.has(subscription.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      class="expand-icon"
                    />
                  </div>

                  <div v-if="expandedSubscriptions.has(subscription.id)" class="subscription-details">
                    <UFormField :label="getSubscriberFieldLabel('delivery_method')">
                      <div class="field-display">
                        <UBadge
                          :label="subscription.delivery_method"
                          :variant="subscription.delivery_method === 'email' ? 'solid' : 'outline'"
                          :color="subscription.delivery_method === 'email' ? 'primary' : 'neutral'"
                          size="xs"
                        />
                      </div>
                    </UFormField>

                    <UFormField :label="getSubscriberFieldLabel('frequency')">
                      <USelect
                        :model-value="getSubscriptionForm(subscription.id).frequency"
                        @update:model-value="v => updateSubscriptionField(subscription.id, 'frequency', v)"
                        :items="frequencyOptions"
                        value-key="value"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField v-if="subscription.frequency !== 'daily' && subscription.days_of_week" :label="getSubscriberFieldLabel('days_of_week')">
                      <div class="field-display">{{ formatDaysOfWeek(subscription.days_of_week) }}</div>
                    </UFormField>

                    <UFormField :label="getSubscriberFieldLabel('time_preference')">
                      <UInput
                        :model-value="getSubscriptionForm(subscription.id).time_preference"
                        @update:model-value="v => updateSubscriptionField(subscription.id, 'time_preference', v)"
                        @blur="() => flushSubscriptionSaver(subscription.id)"
                        type="time"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField v-if="subscription.timezone" :label="getSubscriberFieldLabel('timezone')">
                      <div class="field-display">{{ subscription.timezone }}</div>
                    </UFormField>

                    <UFormField :label="getSubscriberFieldLabel('prayer_duration')">
                      <div class="field-display">{{ formatDuration(subscription.prayer_duration) }}</div>
                    </UFormField>

                    <UFormField v-if="subscription.next_reminder_utc" :label="getSubscriberFieldLabel('next_reminder_utc')">
                      <div class="field-display">{{ formatDateTime(subscription.next_reminder_utc) }}</div>
                    </UFormField>

                    <UFormField :label="getSubscriberFieldLabel('status')">
                      <USelect
                        :model-value="getSubscriptionForm(subscription.id).status"
                        @update:model-value="v => updateSubscriptionField(subscription.id, 'status', v)"
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
          </form>
        </template>

        <template #side-comments>
          <RecordComments record-type="subscriber" :record-id="selectedSubscriber.id" @update:count="commentCount = $event" />
        </template>

        <template #side-activity>
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
                    :label="formatEventType(activity.metadata?.badge || activity.eventType)"
                    :color="getEventColor(activity.metadata?.badge || activity.eventType)"
                    :icon="getEventIcon(activity.metadata?.badge || activity.eventType)"
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
                  <template v-else-if="activity.metadata?.source">
                    by {{ activity.metadata.source }}
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
                <div v-if="activity.metadata?.message" class="activity-detail">
                  {{ activity.metadata.message }}
                  <NuxtLink v-if="activity.metadata.link_url" :to="activity.metadata.link_url" class="activity-link">
                    {{ activity.metadata.link_text }}
                  </NuxtLink>
                </div>
                <div v-if="activity.metadata?.form_values" class="activity-changes">
                  <div
                    v-for="(value, key) in activity.metadata.form_values"
                    :key="key"
                    class="change-item"
                  >
                    <span class="change-field">{{ formatFormKey(key as string) }}:</span>
                    <span class="change-to">{{ formatFormValue(value, key as string) }}</span>
                  </div>
                </div>
                <div v-if="activity.metadata?.changes" class="activity-changes">
                  <div
                    v-for="(change, field) in activity.metadata.changes"
                    :key="field"
                    class="change-item"
                  >
                    <span class="change-field">{{ formatFieldName(field as string) }}:</span>
                    <span class="change-from">{{ formatValue(change.from, field as string) }}</span>
                    <span class="change-arrow">→</span>
                    <span class="change-to">{{ formatValue(change.to, field as string) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </CrmFormSection>
        </template>
      </CrmDetailPanel>
    </template>
  </CrmLayout>

  <!-- Add to Group Modal -->
  <UModal v-model:open="showAddGroupModal" title="Add to Group">
    <template #body>
      <form @submit.prevent="addToGroup" class="flex flex-col gap-3">
        <UFormField label="Group">
          <USelectMenu
            v-model="addGroupId"
            :items="availableGroupOptions"
            value-key="value"
            placeholder="Select a group..."
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="showAddGroupModal = false">Cancel</UButton>
          <UButton type="submit" :disabled="!addGroupId">Add</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <!-- Create Person Modal -->
  <UModal v-model:open="showCreatePersonModal" title="New Contact">
    <template #body>
      <form @submit.prevent="createPerson" class="flex flex-col gap-3">
        <UFormField label="Name" required>
          <UInput v-model="createPersonForm.name" type="text" class="w-full" />
        </UFormField>
        <UFormField label="Email">
          <UInput v-model="createPersonForm.email" type="email" class="w-full" />
        </UFormField>
        <UFormField label="Phone">
          <UInput v-model="createPersonForm.phone" type="tel" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="outline" @click="showCreatePersonModal = false">Cancel</UButton>
          <UButton type="submit" :loading="creatingPerson">Create</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Contact"
    :message="subscriberToDelete ? `Are you sure you want to delete &quot;${subscriberToDelete.name}&quot;?` : ''"
    warning="This will delete all subscriptions for this contact. This action cannot be undone."
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
  status: 'active' | 'inactive' | 'unsubscribed' | 'pending'
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
  role?: string | null
  country?: string | null
  sources: string[]
  subscriptions: Subscription[]
  consents: SubscriberConsents
  total_prayer_minutes: number
  prayer_session_count: number
  comment_count: number
}

interface PeopleGroup {
  id: number
  name: string
  slug: string
}

interface SubscriptionForm {
  frequency: string
  time_preference: string
  status: 'active' | 'inactive' | 'unsubscribed' | 'pending'
}

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Data
const subscriberGroups = ref<{ group_id: number; name: string }[]>([])
const subscribers = ref<GeneralSubscriber[]>([])
const peopleGroups = ref<PeopleGroup[]>([])
const selectedSubscriber = ref<GeneralSubscriber | null>(null)

// Loading states
const loading = ref(true)
const error = ref('')

// Filters
const searchQuery = ref('')
const filterPeopleGroupId = ref<number | null>(null)
const filterSource = ref<string | null>(null)

// Subscriber auto-save
interface SubscriberFormData {
  name: string
  email: string
  phone: string
  role: string
  preferred_language: string
  country: string | undefined
  sources: string[]
}

const { formData: subscriberForm, saving: subscriberSaving, savedField, fieldChanged: subscriberFieldChanged, reset: resetSubscriberAutoSave, flush: flushSubscriberAutoSave } = useAutoSave<SubscriberFormData>(
  { name: '', email: '', phone: '', role: '', preferred_language: 'en', country: undefined, sources: [] },
  {
    saveFn: async (data) => {
      if (!selectedSubscriber.value) return
      const targetId = selectedSubscriber.value.id
      await $fetch(`/api/admin/subscribers/${targetId}`, {
        method: 'PUT',
        body: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: data.role || null,
          preferred_language: data.preferred_language,
          country: data.country || null,
          sources: data.sources
        }
      })
    },
    onSaved: () => {
      if (selectedSubscriber.value) loadActivityLog(selectedSubscriber.value)
    },
    onError: (err) => {
      toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to save', color: 'error' })
    }
  }
)

// Subscription auto-save (per subscription)
const subscriptionSavers = shallowRef(new Map<number, ReturnType<typeof useAutoSave<SubscriptionForm>>>())
const subscriptionForms = ref<Map<number, SubscriptionForm>>(new Map())

const saving = computed(() => {
  if (subscriberSaving.value) return true
  for (const saver of subscriptionSavers.value.values()) {
    if (saver.saving.value) return true
  }
  return false
})

function getOrCreateSubscriptionSaver(subscriptionId: number) {
  if (!subscriptionSavers.value.has(subscriptionId)) {
    const form = subscriptionForms.value.get(subscriptionId)
    if (!form) return null
    const saver = useAutoSave<SubscriptionForm>(
      { ...form },
      {
        saveFn: async (data) => {
          await $fetch(`/api/admin/subscriptions/${subscriptionId}`, {
            method: 'PUT',
            body: data
          })
        },
        onSaved: () => {
          if (selectedSubscriber.value) loadActivityLog(selectedSubscriber.value)
        },
        onError: (err) => {
          toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to save subscription', color: 'error' })
        }
      }
    )
    // Keep subscriptionForms in sync for template reads
    watch(saver.formData, (v) => {
      subscriptionForms.value.set(subscriptionId, { ...v })
    }, { deep: true })
    subscriptionSavers.value.set(subscriptionId, saver)
    triggerRef(subscriptionSavers)
  }
  return subscriptionSavers.value.get(subscriptionId)!
}

function updateSubscriptionField(subscriptionId: number, key: keyof SubscriptionForm, value: any) {
  const saver = getOrCreateSubscriptionSaver(subscriptionId)
  if (!saver) return
  ;(saver.formData.value as any)[key] = value
  const strategy = key === 'time_preference' ? 'text' as const : 'immediate' as const
  saver.fieldChanged(key, strategy)
}

function flushSubscriptionSaver(subscriptionId: number) {
  const saver = subscriptionSavers.value.get(subscriptionId)
  if (saver) saver.flush()
}

function flushAllAutoSave() {
  flushSubscriberAutoSave()
  for (const saver of subscriptionSavers.value.values()) {
    saver.flush()
  }
}

// Expansion state for subscription cards
const expandedSubscriptions = ref<Set<number>>(new Set())

// Add to group modal state
const showAddGroupModal = ref(false)
const addGroupId = ref<number | undefined>(undefined)
const allGroups = ref<{ id: number; name: string }[]>([])

// Create person modal state
const showCreatePersonModal = ref(false)
const creatingPerson = ref(false)
const createPersonForm = ref({ name: '', email: '', phone: '' })

// Delete modal state
const showDeleteModal = ref(false)
const subscriberToDelete = ref<GeneralSubscriber | null>(null)
const deleting = ref(false)

// Slideover state
const slideoverOpen = ref(false)

const commentCount = ref(0)
const emailVerified = computed(() => {
  const contacts = selectedSubscriber.value?.contacts
  if (!contacts) return false
  const emailContact = contacts.find(c => c.type === 'email' && c.value === subscriberForm.value.email)
  return emailContact?.verified ?? false
})
const activeSubscriptionCount = computed(() => {
  return selectedSubscriber.value?.subscriptions.filter(s => s.status === 'active').length ?? 0
})
const subscriberStatus = computed(() => {
  return emailVerified.value && activeSubscriptionCount.value > 0 ? 'Active' : 'Inactive'
})
const sideTabs = computed(() => [
  { label: 'Activity', slot: 'activity', icon: 'i-lucide-activity' },
  { label: 'Comments', slot: 'comments', icon: 'i-lucide-message-square', badge: commentCount.value || undefined }
])

watch(slideoverOpen, (open) => {
  if (!open) {
    flushAllAutoSave()
    deselectSubscriber()
  }
})

// Activity log state
interface ActivityLogEntry {
  id: string
  timestamp: number
  eventType: string
  tableName: string
  userId: string | null
  userName: string | null
  metadata: {
    badge?: string
    changes?: Record<string, { from: any; to: any }>
    deletedRecord?: Record<string, any>
    source?: string
    duration?: number
    peopleGroupName?: string
    sentDate?: string
    response?: string
    message?: string
    link_text?: string
    link_url?: string
    form_values?: Record<string, any>
  }
}
const activityLog = ref<ActivityLogEntry[]>([])
const loadingActivityLog = ref(false)

// Send reminder state
const sendingReminder = ref<Record<number, boolean>>({})
const sendingFollowup = ref<Record<number, boolean>>({})

// Helpers
function isEmailVerified(subscriber: GeneralSubscriber): boolean {
  const emailContact = subscriber.contacts?.find(c => c.type === 'email' && c.value === subscriber.primary_email)
  return emailContact?.verified ?? false
}

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
  { label: 'Pending', value: 'pending' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Unsubscribed', value: 'unsubscribed' }
]

const frequencyOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' }
]

const languageOptions = LANGUAGES.map(lang => ({
  label: lang.name,
  value: lang.code
}))

const languageFlagMap = Object.fromEntries(LANGUAGES.map(l => [l.code, l.flag]))
function getLanguageFlag(code: string): string {
  return languageFlagMap[code] || ''
}

const { countryOptions, getCountryName } = useLocalizedOptions()

const peopleGroupOptions = computed(() => {
  return [
    { label: 'All People Groups', value: null },
    ...peopleGroups.value.map(c => ({ label: c.name, value: c.id }))
  ]
})

const sourceEditOptions = getFieldOptions('sources').map(o => ({ label: o.label, value: o.key }))

const sourceOptions = [
  { label: 'All Sources', value: null },
  ...sourceEditOptions
]

const availableGroupOptions = computed(() => {
  const linkedIds = new Set(subscriberGroups.value.map(g => g.group_id))
  return allGroups.value
    .filter(g => !linkedIds.has(g.id))
    .map(g => ({ label: g.name, value: g.id }))
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

  if (filterSource.value) {
    filtered = filtered.filter(s => s.sources.includes(filterSource.value!))
  }

  return filtered
})

function openCreateModal() {
  createPersonForm.value = { name: '', email: '', phone: '' }
  showCreatePersonModal.value = true
}

async function createPerson() {
  if (!createPersonForm.value.name.trim()) return
  try {
    creatingPerson.value = true
    const res = await $fetch<{ subscriber: any; isNew: boolean }>('/api/admin/subscribers', {
      method: 'POST',
      body: createPersonForm.value
    })
    showCreatePersonModal.value = false
    await loadData()
    const created = subscribers.value.find(s => s.id === res.subscriber.id)
    if (created) selectSubscriber(created)
    toast.add({
      title: res.isNew ? 'Contact created' : 'Existing contact found',
      color: 'success'
    })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to create', color: 'error' })
  } finally {
    creatingPerson.value = false
  }
}

async function addToGroup() {
  if (!selectedSubscriber.value || !addGroupId.value) return
  try {
    await $fetch(`/api/admin/groups/${addGroupId.value}/subscribers`, {
      method: 'POST',
      body: { subscriber_id: selectedSubscriber.value.id }
    })
    showAddGroupModal.value = false
    addGroupId.value = undefined
    const res = await $fetch<{ groups: { group_id: number; name: string }[] }>(`/api/admin/subscribers/${selectedSubscriber.value.id}/groups`)
    subscriberGroups.value = res.groups
    toast.add({ title: 'Added to group', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to add to group', color: 'error' })
  }
}

async function removeFromGroup(groupId: number) {
  if (!selectedSubscriber.value) return
  try {
    await $fetch(`/api/admin/groups/${groupId}/subscribers?subscriber_id=${selectedSubscriber.value.id}`, {
      method: 'DELETE'
    })
    subscriberGroups.value = subscriberGroups.value.filter(g => g.group_id !== groupId)
    toast.add({ title: 'Removed from group', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to remove from group', color: 'error' })
  }
}

const availablePeopleGroupConsentOptions = computed(() => {
  if (!selectedSubscriber.value) return []
  const consentedIds = new Set(selectedSubscriber.value.consents.people_group_ids)
  return peopleGroups.value
    .filter(pg => !consentedIds.has(pg.id))
    .map(pg => ({ label: pg.name, value: pg.id }))
})

async function toggleDoxaConsent(granted: boolean) {
  if (!selectedSubscriber.value) return
  const prev = selectedSubscriber.value.consents.doxa_general
  selectedSubscriber.value.consents.doxa_general = granted
  try {
    const res = await $fetch<{ consents: typeof selectedSubscriber.value.consents }>(`/api/admin/subscribers/${selectedSubscriber.value.id}/consents`, {
      method: 'PUT',
      body: { type: 'doxa_general', granted }
    })
    selectedSubscriber.value.consents = res.consents
    toast.add({ title: granted ? 'Opted in to Doxa General Updates' : 'Opted out of Doxa General Updates', color: 'success' })
    await loadActivityLog(selectedSubscriber.value)
  } catch (err: any) {
    selectedSubscriber.value.consents.doxa_general = prev
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update consent', color: 'error' })
  }
}

async function addPeopleGroupConsent(pgId: number) {
  if (!selectedSubscriber.value) return
  const pg = peopleGroups.value.find(p => p.id === pgId)
  const prevIds = [...selectedSubscriber.value.consents.people_group_ids]
  const prevNames = [...selectedSubscriber.value.consents.people_group_names]
  selectedSubscriber.value.consents.people_group_ids.push(pgId)
  selectedSubscriber.value.consents.people_group_names.push(pg?.name || `People Group ${pgId}`)
  try {
    const res = await $fetch<{ consents: typeof selectedSubscriber.value.consents }>(`/api/admin/subscribers/${selectedSubscriber.value.id}/consents`, {
      method: 'PUT',
      body: { type: 'people_group', people_group_id: pgId, granted: true }
    })
    selectedSubscriber.value.consents = res.consents
    toast.add({ title: `Opted in to ${pg?.name || 'people group'} marketing`, color: 'success' })
    await loadActivityLog(selectedSubscriber.value)
  } catch (err: any) {
    selectedSubscriber.value.consents.people_group_ids = prevIds
    selectedSubscriber.value.consents.people_group_names = prevNames
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update consent', color: 'error' })
  }
}

async function removePeopleGroupConsent(pgId: number) {
  if (!selectedSubscriber.value) return
  const idx = selectedSubscriber.value.consents.people_group_ids.indexOf(pgId)
  if (idx === -1) return
  const pgName = selectedSubscriber.value.consents.people_group_names[idx]
  const prevIds = [...selectedSubscriber.value.consents.people_group_ids]
  const prevNames = [...selectedSubscriber.value.consents.people_group_names]
  selectedSubscriber.value.consents.people_group_ids.splice(idx, 1)
  selectedSubscriber.value.consents.people_group_names.splice(idx, 1)
  try {
    const res = await $fetch<{ consents: typeof selectedSubscriber.value.consents }>(`/api/admin/subscribers/${selectedSubscriber.value.id}/consents`, {
      method: 'PUT',
      body: { type: 'people_group', people_group_id: pgId, granted: false }
    })
    selectedSubscriber.value.consents = res.consents
    toast.add({ title: `Opted out of ${pgName} marketing`, color: 'success' })
    await loadActivityLog(selectedSubscriber.value)
  } catch (err: any) {
    selectedSubscriber.value.consents.people_group_ids = prevIds
    selectedSubscriber.value.consents.people_group_names = prevNames
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update consent', color: 'error' })
  }
}

async function loadData() {
  try {
    loading.value = true
    error.value = ''

    const [peopleGroupsResponse, subscribersResponse, groupsResponse] = await Promise.all([
      $fetch<{ peopleGroups: PeopleGroup[] }>('/api/admin/people-groups'),
      $fetch<{ subscribers: GeneralSubscriber[] }>('/api/admin/subscribers'),
      $fetch<{ groups: { id: number; name: string }[] }>('/api/admin/groups')
    ])
    peopleGroups.value = peopleGroupsResponse.peopleGroups
    subscribers.value = subscribersResponse.subscribers
    allGroups.value = groupsResponse.groups
  } catch (err: any) {
    error.value = 'Failed to load contacts'
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function selectSubscriber(subscriber: GeneralSubscriber, updateUrl = true) {
  if (updateUrl && selectedSubscriber.value?.id === subscriber.id && slideoverOpen.value) {
    slideoverOpen.value = false
    return
  }

  flushSubscriberAutoSave()
  selectedSubscriber.value = subscriber
  slideoverOpen.value = true
  resetSubscriberAutoSave({
    name: subscriber.name,
    email: subscriber.primary_email || '',
    phone: subscriber.primary_phone || '',
    role: subscriber.role || '',
    preferred_language: subscriber.preferred_language,
    country: subscriber.country || undefined,
    sources: subscriber.sources || []
  })
  if (updateUrl && import.meta.client) {
    const params = new URLSearchParams()
    if (filterPeopleGroupId.value) params.set('peopleGroup', String(filterPeopleGroupId.value))
    if (route.query.from) params.set('from', route.query.from as string)
    if (route.query.peopleGroupId) params.set('peopleGroupId', route.query.peopleGroupId as string)
    const queryString = params.toString()
    window.history.replaceState({}, '', `/admin/subscribers/${subscriber.id}${queryString ? '?' + queryString : ''}`)
  }

  subscriptionSavers.value = new Map()
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

  try {
    const res = await $fetch<{ groups: { group_id: number; name: string }[] }>(`/api/admin/subscribers/${subscriber.id}/groups`)
    subscriberGroups.value = res.groups
  } catch {
    subscriberGroups.value = []
  }
}

function deselectSubscriber() {
  selectedSubscriber.value = null
  if (import.meta.client) {
    const params = new URLSearchParams()
    if (filterPeopleGroupId.value) params.set('peopleGroup', String(filterPeopleGroupId.value))
    if (route.query.from) params.set('from', route.query.from as string)
    if (route.query.peopleGroupId) params.set('peopleGroupId', route.query.peopleGroupId as string)
    const queryString = params.toString()
    window.history.replaceState({}, '', `/admin/subscribers${queryString ? '?' + queryString : ''}`)
  }
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
  try {
    loadingActivityLog.value = true
    const allActivities: ActivityLogEntry[] = []

    // Fetch subscriber-level and all subscription-level activity in parallel
    const fetches = [
      $fetch<{ activities: ActivityLogEntry[] }>(`/api/admin/activity/subscribers/${subscriber.id}`)
        .catch((err) => { console.error('Failed to load subscriber activity:', err); return { activities: [] as ActivityLogEntry[] } }),
      ...subscriber.subscriptions.map(sub =>
        $fetch<{ activities: ActivityLogEntry[] }>(`/api/admin/subscriptions/${sub.id}/activity`)
          .catch((err) => { console.error(`Failed to load activity for subscription ${sub.id}:`, err); return { activities: [] as ActivityLogEntry[] } })
      )
    ]
    const results = await Promise.all(fetches)
    for (const result of results) {
      allActivities.push(...result.activities)
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
    await $fetch(`/api/admin/subscriptions/${subscription.id}/send-reminder`, {
      method: 'POST'
    })

    toast.add({
      title: 'Reminder Sent',
      description: `Prayer reminder email sent for ${subscription.people_group_name}`,
      color: 'success'
    })

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
    await $fetch(`/api/admin/subscriptions/${subscription.id}/send-followup`, {
      method: 'POST'
    })

    toast.add({
      title: 'Follow-up Sent',
      description: `Commitment check-in email sent for ${subscription.people_group_name}`,
      color: 'success'
    })

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
      await $fetch(`/api/admin/subscriptions/${subscription.id}`, {
        method: 'DELETE'
      })
    }

    await $fetch(`/api/admin/subscribers/${subscriberToDelete.value.id}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Contact deleted',
      color: 'success'
    })

    subscribers.value = subscribers.value.filter(s => s.id !== subscriberToDelete.value!.id)
    slideoverOpen.value = false
    showDeleteModal.value = false
    subscriberToDelete.value = null
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to delete contact',
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
    'FOLLOWUP_RESPONSE': 'Check-in Response',
    'Linked': 'Linked',
    'Unlinked': 'Unlinked'
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
    'FOLLOWUP_RESPONSE': 'primary',
    'Linked': 'success',
    'Unlinked': 'error'
  }
  return colors[eventType] || 'neutral'
}

function getEventIcon(eventType: string): string | undefined {
  const icons: Record<string, string> = {
    'UPDATE': 'i-lucide-pencil',
    'PRAYER': 'i-lucide-hand-helping',
    'EMAIL': 'i-lucide-mail',
    'FOLLOWUP_RESPONSE': 'i-lucide-message-circle',
    'Linked': 'i-lucide-link',
    'Unlinked': 'i-lucide-link-2-off'
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
    'days_of_week': 'Days of Week',
    'consent_doxa_general': 'Doxa General Consent',
    'consent_people_group': 'People Group Consent'
  }
  return names[field] || field.replace(/_/g, ' ')
}

function formatValue(value: any, field?: string): string {
  if (value === null || value === undefined || value === '') {
    return '(empty)'
  }
  if (field === 'country') {
    return getCountryName(String(value))
  }
  if (field === 'consent_doxa_general' || field === 'consent_people_group') {
    return value ? 'Opted In' : 'Opted Out'
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
/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  padding: 0.75rem 0;
}

.stat-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background-color: var(--ui-bg);
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 600;
}

.stat-label {
  font-size: 0.7rem;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

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
  gap: 0.5rem;
  align-items: center;
  font-size: 0.75rem;
}

.prayer-time,
.comment-count {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--ui-text-muted);
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
  max-height: 400px;
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

.activity-detail {
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: var(--color-neutral-600);
}

.activity-link {
  color: var(--color-primary-500);
  text-decoration: underline;
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
  white-space: pre-line;
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
.unverified-notice {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
  color: var(--ui-text-muted);
}

.consents-disabled {
  opacity: 0.4;
}

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

.consent-empty {
  font-size: 0.8rem;
  color: var(--ui-text-muted);
  margin-top: 0.25rem;
}

.people-group-consents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.group-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
}

.group-link {
  font-weight: 500;
  color: var(--ui-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>

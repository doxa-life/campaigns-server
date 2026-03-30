<template>
  <div class="max-w-6xl">
    <h1 class="text-2xl font-bold mb-8">Superadmin Panel</h1>

    <UTabs v-model="activeTab" :items="tabs" class="mb-8">
      <template #content="{ item }">
        <!-- Backups Tab -->
        <div v-if="item.value === 'backups'" class="py-6">
          <h2 class="text-xl font-semibold mb-2">Database Backups</h2>
          <p class="text-[var(--ui-text-muted)] mb-6">Manually trigger a database backup. Backups are automatically stored in S3.</p>

          <UButton
            @click="createBackup"
            :loading="isCreatingBackup"
            variant="outline"
          >
            {{ isCreatingBackup ? 'Creating Backup...' : 'Create Manual Backup' }}
          </UButton>

          <UAlert
            v-if="backupMessage"
            :color="backupMessage.type === 'success' ? 'success' : 'error'"
            :title="backupMessage.text"
            class="mt-4"
          />

          <UCard v-if="lastBackup" class="mt-6">
            <template #header>
              <h3 class="font-semibold">Last Backup Details</h3>
            </template>
            <div class="space-y-2">
              <p><strong>Filename:</strong> {{ lastBackup.filename }}</p>
              <p><strong>Size:</strong> {{ formatBytes(lastBackup.size) }}</p>
              <p><strong>Location:</strong> {{ lastBackup.location }}</p>
            </div>
          </UCard>
        </div>

        <!-- People Groups Tab -->
        <div v-if="item.value === 'people-groups'" class="py-6">
          <!-- Import Descriptions -->
          <div class="border-t border-[var(--ui-border)] pt-8 mt-8">
            <h3 class="text-lg font-medium mb-2">Import People Descriptions</h3>
            <p class="text-[var(--ui-text-muted)] mb-4">Import PeopleDesc values from a CSV file. Matches by PEID to the imb_peid metadata field.</p>

            <UButton
              to="/superadmin/people-groups/import-descriptions"
              variant="outline"
              icon="i-lucide-upload"
            >
              Import Descriptions
            </UButton>
          </div>

          <!-- Batch Translation -->
          <div class="border-t border-[var(--ui-border)] pt-8 mt-8">
            <h3 class="text-lg font-medium mb-2">Batch Translation</h3>
            <p class="text-[var(--ui-text-muted)] mb-4">Translate a translatable field from English to all other languages for all people groups.</p>

            <div class="flex flex-wrap items-end gap-4">
              <div class="w-64">
                <label class="block text-sm font-medium mb-1">Field to translate</label>
                <USelect
                  v-model="selectedTranslateField"
                  :items="translatableFieldOptions"
                  placeholder="Select a field"
                />
              </div>

              <UCheckbox
                v-model="translateOverwrite"
                label="Overwrite existing translations"
              />

              <UButton
                @click="showTranslateConfirmModal = true"
                :disabled="!selectedTranslateField"
                variant="outline"
                icon="i-lucide-languages"
              >
                Translate Field
              </UButton>
            </div>

            <UAlert
              v-if="translateMessage"
              :color="translateMessage.type === 'success' ? 'success' : 'error'"
              :title="translateMessage.text"
              class="mt-4"
            />

            <UCard v-if="translateStats" class="mt-6">
              <template #header>
                <h3 class="font-semibold">Translation Results</h3>
              </template>
              <div class="space-y-2">
                <p><strong>Total with English content:</strong> {{ translateStats.total }}</p>
                <p><strong>Translated:</strong> {{ translateStats.translated }}</p>
                <p><strong>Skipped (already translated):</strong> {{ translateStats.skipped }}</p>
                <p><strong>Errors:</strong> {{ translateStats.errors }}</p>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Libraries Tab -->
        <div v-if="item.value === 'libraries'" class="py-6">
          <h2 class="text-xl font-semibold mb-2">Translate Day in Life Content</h2>
          <p class="text-[var(--ui-text-muted)] mb-6">
            Translate all "Day in the Life" library content from English to all configured languages.
            This creates batch translation jobs for every day_in_life library that has English content.
          </p>

          <div class="flex flex-wrap items-end gap-4">
            <UCheckbox
              v-model="dinlOverwrite"
              label="Overwrite existing translations"
            />

            <UButton
              @click="showDinlConfirmModal = true"
              :disabled="isDinlTranslating"
              variant="outline"
              icon="i-lucide-languages"
            >
              Start Translation
            </UButton>
          </div>

          <UAlert
            v-if="dinlMessage"
            :color="dinlMessage.type === 'success' ? 'success' : 'error'"
            :title="dinlMessage.text"
            class="mt-4"
          />

          <!-- Progress card shown while translating -->
          <UCard v-if="isDinlTranslating && dinlBatchId" class="mt-6">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Translation Progress</h3>
                <UButton
                  size="xs"
                  variant="outline"
                  color="error"
                  @click="cancelDinlTranslation"
                  :loading="isCancellingDinl"
                >
                  Cancel
                </UButton>
              </div>
            </template>
            <div class="space-y-3">
              <UProgress
                :value="dinlProgress.completed + dinlProgress.failed"
                :max="dinlProgress.total"
                size="sm"
              />
              <div class="flex justify-between text-sm text-[var(--ui-text-muted)]">
                <span>{{ dinlProgress.completed + dinlProgress.failed }} of {{ dinlProgress.total }} jobs</span>
                <span v-if="dinlProgress.failed > 0" class="text-red-500">{{ dinlProgress.failed }} failed</span>
              </div>
              <div class="flex gap-4 text-sm">
                <span>Completed: {{ dinlProgress.completed }}</span>
                <span>Processing: {{ dinlProgress.processing }}</span>
                <span>Pending: {{ dinlProgress.pending }}</span>
              </div>
            </div>
          </UCard>

          <!-- Results card shown after completion -->
          <UCard v-if="dinlResults" class="mt-6">
            <template #header>
              <h3 class="font-semibold">Translation Results</h3>
            </template>
            <div class="space-y-2">
              <p><strong>Total Jobs:</strong> {{ dinlResults.total }}</p>
              <p><strong>Completed:</strong> {{ dinlResults.completed }}</p>
              <p><strong>Failed:</strong> {{ dinlResults.failed }}</p>
            </div>
          </UCard>

          <!-- Rebuild Verses -->
          <div class="border-t border-[var(--ui-border)] pt-8 mt-8">
            <h2 class="text-xl font-semibold mb-2">Rebuild Verses</h2>
            <p class="text-[var(--ui-text-muted)] mb-6">
              Re-fetch Bible verse text from the API for selected languages.
              Only verses that were originally fetched from the API will be updated — manually entered verses are left untouched.
            </p>

            <div class="mb-4">
              <label class="block text-sm font-medium mb-1">Languages to rebuild</label>
              <div class="flex gap-2 mb-2 text-sm">
                <button type="button" class="text-[var(--ui-text-highlighted)] hover:underline" @click="selectAllRebuildLanguages">Select all</button>
                <span class="text-[var(--ui-text-muted)]">|</span>
                <button type="button" class="text-[var(--ui-text-highlighted)] hover:underline" @click="clearAllRebuildLanguages">Clear all</button>
              </div>
              <div class="grid grid-cols-2 gap-1.5">
                <UCheckbox
                  v-for="lang in languagesWithBible"
                  :key="lang.code"
                  :model-value="rebuildLanguages.includes(lang.code)"
                  @update:model-value="toggleRebuildLanguage(lang.code, $event)"
                  :label="`${lang.flag} ${lang.name}`"
                />
              </div>
            </div>

            <UButton
              @click="showRebuildConfirmModal = true"
              :disabled="rebuildLanguages.length === 0 || isRebuilding"
              variant="outline"
              icon="i-lucide-refresh-cw"
            >
              Rebuild Verses
            </UButton>

            <UAlert
              v-if="rebuildMessage"
              :color="rebuildMessage.type === 'success' ? 'success' : 'error'"
              :title="rebuildMessage.text"
              class="mt-4"
            />

            <!-- Progress card shown while rebuilding -->
            <UCard v-if="isRebuilding" class="mt-6">
              <template #header>
                <h3 class="font-semibold">Rebuild Progress</h3>
              </template>
              <div class="space-y-3">
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-primary" />
                  <span class="font-medium">{{ rebuildProgress.message }}</span>
                </div>
                <UProgress
                  v-if="rebuildProgress.percent !== undefined"
                  :value="rebuildProgress.percent"
                  size="sm"
                />
                <p v-if="rebuildProgress.detail" class="text-sm text-[var(--ui-text-muted)]">
                  {{ rebuildProgress.detail }}
                </p>
              </div>
            </UCard>

            <!-- Results card shown after completion -->
            <UCard v-if="rebuildStats" class="mt-6">
              <template #header>
                <h3 class="font-semibold">Rebuild Results</h3>
              </template>
              <div class="space-y-2">
                <p><strong>Total Content Rows:</strong> {{ rebuildStats.totalRows }}</p>
                <p><strong>Rows Updated:</strong> {{ rebuildStats.rowsUpdated }}</p>
                <p><strong>Verses Rebuilt:</strong> {{ rebuildStats.versesRebuilt }}</p>
                <p><strong>Errors:</strong> {{ rebuildStats.errors }}</p>
              </div>
              <div v-if="rebuildWarnings.length > 0" class="mt-4 border-t border-[var(--ui-border)] pt-4">
                <p class="text-sm font-medium mb-2">Verse Warnings ({{ rebuildWarnings.length }}):</p>
                <ul class="text-sm text-[var(--ui-text-muted)] space-y-1">
                  <li v-for="(w, i) in rebuildWarnings" :key="i">{{ w.reference }} ({{ w.language }}): {{ w.reason }}</li>
                </ul>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Notifications Tab -->
        <div v-if="item.value === 'notifications'" class="py-6">
          <h2 class="text-xl font-semibold mb-2">Notification Recipients</h2>
          <p class="text-[var(--ui-text-muted)] mb-6">Configure who receives email notifications for different events.</p>

          <div class="space-y-8">
            <div v-for="group in notificationGroups" :key="group.key">
              <UCard>
                <template #header>
                  <div>
                    <h3 class="font-semibold">{{ group.label }}</h3>
                    <p class="text-sm text-[var(--ui-text-muted)]">{{ group.description }}</p>
                  </div>
                </template>

                <div class="space-y-3">
                  <div
                    v-for="recipient in (notificationRecipients[group.key] || [])"
                    :key="recipient.id"
                    class="flex items-center justify-between"
                  >
                    <div>
                      <span class="font-medium">{{ recipient.name || recipient.email }}</span>
                      <span v-if="recipient.name" class="text-[var(--ui-text-muted)] ml-2">{{ recipient.email }}</span>
                    </div>
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      variant="ghost"
                      color="error"
                      @click="removeRecipient(group.key, recipient.id)"
                    />
                  </div>

                  <p v-if="!(notificationRecipients[group.key] || []).length" class="text-[var(--ui-text-muted)] text-sm italic">
                    No recipients configured
                  </p>

                  <div v-if="newRecipient[group.key]" class="flex gap-2 pt-2 border-t border-[var(--ui-border)]">
                    <UInput
                      v-model="newRecipient[group.key]!.name"
                      placeholder="Name (optional)"
                      class="w-40"
                      size="sm"
                    />
                    <UInput
                      v-model="newRecipient[group.key]!.email"
                      placeholder="Email"
                      type="email"
                      class="flex-1"
                      size="sm"
                      @keyup.enter="addRecipient(group.key)"
                    />
                    <UButton
                      icon="i-lucide-plus"
                      size="sm"
                      variant="outline"
                      :disabled="!newRecipient[group.key]!.email"
                      @click="addRecipient(group.key)"
                    >
                      Add
                    </UButton>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </div>

        <!-- Prayer Counts Tab -->
        <div v-if="item.value === 'prayer-counts'" class="py-6">
          <h2 class="text-xl font-semibold mb-2">Prayer Counts</h2>

          <!-- Update Prayer Counts -->
          <div>
            <h3 class="text-lg font-medium mb-2">Update Prayer Counts</h3>
            <p class="text-[var(--ui-text-muted)] mb-4">Update the "People Praying" count for all people groups. This calculates the 7-day average of daily unique prayers.</p>

            <UButton
              @click="updatePrayerCounts"
              :loading="isUpdatingPrayerCounts"
              variant="outline"
            >
              {{ isUpdatingPrayerCounts ? 'Updating...' : 'Save Prayer Counts' }}
            </UButton>

            <UAlert
              v-if="prayerCountsMessage"
              :color="prayerCountsMessage.type === 'success' ? 'success' : 'error'"
              :title="prayerCountsMessage.text"
              class="mt-4"
            />
          </div>
        </div>
      </template>
    </UTabs>

    <!-- DINL Translation Confirmation Modal -->
    <UModal v-model:open="showDinlConfirmModal" title="Confirm Day in Life Translation">
      <template #body>
        <div class="p-6 space-y-4">
          <p>
            This will translate <strong>all Day in the Life libraries</strong> from English to all configured target languages.
          </p>
          <p v-if="dinlOverwrite" class="text-amber-600 dark:text-amber-400">
            Existing translations will be overwritten.
          </p>
          <p v-else>
            Existing translations will be preserved (only missing languages will be translated).
          </p>
          <div class="flex gap-2 justify-end pt-4">
            <UButton
              variant="outline"
              @click="showDinlConfirmModal = false"
            >
              Cancel
            </UButton>
            <UButton
              @click="startDinlTranslation"
              color="primary"
            >
              Start Translation
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Rebuild Verses Confirmation Modal -->
    <UModal v-model:open="showRebuildConfirmModal" title="Confirm Rebuild Verses">
      <template #body>
        <div class="p-6 space-y-4">
          <p>
            This will re-fetch Bible verse text for <strong>all library content</strong> in {{ rebuildLanguages.length }} selected language(s).
          </p>
          <p class="text-amber-600 dark:text-amber-400">
            Existing verse content will be overwritten with fresh data from the Bolls Bible API.
          </p>
          <div class="flex gap-2 justify-end pt-4">
            <UButton
              variant="outline"
              @click="showRebuildConfirmModal = false"
            >
              Cancel
            </UButton>
            <UButton
              @click="startRebuild"
              color="primary"
            >
              Start Rebuild
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Translation Confirmation Modal -->
    <UModal v-model:open="showTranslateConfirmModal" title="Confirm Batch Translation" :close="!isTranslating">
      <template #body>
        <div class="p-6 space-y-4">
          <!-- Pre-translation info -->
          <template v-if="!isTranslating">
            <p>
              This will translate the <strong>{{ selectedFieldLabel }}</strong> field from English to all other languages for all people groups that have English content.
            </p>
            <p v-if="translateOverwrite" class="text-amber-600 dark:text-amber-400">
              Existing translations will be overwritten.
            </p>
            <p v-else>
              Existing translations will be preserved (only missing languages will be translated).
            </p>
          </template>

          <!-- Progress display -->
          <template v-else>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-primary" />
                <span class="font-medium">{{ translateProgress.message }}</span>
              </div>

              <UProgress
                v-if="translateProgress.percent !== undefined"
                :value="translateProgress.percent"
                size="sm"
              />

              <p v-if="translateProgress.detail" class="text-sm text-[var(--ui-text-muted)]">
                {{ translateProgress.detail }}
              </p>
            </div>
          </template>

          <div class="flex gap-2 justify-end pt-4">
            <UButton
              v-if="!isTranslating"
              variant="outline"
              @click="showTranslateConfirmModal = false"
            >
              Cancel
            </UButton>
            <UButton
              v-if="!isTranslating"
              @click="translateField"
              color="primary"
            >
              Start Translation
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { allFields } from '~/utils/people-group-fields'
import { LANGUAGES } from '~/utils/languages'

definePageMeta({
  layout: 'admin',
  middleware: 'superadmin'
})

const tabs = [
  { label: 'Backups', value: 'backups' },
  { label: 'People Groups', value: 'people-groups' },
  { label: 'Libraries', value: 'libraries' },
  { label: 'Prayer Counts', value: 'prayer-counts' },
  { label: 'Notifications', value: 'notifications' },
]

const activeTab = ref('backups')
const isCreatingBackup = ref(false)
const backupMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const lastBackup = ref<{ filename: string; size: number; location: string } | null>(null)

const isUpdatingPrayerCounts = ref(false)
const prayerCountsMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)

// Notification recipients state
const notificationGroups = [
  { key: 'adoption', label: 'Adoption Notifications', description: 'Notified when a new adoption form is submitted' },
  { key: 'stats', label: 'Stats Email', description: 'Daily/weekly activity summary' },
  { key: 'contact_us', label: 'Contact Us', description: 'Notified when someone submits the contact form' },
]

const notificationRecipients = ref<Record<string, Array<{ id: number; email: string; name: string | null }>>>({})
const newRecipient = ref<Record<string, { email: string; name: string }>>(
  Object.fromEntries(notificationGroups.map(g => [g.key, { email: '', name: '' }]))
)

async function fetchNotificationRecipients() {
  try {
    const data = await $fetch<Record<string, Array<{ id: number; email: string; name: string | null }>>>('/api/admin/superadmin/notification-recipients')
    notificationRecipients.value = data
  } catch (error) {
    console.error('Failed to fetch notification recipients:', error)
  }
}

async function addRecipient(groupKey: string) {
  const recipient = newRecipient.value[groupKey]
  if (!recipient) return
  const { email, name } = recipient
  if (!email) return

  try {
    const recipient = await $fetch<{ id: number; email: string; name: string | null }>('/api/admin/superadmin/notification-recipients', {
      method: 'POST',
      body: { group_key: groupKey, email, name: name || undefined }
    })

    if (!notificationRecipients.value[groupKey]) {
      notificationRecipients.value[groupKey] = []
    }
    notificationRecipients.value[groupKey].push(recipient)
    newRecipient.value[groupKey] = { email: '', name: '' }
  } catch (error: any) {
    console.error('Failed to add recipient:', error)
    useToast().add({
      title: error.data?.message || 'Failed to add recipient',
      color: 'error'
    })
  }
}

async function removeRecipient(groupKey: string, id: number) {
  try {
    await $fetch(`/api/admin/superadmin/notification-recipients/${id}`, {
      method: 'DELETE'
    })
    notificationRecipients.value[groupKey] = (notificationRecipients.value[groupKey] ?? []).filter(r => r.id !== id)
  } catch (error) {
    console.error('Failed to remove recipient:', error)
  }
}

fetchNotificationRecipients()

// Translation state
const selectedTranslateField = ref<string | undefined>(undefined)
const translateOverwrite = ref(false)
const showTranslateConfirmModal = ref(false)
const isTranslating = ref(false)
const translateMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const translateStats = ref<{ total: number; translated: number; skipped: number; errors: number } | null>(null)
const translateProgress = ref<{ message: string; detail?: string; percent?: number }>({ message: 'Starting...' })

// DINL Translation state
const dinlOverwrite = ref(false)
const showDinlConfirmModal = ref(false)
const isDinlTranslating = ref(false)
const isCancellingDinl = ref(false)
const dinlBatchId = ref<number | null>(null)
const dinlMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const dinlProgress = ref({ total: 0, pending: 0, processing: 0, completed: 0, failed: 0 })
const dinlResults = ref<{ total: number; completed: number; failed: number } | null>(null)
let dinlPollTimer: ReturnType<typeof setInterval> | null = null

// Rebuild Verses state
const rebuildLanguages = ref<string[]>([])
const isRebuilding = ref(false)
const showRebuildConfirmModal = ref(false)
const rebuildMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const rebuildProgress = ref<{ message: string; detail?: string; percent?: number }>({ message: 'Starting...' })
const rebuildStats = ref<{ totalRows: number; rowsUpdated: number; versesRebuilt: number; errors: number } | null>(null)
const rebuildWarnings = ref<Array<{ reference: string; language: string; reason: string }>>([])

const languagesWithBible = computed(() =>
  LANGUAGES.filter(l => l.bibleId)
)

function toggleRebuildLanguage(code: string, checked: boolean | string) {
  if (checked) {
    if (!rebuildLanguages.value.includes(code)) {
      rebuildLanguages.value.push(code)
    }
  } else {
    rebuildLanguages.value = rebuildLanguages.value.filter(c => c !== code)
  }
}

function selectAllRebuildLanguages() {
  rebuildLanguages.value = languagesWithBible.value.map(l => l.code)
}

function clearAllRebuildLanguages() {
  rebuildLanguages.value = []
}

// Filter to only translatable fields
const translatableFieldOptions = computed(() =>
  allFields
    .filter(f => f.type === 'translatable')
    .map(f => ({
      label: f.key,
      value: f.key
    }))
)

const selectedFieldLabel = computed(() => {
  const field = allFields.find(f => f.key === selectedTranslateField.value)
  return field?.key || selectedTranslateField.value
})

async function createBackup() {
  isCreatingBackup.value = true
  backupMessage.value = null

  try {
    const response = await $fetch<{
      success: boolean
      backup: { filename: string; size: number; location: string }
    }>('/api/admin/backup/create', {
      method: 'POST'
    })

    backupMessage.value = {
      text: 'Backup created successfully!',
      type: 'success'
    }

    lastBackup.value = response.backup
  } catch (error: any) {
    console.error('Backup error:', error)
    backupMessage.value = {
      text: error.data?.message || 'Failed to create backup. Please try again.',
      type: 'error'
    }
  } finally {
    isCreatingBackup.value = false
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

async function updatePrayerCounts() {
  isUpdatingPrayerCounts.value = true
  prayerCountsMessage.value = null

  try {
    await $fetch('/api/admin/superadmin/update-prayer-counts', {
      method: 'POST'
    })

    prayerCountsMessage.value = {
      text: 'Prayer counts updated successfully!',
      type: 'success'
    }
  } catch (error: any) {
    console.error('Prayer counts update error:', error)
    prayerCountsMessage.value = {
      text: error.data?.message || 'Failed to update prayer counts. Please try again.',
      type: 'error'
    }
  } finally {
    isUpdatingPrayerCounts.value = false
  }
}


async function startDinlTranslation() {
  showDinlConfirmModal.value = false
  isDinlTranslating.value = true
  dinlMessage.value = null
  dinlResults.value = null
  dinlProgress.value = { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 }

  try {
    const response = await $fetch<{
      success: boolean
      batchId: number
      totalLibraries: number
      totalJobs: number
      targetLanguages: string[]
    }>('/api/admin/superadmin/translate-dinl', {
      method: 'POST',
      body: { overwrite: dinlOverwrite.value }
    })

    dinlBatchId.value = response.batchId
    dinlProgress.value.total = response.totalJobs
    dinlProgress.value.pending = response.totalJobs

    dinlMessage.value = {
      text: `Queued ${response.totalJobs} jobs for ${response.totalLibraries} libraries`,
      type: 'success'
    }

    // Start polling for progress
    startDinlPolling()
  } catch (error: any) {
    console.error('DINL translation error:', error)
    dinlMessage.value = {
      text: error.data?.message || 'Failed to start translation. Please try again.',
      type: 'error'
    }
    isDinlTranslating.value = false
  }
}

function startDinlPolling() {
  stopDinlPolling()
  dinlPollTimer = setInterval(pollDinlStatus, 2000)
}

function stopDinlPolling() {
  if (dinlPollTimer) {
    clearInterval(dinlPollTimer)
    dinlPollTimer = null
  }
}

async function pollDinlStatus() {
  if (!dinlBatchId.value) return

  try {
    const status = await $fetch<{
      batchId: number
      total: number
      pending: number
      processing: number
      completed: number
      failed: number
      isComplete: boolean
    }>('/api/admin/superadmin/translate-dinl/status', {
      params: { batchId: dinlBatchId.value }
    })

    dinlProgress.value = {
      total: status.total,
      pending: status.pending,
      processing: status.processing,
      completed: status.completed,
      failed: status.failed
    }

    if (status.isComplete) {
      stopDinlPolling()
      isDinlTranslating.value = false
      dinlResults.value = {
        total: status.total,
        completed: status.completed,
        failed: status.failed
      }
      dinlMessage.value = {
        text: `Translation complete: ${status.completed} succeeded, ${status.failed} failed`,
        type: status.failed > 0 ? 'error' : 'success'
      }
    }
  } catch (error: any) {
    console.error('DINL poll error:', error)
  }
}

async function cancelDinlTranslation() {
  if (!dinlBatchId.value) return

  isCancellingDinl.value = true

  try {
    const response = await $fetch<{
      success: boolean
      cancelledCount: number
      stats: { total: number; pending: number; processing: number; completed: number; failed: number }
    }>('/api/admin/superadmin/translate-dinl/cancel', {
      method: 'POST',
      params: { batchId: dinlBatchId.value }
    })

    stopDinlPolling()
    isDinlTranslating.value = false
    dinlResults.value = {
      total: response.stats.total,
      completed: response.stats.completed,
      failed: response.stats.failed
    }
    dinlMessage.value = {
      text: `Cancelled ${response.cancelledCount} pending jobs. ${response.stats.completed} completed before cancellation.`,
      type: 'success'
    }
  } catch (error: any) {
    console.error('DINL cancel error:', error)
    dinlMessage.value = {
      text: error.data?.message || 'Failed to cancel translation.',
      type: 'error'
    }
  } finally {
    isCancellingDinl.value = false
  }
}

onUnmounted(() => {
  stopDinlPolling()
})

async function startRebuild() {
  showRebuildConfirmModal.value = false
  isRebuilding.value = true
  rebuildMessage.value = null
  rebuildStats.value = null
  rebuildWarnings.value = []
  rebuildProgress.value = { message: 'Starting rebuild...' }

  try {
    const response = await fetch('/api/admin/superadmin/rebuild-verses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ languages: rebuildLanguages.value })
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))

          if (eventType === 'progress') {
            rebuildProgress.value = {
              message: data.message,
              detail: data.processed && data.total
                ? `${data.processed} of ${data.total} rows — ${data.versesRebuilt} verses rebuilt`
                : undefined,
              percent: data.processed && data.total
                ? Math.round((data.processed / data.total) * 100)
                : undefined
            }
          } else if (eventType === 'complete') {
            rebuildMessage.value = {
              text: `Rebuild complete: ${data.stats.rowsUpdated} rows updated, ${data.stats.versesRebuilt} verses rebuilt`,
              type: data.success ? 'success' : 'error'
            }
            rebuildStats.value = data.stats
            rebuildWarnings.value = data.warnings || []
          } else if (eventType === 'error') {
            rebuildMessage.value = {
              text: data.message,
              type: 'error'
            }
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Rebuild error:', error)
    rebuildMessage.value = {
      text: error.message || 'Rebuild failed. Please try again.',
      type: 'error'
    }
  } finally {
    isRebuilding.value = false
  }
}

async function translateField() {
  if (!selectedTranslateField.value) return

  isTranslating.value = true
  translateMessage.value = null
  translateStats.value = null
  translateProgress.value = { message: 'Starting translation...' }

  try {
    const response = await fetch('/api/admin/people-groups/translate-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fieldKey: selectedTranslateField.value,
        overwrite: translateOverwrite.value
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events from buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))

          if (eventType === 'progress') {
            translateProgress.value = {
              message: data.message,
              detail: data.saved && data.totalPeopleGroups
                ? `${data.saved} of ${data.totalPeopleGroups}`
                : data.languageIndex && data.totalLanguages
                  ? `Language ${data.languageIndex} of ${data.totalLanguages}`
                  : undefined,
              percent: data.saved && data.totalPeopleGroups
                ? Math.round((data.saved / data.totalPeopleGroups) * 100)
                : data.languageIndex && data.totalLanguages
                  ? Math.round((data.languageIndex / data.totalLanguages) * 100)
                  : undefined
            }
          } else if (eventType === 'complete') {
            translateMessage.value = {
              text: data.message,
              type: data.success ? 'success' : 'error'
            }
            translateStats.value = data.stats
            showTranslateConfirmModal.value = false
          } else if (eventType === 'error') {
            translateMessage.value = {
              text: data.message,
              type: 'error'
            }
            showTranslateConfirmModal.value = false
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Translation error:', error)
    translateMessage.value = {
      text: error.message || 'Translation failed. Please try again.',
      type: 'error'
    }
    showTranslateConfirmModal.value = false
  } finally {
    isTranslating.value = false
  }
}
</script>

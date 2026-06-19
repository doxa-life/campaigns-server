<template>
  <div class="max-w-6xl">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold">User Management</h1>
      <UButton @click="showInviteModal = true" icon="i-lucide-user-plus">
        Invite User
      </UButton>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader" class="w-6 h-6 animate-spin" />
      <span class="ml-2">Loading...</span>
    </div>

    <!-- Error State -->
    <UAlert v-else-if="error" color="error" :title="error" class="mb-6" />

    <!-- Content -->
    <UTabs v-else :items="tabs" default-value="users" class="w-full">
      <template #users>
        <div class="flex flex-col gap-8 pt-4">
          <!-- Users Section -->
          <section>
            <h2 class="text-xl font-semibold mb-4">Active Users</h2>

            <div v-if="users.length === 0" class="text-center py-8 text-[var(--ui-text-muted)] border border-dashed border-[var(--ui-border)] rounded-lg">
              No users found
            </div>

            <UTable v-else :data="users" :columns="userColumns" @select="onUserRowSelect">
              <template #email-cell="{ row }">
                {{ (row.original as User).email }}
              </template>
              <template #display_name-cell="{ row }">
                {{ (row.original as User).display_name || '—' }}
              </template>
              <template #roles-cell="{ row }">
                <div class="flex items-center gap-2 flex-wrap">
                  <UBadge
                    v-for="r in (row.original as User).roles"
                    :key="r.name"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    {{ formatRoleName(r.name) }}
                  </UBadge>
                  <span v-if="(row.original as User).roles.length === 0" class="text-[var(--ui-text-muted)] text-sm">No roles</span>
                </div>
              </template>
              <template #status-cell="{ row }">
                <UBadge :color="(row.original as User).verified ? 'success' : 'neutral'" variant="subtle">
                  {{ (row.original as User).verified ? 'Verified' : 'Unverified' }}
                </UBadge>
              </template>
              <template #access-cell="{ row }">
                <div class="flex gap-2 flex-wrap">
                  <UBadge
                    v-if="(row.original as User).hasScopedAccess"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    People Groups ({{ (row.original as User).peopleGroupCount }})
                  </UBadge>
                  <UBadge
                    v-if="(row.original as User).email_alias"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    icon="i-lucide-mail"
                  >
                    {{ (row.original as User).email_alias }}
                  </UBadge>
                </div>
              </template>
              <template #created-cell="{ row }">
                {{ formatDate((row.original as User).created) }}
              </template>
              <template #actions-cell="{ row }">
                <UButton
                  @click="openUserSlideover(row.original as User)"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-pencil"
                />
              </template>
            </UTable>
          </section>

          <!-- Invitations Section -->
          <section>
            <h2 class="text-xl font-semibold mb-4">Invitations</h2>

            <div v-if="pendingInvitations.length === 0" class="text-center py-8 text-[var(--ui-text-muted)] border border-dashed border-[var(--ui-border)] rounded-lg">
              No pending invitations
            </div>

            <UTable v-else :data="pendingInvitations" :columns="invitationColumns">
              <template #email-cell="{ row }">
                {{ (row.original as Invitation).email }}
              </template>
              <template #inviter-cell="{ row }">
                {{ (row.original as Invitation).inviter_name || (row.original as Invitation).inviter_email }}
              </template>
              <template #status-cell="{ row }">
                <UBadge :color="getStatusColor((row.original as Invitation).status)" variant="subtle">
                  {{ (row.original as Invitation).status }}
                </UBadge>
              </template>
              <template #expires_at-cell="{ row }">
                {{ formatDateTime((row.original as Invitation).expires_at) }}
              </template>
              <template #actions-cell="{ row }">
                <div class="flex gap-2">
                  <UButton
                    @click="resendInvitation((row.original as Invitation).id)"
                    variant="outline"
                    size="xs"
                    :disabled="(row.original as Invitation).status !== 'pending'"
                  >
                    Resend
                  </UButton>
                  <UButton
                    @click="revokeInvitation((row.original as Invitation).id)"
                    color="error"
                    variant="outline"
                    size="xs"
                    :disabled="(row.original as Invitation).status !== 'pending'"
                  >
                    Revoke
                  </UButton>
                </div>
              </template>
            </UTable>
          </section>
        </div>
      </template>

      <template #roles>
        <div class="pt-4 space-y-3">
          <div
            v-for="role in availableRoles"
            :key="role.name"
            class="rounded-lg border border-[var(--ui-border)] overflow-hidden"
          >
            <button
              class="w-full flex items-center justify-between p-4 hover:bg-[var(--ui-bg-elevated)]/50 transition-colors text-left"
              @click="toggleExpandedRole(role.name)"
            >
              <div class="flex items-center gap-3">
                <UIcon
                  :name="roleIcons[role.name] || 'i-lucide-user'"
                  class="size-5 text-[var(--ui-text-muted)]"
                />
                <div>
                  <p class="text-sm font-medium">{{ formatRoleName(role.name) }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ role.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UBadge color="neutral" variant="outline" size="sm">
                  {{ role.permissions.length }} permissions
                </UBadge>
                <UIcon
                  :name="expandedRole === role.name ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-4 text-[var(--ui-text-muted)]"
                />
              </div>
            </button>

            <div v-if="expandedRole === role.name" class="border-t border-[var(--ui-border)] p-4 space-y-4">
              <div v-for="group in getPermissionGroups(role.permissions)" :key="group.label">
                <p class="text-xs font-medium text-[var(--ui-text-muted)] uppercase tracking-wider mb-2">
                  {{ group.label }}
                </p>
                <div class="space-y-1">
                  <div
                    v-for="{ perm, granted, scoped } in group.permissions"
                    :key="perm"
                    class="flex items-center gap-2 py-1 px-2"
                  >
                    <UIcon
                      :name="granted ? 'i-lucide-check' : 'i-lucide-x'"
                      :class="granted ? 'size-4 text-[var(--ui-color-success-500)]' : 'size-4 text-[var(--ui-text-muted)]'"
                    />
                    <span class="text-sm" :class="{ 'text-[var(--ui-text-muted)]': !granted }">{{ permissionDetails[perm]?.title || perm }}</span>
                    <UBadge v-if="scoped" color="warning" variant="subtle" size="xs">Scoped</UBadge>
                    <span class="text-xs text-[var(--ui-text-muted)]">
                      — {{ scoped ? scopedDescriptions[perm] || permissionDetails[perm]?.description : permissionDetails[perm]?.description }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UTabs>

    <!-- User Detail Slideover -->
    <USlideover
      v-model:open="slideoverOpen"
      side="right"
      :ui="{ content: 'sm:max-w-6xl' }"
    >
      <template #header>
        <DialogTitle as="div" class="slideover-header">
          <div class="slideover-header-info">
            <h2>{{ selectedUser?.display_name || selectedUser?.email }}</h2>
          </div>
          <div class="slideover-header-actions">
            <CrmSaveStatus :saving="anySaving" :saved="anySaved" />
            <UButton size="sm" color="error" variant="outline" @click="showDeleteUserConfirm = true">Delete</UButton>
          </div>
          <div class="slideover-close">
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="slideoverOpen = false"
            />
          </div>
        </DialogTitle>
        <DialogDescription class="sr-only">User details</DialogDescription>
      </template>
      <template #body>
        <CrmDetailPanel v-if="selectedUser" :side-tabs="sideTabs">
          <template #details>
            <form @submit.prevent>
              <CrmFormSection title="Account">
                <UFormField label="Email Address" required>
                  <UInput
                    :model-value="formData.email"
                    @update:model-value="v => { formData.email = v }"
                    @blur="flushAutoSave"
                    type="email"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Display Name">
                  <UInput
                    :model-value="formData.display_name"
                    @update:model-value="v => { formData.display_name = v }"
                    @blur="flushAutoSave"
                    type="text"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Verified" help="Unverified users cannot log in.">
                  <USwitch
                    :model-value="formData.verified"
                    @update:model-value="v => { formData.verified = v; fieldChanged('verified', 'immediate') }"
                  />
                </UFormField>
              </CrmFormSection>

              <CrmFormSection title="Roles">
                <div class="space-y-2">
                  <label
                    v-for="role in availableRoles"
                    :key="role.name"
                    class="flex items-center gap-3 p-3 border border-[var(--ui-border)] rounded-lg cursor-pointer hover:bg-[var(--ui-bg-elevated)] transition-colors"
                  >
                    <UCheckbox
                      :model-value="editingRoles.includes(role.name)"
                      :disabled="rolesSaving"
                      @update:model-value="toggleEditingRole(role.name)"
                    />
                    <div class="flex flex-col flex-1">
                      <strong>{{ formatRoleName(role.name) }}</strong>
                      <span class="text-sm text-[var(--ui-text-muted)]">{{ role.description }}</span>
                    </div>
                  </label>
                </div>
              </CrmFormSection>

              <CrmFormSection v-if="selectedUser.hasScopedAccess" title="People Group Access">
                <div v-if="peopleGroupsLoading" class="flex items-center justify-center py-4">
                  <UIcon name="i-lucide-loader" class="w-5 h-5 animate-spin" />
                  <span class="ml-2">Loading people groups...</span>
                </div>
                <UFormField v-else label="Assigned People Groups" help="This user can only access the people groups selected here.">
                  <USelectMenu
                    :model-value="selectedPeopleGroupIds"
                    @update:model-value="v => { selectedPeopleGroupIds = v; savePeopleGroupAccess() }"
                    :items="peopleGroupSelectItems"
                    multiple
                    virtualize
                    value-key="value"
                    placeholder="Search people groups..."
                    class="w-full"
                  />
                </UFormField>
              </CrmFormSection>

              <CrmFormSection v-if="selectedHasLanguageRole" title="Language Access">
                <div v-if="languagesLoading" class="flex items-center justify-center py-4">
                  <UIcon name="i-lucide-loader" class="w-5 h-5 animate-spin" />
                  <span class="ml-2">Loading languages...</span>
                </div>
                <div v-else class="space-y-1">
                  <label
                    v-for="lang in allLanguages"
                    :key="lang.code"
                    class="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-[var(--ui-bg-elevated)] transition-colors"
                  >
                    <UCheckbox
                      :model-value="editingLanguages.includes(lang.code)"
                      :disabled="languagesSaving"
                      @update:model-value="toggleEditingLanguage(lang.code)"
                    />
                    <span class="text-sm">{{ lang.name }}</span>
                    <span class="text-xs text-[var(--ui-text-muted)]">({{ lang.code }})</span>
                  </label>
                </div>
              </CrmFormSection>

              <CrmFormSection title="Inbox Identity">
                <UFormField :label="$t('inbox.identity.alias')">
                  <UInput
                    v-model="inboxIdentityForm.email_alias"
                    @blur="saveInboxIdentity"
                    type="text"
                    placeholder="george"
                    class="w-full"
                  />
                  <template #hint>
                    {{ $t('inbox.identity.aliasHint') }}
                  </template>
                </UFormField>

                <UFormField :label="$t('inbox.identity.signature')">
                  <UTextarea
                    v-model="inboxIdentityForm.email_signature"
                    @blur="saveInboxIdentity"
                    :rows="5"
                    class="w-full"
                  />
                </UFormField>
              </CrmFormSection>

              <CrmFormSection title="Email Notifications">
                <div class="space-y-3">
                  <div v-for="freq in statsFrequencies" :key="freq.key" class="flex items-center justify-between">
                    <span :class="{ 'text-[var(--ui-text-muted)]': !selectedUserStatsEligible }">{{ freq.label }}</span>
                    <USwitch
                      :model-value="notificationsForm.stats[freq.key]"
                      :disabled="!selectedUserStatsEligible"
                      @update:model-value="(val: boolean) => setStat(freq.key, val)"
                    />
                  </div>
                  <p v-if="!selectedUserStatsEligible" class="text-xs text-[var(--ui-text-muted)]">
                    Only admins and progress admins receive stats summary emails.
                  </p>

                  <div class="flex items-center justify-between pt-2 border-t border-[var(--ui-border)]">
                    <span>Adoption notifications</span>
                    <USwitch
                      :model-value="notificationsForm.adoption"
                      @update:model-value="(val: boolean) => saveNotifications({ adoption: val })"
                    />
                  </div>
                  <div class="flex items-center justify-between">
                    <span>Contact-us notifications</span>
                    <USwitch
                      :model-value="notificationsForm.contact_us"
                      @update:model-value="(val: boolean) => saveNotifications({ contact_us: val })"
                    />
                  </div>
                </div>
              </CrmFormSection>

              <CrmFormSection title="Metadata">
                <div class="info-row">
                  <span class="label">User ID:</span>
                  <span class="value monospace">{{ selectedUser.id }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Joined:</span>
                  <span class="value">{{ formatDate(selectedUser.created) }}</span>
                </div>
              </CrmFormSection>
            </form>
          </template>

          <template #side-activity>
            <RecordActivity ref="activityRef" table-name="users" :record-id="selectedUser.id" />
          </template>
        </CrmDetailPanel>
      </template>
    </USlideover>

    <!-- Delete User Confirmation Modal -->
    <ConfirmModal
      v-model:open="showDeleteUserConfirm"
      title="Delete User"
      :message="selectedUser ? `Are you sure you want to delete ${selectedUser.display_name || selectedUser.email}?` : ''"
      warning="This will remove their access, assignments, and pending invitations they sent. This action cannot be undone."
      confirm-text="Delete"
      confirm-color="error"
      :loading="deletingUser"
      @confirm="confirmDeleteUser"
      @cancel="showDeleteUserConfirm = false"
    />

    <!-- Invite User Modal -->
    <UModal v-model:open="showInviteModal" title="Invite User">
      <template #body>
        <form @submit.prevent="handleInvite" class="space-y-4">
          <UFormField label="Email Address" required>
            <UInput
              v-model="inviteForm.email"
              type="email"
              required
              placeholder="user@example.com"
            />
          </UFormField>

          <UFormField label="Roles">
            <div class="space-y-2">
              <label
                v-for="role in availableRoles"
                :key="role.name"
                class="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-[var(--ui-bg-elevated)] transition-colors"
              >
                <UCheckbox
                  :model-value="inviteForm.roles.includes(role.name)"
                  @update:model-value="toggleInviteRole(role.name)"
                />
                <div>
                  <span class="text-sm font-medium">{{ formatRoleName(role.name) }}</span>
                  <span class="text-xs text-[var(--ui-text-muted)]"> — {{ role.description }}</span>
                </div>
              </label>
            </div>
            <template #hint>
              Select roles for this user. Invitation will expire in 7 days.
            </template>
          </UFormField>

          <UAlert v-if="inviteError" color="error" :title="inviteError" />
          <UAlert v-if="inviteSuccess" color="success" title="Invitation sent successfully!" />

          <div class="flex justify-end gap-2 pt-4">
            <UButton @click="showInviteModal = false" variant="outline" type="button">
              Cancel
            </UButton>
            <UButton type="submit" :loading="inviteSubmitting">
              Send Invitation
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Resend Invitation Confirmation Modal -->
    <ConfirmModal
      v-model:open="showResendConfirm"
      title="Resend Invitation"
      message="Are you sure you want to resend this invitation?"
      confirm-text="Resend"
      confirm-color="primary"
      :loading="resending"
      @confirm="confirmResendInvitation"
      @cancel="cancelResendInvitation"
    />

    <!-- Revoke Invitation Confirmation Modal -->
    <ConfirmModal
      v-model:open="showRevokeConfirm"
      title="Revoke Invitation"
      message="Are you sure you want to revoke this invitation?"
      warning="This action cannot be undone."
      confirm-text="Revoke"
      confirm-color="primary"
      :loading="revoking"
      @confirm="confirmRevokeInvitation"
      @cancel="cancelRevokeInvitation"
    />
  </div>
</template>

<script setup lang="ts">
import { DialogTitle, DialogDescription } from 'reka-ui'
import { LANGUAGES } from '~/utils/languages'
import { ROLES, type RoleName } from '~/utils/role-definitions'

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})

interface Role {
  name: string
  description: string
}

interface RoleWithPermissions extends Role {
  permissions: string[]
}

interface User {
  id: string
  email: string
  display_name: string
  verified: boolean
  created: string
  roles: { name: string; description: string }[]
  hasScopedAccess: boolean
  peopleGroupCount: number
  email_alias: string | null
  email_signature: string | null
  superadmin?: boolean
  notification_preferences?: {
    stats: { daily: boolean; weekly: boolean; monthly: boolean; yearly: boolean }
    adoption: boolean
    contact_us: boolean
  } | null
}

interface PeopleGroup {
  id: number
  slug: string
  title: string
  description: string
  status: string
  hasAccess?: boolean
}

interface Invitation {
  id: number
  email: string
  token: string
  invited_by: number
  roles: string[]
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  accepted_at: string | null
  created_at: string
  inviter_name: string
  inviter_email: string
}

const tabs = [
  { label: 'Users', value: 'users', slot: 'users' as const },
  { label: 'Roles', value: 'roles', slot: 'roles' as const }
]

const expandedRole = ref<string | null>(null)

const toggleExpandedRole = (roleName: string) => {
  expandedRole.value = expandedRole.value === roleName ? null : roleName
}

const roleIcons: Record<string, string> = {
  admin: 'i-lucide-shield',
  progress_admin: 'i-lucide-bar-chart-3',
  content_editor: 'i-lucide-book-open',
  language_editor: 'i-lucide-languages',
  people_group_editor: 'i-lucide-users',
  inbox_agent: 'i-lucide-inbox'
}

const permissionGroupLabels: Record<string, string> = {
  people_groups: 'People Groups',
  groups: 'Groups',
  subscribers: 'Subscribers',
  content: 'Content',
  users: 'Users',
  inbox: 'Inbox',
  marketing: 'Marketing'
}

const permissionDetails: Record<string, { title: string; description: string }> = {
  'people_groups.view': { title: 'View People Groups', description: 'View people group records' },
  'people_groups.create': { title: 'Create People Groups', description: 'Create new people groups' },
  'people_groups.edit': { title: 'Edit People Groups', description: 'Edit existing people groups' },
  'people_groups.delete': { title: 'Delete People Groups', description: 'Delete people groups' },
  'groups.view': { title: 'View Groups', description: 'View group records' },
  'groups.create': { title: 'Create Groups', description: 'Create new groups' },
  'groups.edit': { title: 'Edit Groups', description: 'Edit existing groups' },
  'groups.delete': { title: 'Delete Groups', description: 'Delete groups' },
  'subscribers.view': { title: 'View Subscribers', description: 'View subscriber records' },
  'subscribers.create': { title: 'Create Subscribers', description: 'Create new subscribers' },
  'subscribers.edit': { title: 'Edit Subscribers', description: 'Edit existing subscribers' },
  'subscribers.delete': { title: 'Delete Subscribers', description: 'Delete subscribers' },
  'content.view': { title: 'View Content', description: 'View library content' },
  'content.create': { title: 'Create Content', description: 'Create new content' },
  'content.edit': { title: 'Edit Content', description: 'Edit existing content' },
  'content.delete': { title: 'Delete Content', description: 'Delete content' },
  'users.manage': { title: 'Manage Users', description: 'Invite, edit, and manage user roles' },
  'inbox.view': { title: 'View Inbox', description: 'View the shared email inbox and conversations' },
  'inbox.send': { title: 'Send from Inbox', description: 'Reply to and send messages from the shared inbox' },
  'marketing.view': { title: 'View Marketing', description: 'View marketing emails, senders, and survey results' },
  'marketing.send': { title: 'Manage & Send Marketing', description: 'Create/send marketing emails and delete survey responses' }
}

const allPermissions = Object.keys(permissionDetails)

function getPermissionGroups(rolePermissions: string[]) {
  const groups: Record<string, { perm: string; granted: boolean; scoped: boolean }[]> = {}
  for (const perm of allPermissions) {
    const prefix = perm.substring(0, perm.lastIndexOf('.'))
    if (!groups[prefix]) groups[prefix] = []
    const hasExact = rolePermissions.includes(perm)
    const hasScoped = rolePermissions.includes(perm + '_scoped')
    groups[prefix].push({ perm, granted: hasExact || hasScoped, scoped: hasScoped && !hasExact })
  }
  return Object.entries(groups).map(([key, perms]) => ({
    label: permissionGroupLabels[key] || key,
    permissions: perms
  }))
}

const scopedDescriptions: Record<string, string> = {
  'people_groups.view': 'Only assigned people groups',
  'people_groups.edit': 'Only assigned people groups',
  'subscribers.view': 'Only subscribers linked to assigned people groups',
  'subscribers.edit': 'Only subscribers linked to assigned people groups',
  'subscribers.delete': 'Only subscribers linked to assigned people groups',
  'content.view': 'Only libraries linked to assigned people groups',
  'content.create': 'Only in libraries linked to assigned people groups',
  'content.edit': 'Only in libraries linked to assigned people groups',
  'content.delete': 'Only in libraries linked to assigned people groups'
}

const loading = ref(true)
const error = ref('')
const users = ref<User[]>([])
const allInvitations = ref<Invitation[]>([])
const availableRoles = ref<RoleWithPermissions[]>([])
const showInviteModal = ref(false)

const inviteForm = ref({
  email: '',
  roles: [] as string[]
})

const inviteSubmitting = ref(false)
const inviteError = ref('')
const inviteSuccess = ref(false)

// Detail slideover state
const slideoverOpen = ref(false)
const selectedUser = ref<User | null>(null)
const activityRef = ref<{ refresh: () => void } | null>(null)

const sideTabs = [
  { label: 'Activity', slot: 'activity', icon: 'i-lucide-activity' }
]

const selectedHasLanguageRole = computed(() =>
  selectedUser.value?.roles.some(r => r.name === 'language_editor') ?? false
)

// Account fields auto-save (text fields save on blur, verified saves immediately)
const { formData, saving, savedField, fieldChanged, reset: resetAutoSave, flush: flushAutoSave } = useAutoSave(
  { email: '', display_name: '', verified: false },
  {
    saveFn: async (data) => {
      const targetId = selectedUser.value!.id
      await $fetch(`/api/admin/users/${targetId}`, {
        method: 'PUT',
        body: {
          email: data.email,
          display_name: data.display_name,
          verified: data.verified
        }
      })
    },
    onSaved: () => {
      refreshUsers()
      activityRef.value?.refresh()
    },
    onError: (err) => {
      toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to save', color: 'error' })
    }
  }
)

// Roles state
const editingRoles = ref<string[]>([])
const rolesSaving = ref(false)

// People group access state
const availablePeopleGroups = ref<PeopleGroup[]>([])
const selectedPeopleGroupIds = ref<number[]>([])
const peopleGroupsLoading = ref(false)
const peopleGroupsSaving = ref(false)

const peopleGroupSelectItems = computed(() =>
  availablePeopleGroups.value.map(pg => ({
    value: pg.id,
    label: pg.title
  }))
)

// Inbox identity state
const inboxIdentityForm = ref({ email_alias: '', email_signature: '' })
const inboxIdentitySubmitting = ref(false)

// Email notifications state
const statsFrequencies = [
  { key: 'daily', label: 'Daily summary' },
  { key: 'weekly', label: 'Weekly summary' },
  { key: 'monthly', label: 'Monthly summary' },
  { key: 'yearly', label: 'Yearly summary' }
] as const

type NotificationPrefs = {
  stats: { daily: boolean; weekly: boolean; monthly: boolean; yearly: boolean }
  adoption: boolean
  contact_us: boolean
}
const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  stats: { daily: false, weekly: false, monthly: false, yearly: false },
  adoption: false,
  contact_us: false
}
const notificationsForm = ref<NotificationPrefs>(structuredClone(DEFAULT_NOTIFICATION_PREFS))
const notificationsSaving = ref(false)

// Stats summaries only go to admins, progress admins, and superadmins.
const selectedUserStatsEligible = computed(() => {
  const u = selectedUser.value
  if (!u) return false
  return !!u.superadmin || u.roles.some(r => r.name === 'admin' || r.name === 'progress_admin')
})

function setStat(key: 'daily' | 'weekly' | 'monthly' | 'yearly', value: boolean) {
  saveNotifications({ stats: { ...notificationsForm.value.stats, [key]: value } })
}

async function saveNotifications(patch: Partial<NotificationPrefs>) {
  if (!selectedUser.value) return
  if (patch.stats) notificationsForm.value.stats = patch.stats
  if (typeof patch.adoption === 'boolean') notificationsForm.value.adoption = patch.adoption
  if (typeof patch.contact_us === 'boolean') notificationsForm.value.contact_us = patch.contact_us
  notificationsSaving.value = true
  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/notifications`, {
      method: 'PUT',
      body: patch
    })
    flashSectionSaved()
    await refreshUsers()
    activityRef.value?.refresh()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to update notifications',
      color: 'error'
    })
  } finally {
    notificationsSaving.value = false
  }
}

// Language access state
const editingLanguages = ref<string[]>([])
const languagesLoading = ref(false)
const languagesSaving = ref(false)

const allLanguages = computed(() =>
  LANGUAGES.map(l => ({ code: l.code, name: l.name }))
)

// Delete user state
const showDeleteUserConfirm = ref(false)
const deletingUser = ref(false)

// Unified save indicator: the header status reflects the account auto-save plus
// every section that saves on its own (roles, people groups, languages, inbox identity)
const sectionSavedFlash = ref(false)
let sectionSavedTimer: ReturnType<typeof setTimeout> | null = null

function flashSectionSaved() {
  if (sectionSavedTimer) clearTimeout(sectionSavedTimer)
  sectionSavedFlash.value = true
  sectionSavedTimer = setTimeout(() => { sectionSavedFlash.value = false }, 1500)
}

const anySaving = computed(() =>
  saving.value || rolesSaving.value || peopleGroupsSaving.value || languagesSaving.value || inboxIdentitySubmitting.value || notificationsSaving.value
)
const anySaved = computed(() => !!savedField.value || sectionSavedFlash.value)

// Confirm modals state
const showResendConfirm = ref(false)
const resendInvitationId = ref<number | null>(null)
const showRevokeConfirm = ref(false)
const revokeInvitationId = ref<number | null>(null)
const resending = ref(false)
const revoking = ref(false)

// Toast
const toast = useToast()

// Table columns
const userColumns = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'display_name', header: 'Display Name' },
  { accessorKey: 'roles', header: 'Roles' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'access', header: 'Access' },
  { accessorKey: 'created', header: 'Joined' },
  { accessorKey: 'actions', header: '' }
]

const invitationColumns = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'inviter', header: 'Invited By' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'expires_at', header: 'Expires' },
  { accessorKey: 'actions', header: 'Actions' }
]

const pendingInvitations = computed(() => {
  return allInvitations.value.filter(inv => {
    if (inv.status !== 'pending') return false
    const now = new Date()
    const expires = new Date(inv.expires_at)
    return expires > now
  })
})

function formatRoleName(roleName: string): string {
  return ROLES[roleName as RoleName]?.label || roleName
}

function getStatusColor(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'accepted': return 'success'
    case 'pending': return 'warning'
    case 'expired':
    case 'revoked': return 'neutral'
    default: return 'neutral'
  }
}

async function loadData() {
  try {
    loading.value = true
    error.value = ''

    const [usersResponse, invitationsResponse, rolesResponse] = await Promise.all([
      $fetch<{ users: User[] }>('/api/admin/users'),
      $fetch<{ invitations: Invitation[] }>('/api/admin/users/invitations'),
      $fetch<{ roles: RoleWithPermissions[] }>('/api/admin/roles')
    ])

    users.value = usersResponse.users
    allInvitations.value = invitationsResponse.invitations
    availableRoles.value = rolesResponse.roles
  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to load data'
    console.error(err)
  } finally {
    loading.value = false
  }
}

// Detail slideover
function openUserSlideover(user: User) {
  flushAutoSave()
  selectedUser.value = user
  resetAutoSave({
    email: user.email,
    display_name: user.display_name || '',
    verified: user.verified
  })
  const availableNames = availableRoles.value.map(r => r.name)
  editingRoles.value = user.roles.map(r => r.name).filter(n => availableNames.includes(n))
  inboxIdentityForm.value = {
    email_alias: user.email_alias || '',
    email_signature: user.email_signature || ''
  }
  // Merge stored prefs over the defaults so unset/older keys fall back (mirrors the
  // server-side resolveNotificationPreferences — defaults are code-owned, not in the DB).
  const np = user.notification_preferences
  notificationsForm.value = {
    stats: { ...DEFAULT_NOTIFICATION_PREFS.stats, ...(np?.stats ?? {}) },
    adoption: typeof np?.adoption === 'boolean' ? np.adoption : DEFAULT_NOTIFICATION_PREFS.adoption,
    contact_us: typeof np?.contact_us === 'boolean' ? np.contact_us : DEFAULT_NOTIFICATION_PREFS.contact_us
  }
  slideoverOpen.value = true
  if (user.hasScopedAccess) loadPeopleGroupAccess(user)
  if (user.roles.some(r => r.name === 'language_editor')) loadUserLanguages(user)
}

function onUserRowSelect(_e: Event, row: { original: User }) {
  openUserSlideover(row.original)
}

watch(slideoverOpen, (open) => {
  if (!open) flushAutoSave()
})

// When a role change grants scoped access, the People Group Access section appears
// and needs its data loaded.
watch(() => selectedUser.value?.hasScopedAccess, (has, had) => {
  if (has && !had && slideoverOpen.value && selectedUser.value) {
    loadPeopleGroupAccess(selectedUser.value)
  }
})

// Silently refresh the user list (no loading spinner) and keep the selected user in sync
async function refreshUsers() {
  try {
    const usersResponse = await $fetch<{ users: User[] }>('/api/admin/users')
    users.value = usersResponse.users
    if (selectedUser.value) {
      const updated = users.value.find(u => u.id === selectedUser.value!.id)
      if (updated) selectedUser.value = updated
    }
  } catch (err) {
    console.error(err)
  }
}

// Roles
function toggleEditingRole(roleName: string) {
  const idx = editingRoles.value.indexOf(roleName)
  if (idx >= 0) {
    editingRoles.value.splice(idx, 1)
  } else {
    editingRoles.value.push(roleName)
  }
  saveUserRoles()
}

async function saveUserRoles() {
  if (!selectedUser.value) return

  rolesSaving.value = true
  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/role`, {
      method: 'PUT',
      body: { roles: editingRoles.value }
    })

    flashSectionSaved()
    await refreshUsers()
    activityRef.value?.refresh()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to update roles',
      color: 'error'
    })
  } finally {
    rolesSaving.value = false
  }
}

// Delete user
async function confirmDeleteUser() {
  if (!selectedUser.value) return

  try {
    deletingUser.value = true
    await $fetch(`/api/admin/users/${selectedUser.value.id}`, { method: 'DELETE' })

    users.value = users.value.filter(u => u.id !== selectedUser.value!.id)
    showDeleteUserConfirm.value = false
    slideoverOpen.value = false

    toast.add({
      title: 'User deleted',
      color: 'success'
    })
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to delete user',
      color: 'error'
    })
  } finally {
    deletingUser.value = false
  }
}

// Invite
function toggleInviteRole(roleName: string) {
  const idx = inviteForm.value.roles.indexOf(roleName)
  if (idx >= 0) {
    inviteForm.value.roles.splice(idx, 1)
  } else {
    inviteForm.value.roles.push(roleName)
  }
}

async function handleInvite() {
  inviteSubmitting.value = true
  inviteError.value = ''
  inviteSuccess.value = false

  try {
    await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: {
        email: inviteForm.value.email,
        roles: inviteForm.value.roles
      }
    })

    inviteSuccess.value = true
    inviteForm.value.email = ''
    inviteForm.value.roles = []

    await loadData()

    setTimeout(() => {
      showInviteModal.value = false
      inviteSuccess.value = false
    }, 2000)
  } catch (err: any) {
    inviteError.value = err.data?.statusMessage || 'Failed to send invitation'
  } finally {
    inviteSubmitting.value = false
  }
}

// Invitations
function resendInvitation(id: number) {
  resendInvitationId.value = id
  showResendConfirm.value = true
}

async function confirmResendInvitation() {
  if (!resendInvitationId.value) return

  try {
    resending.value = true
    await $fetch(`/api/admin/users/invitations/${resendInvitationId.value}/resend`, {
      method: 'POST'
    })

    toast.add({
      title: 'Success',
      description: 'Invitation resent successfully',
      color: 'success'
    })

    showResendConfirm.value = false
    resendInvitationId.value = null
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to resend invitation',
      color: 'error'
    })
  } finally {
    resending.value = false
  }
}

function cancelResendInvitation() {
  showResendConfirm.value = false
  resendInvitationId.value = null
}

function revokeInvitation(id: number) {
  revokeInvitationId.value = id
  showRevokeConfirm.value = true
}

async function confirmRevokeInvitation() {
  if (!revokeInvitationId.value) return

  try {
    revoking.value = true
    await $fetch(`/api/admin/users/invitations/${revokeInvitationId.value}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Success',
      description: 'Invitation revoked successfully',
      color: 'success'
    })

    showRevokeConfirm.value = false
    revokeInvitationId.value = null

    await loadData()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to revoke invitation',
      color: 'error'
    })
  } finally {
    revoking.value = false
  }
}

function cancelRevokeInvitation() {
  showRevokeConfirm.value = false
  revokeInvitationId.value = null
}

// People group access
async function loadPeopleGroupAccess(user: User) {
  peopleGroupsLoading.value = true

  try {
    const response = await $fetch<{ peopleGroups: PeopleGroup[] }>(`/api/admin/users/${user.id}/people-groups`)
    availablePeopleGroups.value = response.peopleGroups
    selectedPeopleGroupIds.value = response.peopleGroups
      .filter(pg => pg.hasAccess)
      .map(pg => pg.id)
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to load people groups',
      color: 'error'
    })
  } finally {
    peopleGroupsLoading.value = false
  }
}

async function savePeopleGroupAccess() {
  if (!selectedUser.value) return

  peopleGroupsSaving.value = true
  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/people-groups`, {
      method: 'PUT',
      body: {
        people_group_ids: selectedPeopleGroupIds.value
      }
    })

    flashSectionSaved()
    refreshUsers()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to update people group access',
      color: 'error'
    })
  } finally {
    peopleGroupsSaving.value = false
  }
}

// Language access
async function loadUserLanguages(user: User) {
  languagesLoading.value = true

  try {
    const response = await $fetch<{ languages: string[] }>(`/api/admin/users/${user.id}/languages`)
    editingLanguages.value = response.languages
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to load user languages',
      color: 'error'
    })
  } finally {
    languagesLoading.value = false
  }
}

function toggleEditingLanguage(code: string) {
  const idx = editingLanguages.value.indexOf(code)
  if (idx >= 0) {
    editingLanguages.value.splice(idx, 1)
  } else {
    editingLanguages.value.push(code)
  }
  saveUserLanguages()
}

async function saveUserLanguages() {
  if (!selectedUser.value) return

  languagesSaving.value = true
  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/languages`, {
      method: 'PUT',
      body: { language_codes: editingLanguages.value }
    })

    flashSectionSaved()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to update languages',
      color: 'error'
    })
  } finally {
    languagesSaving.value = false
  }
}

// Inbox identity (saved on blur; skipped when nothing changed)
async function saveInboxIdentity() {
  if (!selectedUser.value) return

  const unchanged =
    inboxIdentityForm.value.email_alias === (selectedUser.value.email_alias || '') &&
    inboxIdentityForm.value.email_signature === (selectedUser.value.email_signature || '')
  if (unchanged) return

  inboxIdentitySubmitting.value = true
  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/inbox-identity`, {
      method: 'PUT',
      body: {
        email_alias: inboxIdentityForm.value.email_alias,
        email_signature: inboxIdentityForm.value.email_signature
      }
    })

    flashSectionSaved()
    await refreshUsers()
    activityRef.value?.refresh()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to update inbox identity',
      color: 'error'
    })
  } finally {
    inboxIdentitySubmitting.value = false
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString()
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.slideover-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.slideover-header-info {
  flex: 1;
  min-width: 0;
}

.slideover-header-info h2 {
  margin: 0;
  font-size: 1.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slideover-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.slideover-close {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .slideover-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    position: relative;
  }

  .slideover-header-actions {
    flex-wrap: wrap;
  }

  /* Keep the close button pinned top-right while everything else stacks. */
  .slideover-close {
    position: absolute;
    top: 0;
    right: 0;
  }

  .slideover-header-info {
    padding-right: 2.5rem;
  }
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ui-border);
  font-size: 0.875rem;
}

.info-row .label { font-weight: 500; }
.info-row .value { color: var(--ui-text-muted); }
.monospace { font-family: monospace; }
</style>

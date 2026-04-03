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

            <UTable v-else :data="users" :columns="userColumns">
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
                  <UButton
                    @click="openRolesModal(row.original as User)"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-pencil"
                  />
                </div>
              </template>
              <template #status-cell="{ row }">
                <UBadge :color="(row.original as User).verified ? 'success' : 'neutral'" variant="subtle">
                  {{ (row.original as User).verified ? 'Verified' : 'Unverified' }}
                </UBadge>
              </template>
              <template #access-cell="{ row }">
                <div class="flex gap-2">
                  <UButton
                    v-if="(row.original as User).hasScopedAccess"
                    @click="openPeopleGroupModal(row.original as User)"
                    variant="outline"
                    size="xs"
                  >
                    People Groups ({{ (row.original as User).peopleGroupCount }})
                  </UButton>
                  <span v-if="!(row.original as User).hasScopedAccess" class="text-[var(--ui-text-muted)]">—</span>
                </div>
              </template>
              <template #created-cell="{ row }">
                {{ formatDate((row.original as User).created) }}
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
                  {{ (role as RoleWithPermissions).permissions.length }} permissions
                </UBadge>
                <UIcon
                  :name="expandedRole === role.name ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-4 text-[var(--ui-text-muted)]"
                />
              </div>
            </button>

            <div v-if="expandedRole === role.name" class="border-t border-[var(--ui-border)] p-4 space-y-4">
              <div v-for="group in getPermissionGroups((role as RoleWithPermissions).permissions)" :key="group.label">
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

    <!-- Manage Roles Modal -->
    <UModal v-model:open="showRolesModal" title="Manage Roles">
      <template #body>
        <p class="mb-4">
          Assign roles for <strong>{{ selectedUser?.display_name || selectedUser?.email }}</strong>:
        </p>

        <div class="space-y-2">
          <label
            v-for="role in availableRoles"
            :key="role.name"
            class="flex items-center gap-3 p-3 border border-[var(--ui-border)] rounded-lg cursor-pointer hover:bg-[var(--ui-bg-elevated)] transition-colors"
          >
            <UCheckbox
              :model-value="editingRoles.includes(role.name)"
              @update:model-value="toggleEditingRole(role.name)"
            />
            <div class="flex flex-col flex-1">
              <strong>{{ formatRoleName(role.name) }}</strong>
              <span class="text-sm text-[var(--ui-text-muted)]">{{ role.description }}</span>
            </div>
          </label>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end gap-2">
          <UButton @click="close" variant="outline">
            Cancel
          </UButton>
          <UButton
            @click="saveUserRoles"
            :loading="rolesModalSubmitting"
          >
            Save Changes
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Manage People Groups Modal -->
    <UModal v-model:open="showPeopleGroupModal" title="Manage People Group Access">
      <template #body>
        <p class="mb-4">
          Select which people groups <strong>{{ selectedUser?.display_name || selectedUser?.email }}</strong> can access:
        </p>

        <div v-if="peopleGroupModalLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader" class="w-5 h-5 animate-spin" />
          <span class="ml-2">Loading people groups...</span>
        </div>

        <UAlert v-else-if="peopleGroupModalError" color="error" :title="peopleGroupModalError" class="mb-4" />

        <div v-else>
          <USelectMenu
            v-model="selectedPeopleGroupIds"
            :items="peopleGroupSelectItems"
            multiple
            virtualize
            value-key="value"
            placeholder="Search people groups..."
            class="w-full"
          />
        </div>

        <UAlert v-if="peopleGroupModalSuccess" color="success" title="People group access updated successfully!" class="mt-4" />
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end gap-2">
          <UButton @click="close" variant="outline">
            Cancel
          </UButton>
          <UButton
            @click="savePeopleGroupAccess"
            :loading="peopleGroupModalSubmitting"
          >
            Save Changes
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Manage Languages Modal -->
    <UModal v-model:open="showLanguageModal" title="Manage Language Access">
      <template #body>
        <p class="mb-4">
          Select which languages <strong>{{ selectedUser?.display_name || selectedUser?.email }}</strong> can edit content in:
        </p>

        <div v-if="languageModalLoading" class="flex items-center justify-center py-8">
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
              @update:model-value="toggleEditingLanguage(lang.code)"
            />
            <span class="text-sm">{{ lang.name }}</span>
            <span class="text-xs text-[var(--ui-text-muted)]">({{ lang.code }})</span>
          </label>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end gap-2">
          <UButton @click="close" variant="outline">
            Cancel
          </UButton>
          <UButton
            @click="saveUserLanguages"
            :loading="languageModalSubmitting"
          >
            Save Changes
          </UButton>
        </div>
      </template>
    </UModal>

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
import { LANGUAGES } from '~/utils/languages'

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
  people_group_editor: 'i-lucide-users'
}

const roleDisplayNames: Record<string, string> = {
  admin: 'Admin',
  progress_admin: 'Progress Admin',
  content_editor: 'Content Editor',
  language_editor: 'Language Editor',
  people_group_editor: 'People Group Editor'
}

const permissionGroupLabels: Record<string, string> = {
  people_groups: 'People Groups',
  groups: 'Groups',
  subscribers: 'Subscribers',
  content: 'Content',
  users: 'Users'
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
  'users.manage': { title: 'Manage Users', description: 'Invite, edit, and manage user roles' }
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
  'content.view': 'Only libraries linked to assigned people groups',
  'content.create': 'Only in libraries linked to assigned people groups',
  'content.edit': 'Only in libraries linked to assigned people groups',
  'content.delete': 'Only in libraries linked to assigned people groups'
}

const loading = ref(true)
const error = ref('')
const users = ref<User[]>([])
const allInvitations = ref<Invitation[]>([])
const availableRoles = ref<Role[]>([])
const showInviteModal = ref(false)

const inviteForm = ref({
  email: '',
  roles: [] as string[]
})

const inviteSubmitting = ref(false)
const inviteError = ref('')
const inviteSuccess = ref(false)

// Roles modal state
const showRolesModal = ref(false)
const selectedUser = ref<User | null>(null)
const editingRoles = ref<string[]>([])
const rolesModalSubmitting = ref(false)

// People group modal state
const showPeopleGroupModal = ref(false)
const availablePeopleGroups = ref<PeopleGroup[]>([])
const selectedPeopleGroupIds = ref<number[]>([])
const peopleGroupModalLoading = ref(false)
const peopleGroupModalError = ref('')
const peopleGroupModalSubmitting = ref(false)
const peopleGroupModalSuccess = ref(false)

const peopleGroupSelectItems = computed(() =>
  availablePeopleGroups.value.map(pg => ({
    value: pg.id,
    label: pg.title
  }))
)

// Language modal state
const showLanguageModal = ref(false)
const editingLanguages = ref<string[]>([])
const languageModalLoading = ref(false)
const languageModalSubmitting = ref(false)

const allLanguages = computed(() =>
  LANGUAGES.map(l => ({ code: l.code, name: l.name }))
)

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
  { accessorKey: 'created', header: 'Joined' }
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
  return roleDisplayNames[roleName] || roleName
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
      $fetch<{ roles: Role[] }>('/api/admin/roles')
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

// Roles modal
function openRolesModal(user: User) {
  selectedUser.value = user
  editingRoles.value = user.roles.map(r => r.name)
  showRolesModal.value = true
}

function toggleEditingRole(roleName: string) {
  const idx = editingRoles.value.indexOf(roleName)
  if (idx >= 0) {
    editingRoles.value.splice(idx, 1)
  } else {
    editingRoles.value.push(roleName)
  }
}

async function saveUserRoles() {
  if (!selectedUser.value) return

  rolesModalSubmitting.value = true
  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/role`, {
      method: 'PUT',
      body: { roles: editingRoles.value }
    })

    toast.add({
      title: 'Success',
      description: 'User roles updated',
      color: 'success'
    })

    showRolesModal.value = false
    await loadData()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to update roles',
      color: 'error'
    })
  } finally {
    rolesModalSubmitting.value = false
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

// People group modal
async function openPeopleGroupModal(user: User) {
  selectedUser.value = user
  showPeopleGroupModal.value = true
  peopleGroupModalError.value = ''
  peopleGroupModalSuccess.value = false
  peopleGroupModalLoading.value = true

  try {
    const response = await $fetch<{ peopleGroups: PeopleGroup[] }>(`/api/admin/users/${user.id}/people-groups`)
    availablePeopleGroups.value = response.peopleGroups
    selectedPeopleGroupIds.value = response.peopleGroups
      .filter(pg => pg.hasAccess)
      .map(pg => pg.id)
  } catch (err: any) {
    peopleGroupModalError.value = err.data?.statusMessage || 'Failed to load people groups'
  } finally {
    peopleGroupModalLoading.value = false
  }
}

async function savePeopleGroupAccess() {
  if (!selectedUser.value) return

  peopleGroupModalSubmitting.value = true
  peopleGroupModalError.value = ''
  peopleGroupModalSuccess.value = false

  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/people-groups`, {
      method: 'PUT',
      body: {
        people_group_ids: selectedPeopleGroupIds.value
      }
    })

    peopleGroupModalSuccess.value = true
    toast.add({
      title: 'Success',
      description: 'People group access updated successfully',
      color: 'success'
    })

    setTimeout(() => {
      showPeopleGroupModal.value = false
      peopleGroupModalSuccess.value = false
    }, 1500)
  } catch (err: any) {
    peopleGroupModalError.value = err.data?.statusMessage || 'Failed to update people group access'
  } finally {
    peopleGroupModalSubmitting.value = false
  }
}

// Language modal
async function openLanguageModal(user: User) {
  selectedUser.value = user
  showLanguageModal.value = true
  languageModalLoading.value = true

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
    languageModalLoading.value = false
  }
}

function toggleEditingLanguage(code: string) {
  const idx = editingLanguages.value.indexOf(code)
  if (idx >= 0) {
    editingLanguages.value.splice(idx, 1)
  } else {
    editingLanguages.value.push(code)
  }
}

async function saveUserLanguages() {
  if (!selectedUser.value) return

  languageModalSubmitting.value = true
  try {
    await $fetch(`/api/admin/users/${selectedUser.value.id}/languages`, {
      method: 'PUT',
      body: { language_codes: editingLanguages.value }
    })

    toast.add({
      title: 'Success',
      description: 'Language access updated',
      color: 'success'
    })

    showLanguageModal.value = false
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to update languages',
      color: 'error'
    })
  } finally {
    languageModalSubmitting.value = false
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

<template>
  <div class="max-w-3xl">
    <h1 class="text-2xl font-bold mb-8">Profile</h1>

    <!-- Account Information -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Account Information</h2>
      </template>
      <div class="space-y-2">
        <div>
          <span class="text-sm text-[var(--ui-text-muted)]">Email</span>
          <p>{{ user?.email }}</p>
        </div>
        <div>
          <span class="text-sm text-[var(--ui-text-muted)]">Member since</span>
          <p>{{ user?.created ? new Date(user.created).toLocaleDateString() : '—' }}</p>
        </div>
      </div>
    </UCard>

    <!-- Change Display Name -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Change Display Name</h2>
      </template>
      <form @submit.prevent="handleNameChange" class="space-y-4">
        <UAlert v-if="name.error" color="error" :title="name.error" />
        <UAlert v-if="name.success" color="success" :title="name.success" />
        <UFormField label="Display Name">
          <UInput v-model="name.value" size="lg" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="name.loading" :disabled="!name.value.trim()">
          Save Name
        </UButton>
      </form>
    </UCard>

    <!-- Change Email -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Change Email Address</h2>
      </template>
      <form @submit.prevent="handleEmailChange" class="space-y-4">
        <UAlert v-if="email.error" color="error" :title="email.error" />
        <UAlert v-if="email.success" color="success" :title="email.success" />
        <UFormField label="New Email">
          <UInput v-model="email.newEmail" type="email" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="Current Password">
          <UInput v-model="email.password" type="password" size="lg" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="email.loading" :disabled="!email.newEmail.trim() || !email.password">
          Change Email
        </UButton>
      </form>
    </UCard>

    <!-- Change Password -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Change Password</h2>
      </template>
      <form @submit.prevent="handlePasswordChange" class="space-y-4">
        <UAlert v-if="password.error" color="error" :title="password.error" />
        <UAlert v-if="password.success" color="success" :title="password.success" />
        <UFormField label="Current Password">
          <UInput v-model="password.current" type="password" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="New Password">
          <UInput v-model="password.newPassword" type="password" size="lg" class="w-full" />
        </UFormField>
        <div v-if="password.newPassword" class="text-sm">
          <div class="flex items-center gap-2 mb-1">
            <div class="flex-1 h-1.5 rounded-full bg-[var(--ui-bg-elevated)]">
              <div
                class="h-full rounded-full transition-all"
                :class="passwordStrengthColor"
                :style="{ width: passwordStrengthPercent + '%' }"
              />
            </div>
            <span :class="passwordStrengthColor.replace('bg-', 'text-')">{{ passwordStrengthLabel }}</span>
          </div>
        </div>
        <UFormField label="Confirm Password">
          <UInput v-model="password.confirm" type="password" size="lg" class="w-full" />
        </UFormField>
        <p v-if="password.confirm && password.confirm !== password.newPassword" class="text-sm text-[var(--ui-error)]">
          Passwords do not match
        </p>
        <UButton
          type="submit"
          :loading="password.loading"
          :disabled="!password.current || !password.newPassword || password.newPassword.length < 8 || password.newPassword !== password.confirm"
        >
          Change Password
        </UButton>
      </form>
    </UCard>

    <!-- API Keys (admin only) -->
    <UCard v-if="isAdmin" class="mb-6">
      <template #header>
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-semibold">API Keys</h2>
          <UButton @click="showCreateModal = true" icon="i-lucide-plus" size="sm">
            Create Key
          </UButton>
        </div>
      </template>

      <div v-if="apiKeysLoading" class="flex items-center justify-center py-8">
        <UIcon name="i-lucide-loader" class="w-5 h-5 animate-spin" />
        <span class="ml-2 text-sm">Loading...</span>
      </div>

      <div v-else-if="apiKeys.length === 0" class="text-center py-8 text-[var(--ui-text-muted)]">
        No API keys yet. Create one to get programmatic access.
      </div>

      <UTable v-else :data="apiKeys" :columns="apiKeyColumns">
        <template #name-cell="{ row }">
          {{ row.original.name }}
        </template>
        <template #key_prefix-cell="{ row }">
          <code class="text-sm">{{ row.original.key_prefix }}...</code>
        </template>
        <template #created_at-cell="{ row }">
          {{ new Date(row.original.created_at).toLocaleDateString() }}
        </template>
        <template #last_used_at-cell="{ row }">
          {{ row.original.last_used_at ? new Date(row.original.last_used_at).toLocaleDateString() : 'Never' }}
        </template>
        <template #actions-cell="{ row }">
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            @click="keyToRevoke = row.original"
          >
            Revoke
          </UButton>
        </template>
      </UTable>
    </UCard>

    <!-- Sign Out -->
    <UCard>
      <UButton color="neutral" variant="outline" @click="handleLogout" icon="i-lucide-log-out">
        Sign Out
      </UButton>
    </UCard>

    <!-- Create API Key Modal -->
    <UModal v-model:open="showCreateModal" title="Create API Key">
      <template #body>
        <div v-if="!createdKey" class="space-y-4 p-4">
          <UFormField label="Key Name">
            <UInput
              v-model="newKeyName"
              placeholder="e.g. CI/CD Pipeline"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <div class="flex gap-2 justify-end">
            <UButton variant="outline" @click="showCreateModal = false">Cancel</UButton>
            <UButton :loading="createKeyLoading" :disabled="!newKeyName.trim()" @click="handleCreateKey">
              Create
            </UButton>
          </div>
        </div>
        <div v-else class="space-y-4 p-4">
          <UAlert color="warning" title="Copy this key now. It won't be shown again." />
          <div class="flex gap-2 items-center">
            <UInput :model-value="createdKey" readonly size="lg" class="flex-1 font-mono" />
            <UButton icon="i-lucide-copy" variant="outline" @click="copyKey">
              {{ copied ? 'Copied!' : 'Copy' }}
            </UButton>
          </div>
          <div class="flex justify-end">
            <UButton @click="closeCreateModal">Done</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Revoke Confirm Modal -->
    <ConfirmModal
      v-if="keyToRevoke"
      :open="!!keyToRevoke"
      title="Revoke API Key"
      :message="`Are you sure you want to revoke '${keyToRevoke.name}'?`"
      warning="Any applications using this key will immediately lose access."
      confirm-text="Revoke"
      confirm-color="error"
      :loading="revokeLoading"
      @update:open="keyToRevoke = null"
      @confirm="handleRevokeKey"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['auth']
})

const { user, logout, checkAuth, isAdmin } = useAuthUser()
const toast = useToast()

// --- Display Name ---
const name = reactive({
  value: user.value?.display_name || '',
  loading: false,
  error: '',
  success: ''
})

watch(() => user.value?.display_name, (val) => {
  if (val) name.value = val
})

async function handleNameChange() {
  name.error = ''
  name.success = ''
  name.loading = true
  try {
    await $fetch('/api/profile/name', {
      method: 'PATCH',
      body: { display_name: name.value.trim() }
    })
    name.success = 'Display name updated'
    await checkAuth()
  } catch (err: any) {
    name.error = err.data?.statusMessage || 'Failed to update name'
  } finally {
    name.loading = false
  }
}

// --- Email ---
const email = reactive({
  newEmail: '',
  password: '',
  loading: false,
  error: '',
  success: ''
})

async function handleEmailChange() {
  email.error = ''
  email.success = ''
  email.loading = true
  try {
    await $fetch('/api/profile/email', {
      method: 'POST',
      body: { new_email: email.newEmail.trim(), current_password: email.password }
    })
    email.success = 'Verification email sent! Please check your new email address.'
    email.newEmail = ''
    email.password = ''
  } catch (err: any) {
    email.error = err.data?.statusMessage || 'Failed to change email'
  } finally {
    email.loading = false
  }
}

// --- Password ---
const password = reactive({
  current: '',
  newPassword: '',
  confirm: '',
  loading: false,
  error: '',
  success: ''
})

const passwordStrength = computed(() => {
  const p = password.newPassword
  if (!p) return 0
  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/\d/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  return score
})

const passwordStrengthPercent = computed(() => (passwordStrength.value / 5) * 100)
const passwordStrengthLabel = computed(() => {
  if (passwordStrength.value <= 1) return 'Weak'
  if (passwordStrength.value <= 3) return 'Fair'
  return 'Strong'
})
const passwordStrengthColor = computed(() => {
  if (passwordStrength.value <= 1) return 'bg-red-500'
  if (passwordStrength.value <= 3) return 'bg-yellow-500'
  return 'bg-green-500'
})

async function handlePasswordChange() {
  password.error = ''
  password.success = ''
  password.loading = true
  try {
    await $fetch('/api/profile/password', {
      method: 'PATCH',
      body: { current_password: password.current, new_password: password.newPassword }
    })
    password.success = 'Password changed successfully'
    password.current = ''
    password.newPassword = ''
    password.confirm = ''
  } catch (err: any) {
    password.error = err.data?.statusMessage || 'Failed to change password'
  } finally {
    password.loading = false
  }
}

// --- API Keys ---
interface ApiKey {
  id: number
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
}

const apiKeys = ref<ApiKey[]>([])
const apiKeysLoading = ref(true)

const apiKeyColumns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'key_prefix', header: 'Key' },
  { accessorKey: 'created_at', header: 'Created' },
  { accessorKey: 'last_used_at', header: 'Last Used' },
  { accessorKey: 'actions', header: '' }
]

async function fetchApiKeys() {
  apiKeysLoading.value = true
  try {
    const data = await $fetch('/api/admin/api-keys')
    apiKeys.value = data.keys
  } catch {
    toast.add({ title: 'Failed to load API keys', color: 'error' })
  } finally {
    apiKeysLoading.value = false
  }
}

// Create key
const showCreateModal = ref(false)
const newKeyName = ref('')
const createdKey = ref('')
const createKeyLoading = ref(false)
const copied = ref(false)

async function handleCreateKey() {
  createKeyLoading.value = true
  try {
    const data = await $fetch('/api/admin/api-keys', {
      method: 'POST',
      body: { name: newKeyName.value.trim() }
    })
    createdKey.value = data.plaintext_key
    await fetchApiKeys()
  } catch (err: any) {
    toast.add({ title: err.data?.statusMessage || 'Failed to create key', color: 'error' })
  } finally {
    createKeyLoading.value = false
  }
}

function copyKey() {
  navigator.clipboard.writeText(createdKey.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function closeCreateModal() {
  showCreateModal.value = false
  newKeyName.value = ''
  createdKey.value = ''
  copied.value = false
}

// Revoke key
const keyToRevoke = ref<ApiKey | null>(null)
const revokeLoading = ref(false)

async function handleRevokeKey() {
  if (!keyToRevoke.value) return
  revokeLoading.value = true
  try {
    await $fetch(`/api/admin/api-keys/${keyToRevoke.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'API key revoked', color: 'success' })
    keyToRevoke.value = null
    await fetchApiKeys()
  } catch (err: any) {
    toast.add({ title: err.data?.statusMessage || 'Failed to revoke key', color: 'error' })
  } finally {
    revokeLoading.value = false
  }
}

// --- Logout ---
async function handleLogout() {
  await logout()
  navigateTo('/')
}

onMounted(() => {
  if (isAdmin.value) {
    fetchApiKeys()
  }
})
</script>

<template>
  <div class="admin-layout">
    <!-- Mobile header with hamburger -->
    <div class="mobile-header">
      <UButton
        icon="i-lucide-menu"
        variant="ghost"
        @click="sidebarOpen = true"
      />
      <span class="mobile-title">{{ config.public.appName || 'Base' }} Admin</span>
    </div>

    <nav class="sidebar" :class="{ open: sidebarOpen, collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <div v-if="showExpanded" class="header-row">
          <h1 class="logo">{{ config.public.appName || 'Base' }} Admin</h1>
          <button class="collapse-toggle" @click="toggleCollapsed" title="Collapse sidebar">
            <UIcon name="i-lucide-panel-left-close" />
          </button>
        </div>
        <template v-else>
          <img src="/favicon-32x32.png" alt="Logo" class="logo-icon" />
          <button class="collapse-toggle" @click="toggleCollapsed" title="Expand sidebar">
            <UIcon name="i-lucide-panel-left-open" />
          </button>
        </template>
      </div>

      <ul class="nav-menu" v-if="hasRole">
        <li>
          <NuxtLink to="/admin" class="nav-link" :class="{ 'router-link-active': route.path === '/admin' }" :title="!showExpanded ? 'Dashboard' : undefined">
            <UIcon name="i-lucide-layout-dashboard" />
            <span v-if="showExpanded" class="nav-label">Dashboard</span>
          </NuxtLink>
        </li>
        <li v-if="canAccess('people_groups.view')">
          <NuxtLink to="/admin/people-groups" class="nav-link" :title="!showExpanded ? 'People Groups' : undefined">
            <UIcon name="i-lucide-globe" />
            <span v-if="showExpanded" class="nav-label">People Groups</span>
          </NuxtLink>
        </li>
        <li v-if="canAccess('subscribers.view')">
          <NuxtLink to="/admin/subscribers" class="nav-link" :title="!showExpanded ? 'Contacts' : undefined">
            <UIcon name="i-lucide-user" />
            <span v-if="showExpanded" class="nav-label">Contacts</span>
          </NuxtLink>
        </li>
        <li v-if="canAccess('groups.view')">
          <NuxtLink to="/admin/groups" class="nav-link" :title="!showExpanded ? 'Groups' : undefined">
            <UIcon name="i-lucide-users" />
            <span v-if="showExpanded" class="nav-label">Groups</span>
          </NuxtLink>
        </li>
        <li v-if="canAccess('content.view')">
          <NuxtLink to="/admin/libraries" class="nav-link" :title="!showExpanded ? 'Libraries' : undefined">
            <UIcon name="i-lucide-book-open" />
            <span v-if="showExpanded" class="nav-label">Libraries</span>
          </NuxtLink>
        </li>
        <li v-if="canAccess('users.manage')">
          <NuxtLink to="/admin/users" class="nav-link" :title="!showExpanded ? 'Users' : undefined">
            <UIcon name="i-lucide-user-cog" />
            <span v-if="showExpanded" class="nav-label">Users</span>
          </NuxtLink>
        </li>
        <li v-if="isSuperAdmin">
          <NuxtLink to="/superadmin" class="nav-link" :title="!showExpanded ? 'Superadmin' : undefined">
            <UIcon name="i-lucide-shield" />
            <span v-if="showExpanded" class="nav-label">Superadmin</span>
          </NuxtLink>
        </li>
      </ul>
      <div v-if="!hasRole" class="nav-menu"></div>

      <div class="sidebar-footer">
        <NuxtLink v-if="user && !sidebarCollapsed" to="/admin/profile" class="user-name-link">
          {{ user.display_name || user.email }}
        </NuxtLink>
        <NuxtLink v-else-if="user && !showExpanded" to="/admin/profile" class="nav-link footer-icon" :title="user.display_name || user.email">
          <UIcon name="i-lucide-circle-user" />
        </NuxtLink>
        <ThemeToggle v-if="showExpanded" />
      </div>
    </nav>

    <!-- Mobile backdrop -->
    <div
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      @click="sidebarOpen = false"
    />

    <div class="main-wrapper">
      <main class="main-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const { user, isAdmin, isSuperAdmin, hasRole, canAccess, checkAuth } = useAuthUser()

const route = useRoute()
const sidebarOpen = ref(false)
const sidebarCollapsed = ref(true)

// On mobile when sidebar is open, show full labels regardless of collapsed state
const showExpanded = computed(() => !sidebarCollapsed.value || sidebarOpen.value)

// Close sidebar on route change
watch(() => route.path, () => {
  sidebarOpen.value = false
})

function toggleCollapsed() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  if (import.meta.client) {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed.value))
  }
}

onMounted(async () => {
  // Restore collapsed state (default collapsed unless user explicitly expanded)
  const stored = localStorage.getItem('sidebar-collapsed')
  if (stored === 'false') {
    sidebarCollapsed.value = false
  }

  try {
    await checkAuth()
    if (user.value && !hasRole.value && route.path !== '/admin/pending-approval') {
      navigateTo('/admin/pending-approval')
    }
  } catch (error) {
    navigateTo('/')
  }
})
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background-color: var(--ui-bg);
  color: var(--ui-text);
}

.sidebar {
  width: 250px;
  flex-shrink: 0;
  background-color: var(--color-forest-500);
  color: #ffffff;
  border-right: none;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 60px;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sidebar.collapsed .sidebar-header {
  align-items: center;
  padding: 0.75rem;
  gap: 0.25rem;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.logo {
  font-size: 1.25rem;
  margin: 0;
  color: #ffffff;
  white-space: nowrap;
}

.logo-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
}

.collapse-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  border-radius: 6px;
  flex-shrink: 0;
  transition: background-color 0.2s, color 0.2s;
}

.collapse-toggle:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.nav-menu {
  list-style: none;
  padding: 0.5rem 0;
  margin: 0;
  flex: 1;
}

.nav-menu li {
  margin: 0;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: background-color 0.2s, color 0.2s;
  white-space: nowrap;
}

.sidebar.collapsed .nav-link {
  justify-content: center;
  padding: 0.75rem;
}

.nav-link:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.nav-link.router-link-active {
  background-color: rgba(255, 255, 255, 0.15);
  border-right: 3px solid #ffffff;
  color: #ffffff;
}

.nav-label {
  overflow: hidden;
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.sidebar.collapsed .sidebar-footer {
  flex-direction: column;
  padding: 0.5rem;
  gap: 0;
}

.footer-icon {
  padding: 0.5rem;
}

.user-name-link {
  font-weight: 600;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: opacity 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-name-link:hover {
  opacity: 0.7;
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--ui-bg);
  min-width: 0;
}

.main-content {
  flex: 1;
  padding: 2rem;
  width: 100%;
}

/* Mobile header - hidden on desktop */
.mobile-header {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: var(--color-forest-500);
  color: #ffffff;
  border-bottom: none;
}

.mobile-title {
  font-weight: 600;
  font-size: 1rem;
}

/* Mobile backdrop */
.sidebar-backdrop {
  display: none;
}

/* Mobile responsive styles */
@media (max-width: 1024px) {
  .admin-layout {
    flex-direction: column;
  }

  .mobile-header {
    display: flex;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 50;
    width: 250px !important;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  /* Always show labels on mobile (sidebar is overlay) */
  .sidebar.collapsed .nav-link {
    justify-content: flex-start;
    padding: 0.75rem 1rem;
  }

  .sidebar.collapsed .sidebar-header {
    align-items: stretch;
  }

  .sidebar.collapsed .sidebar-footer {
    flex-direction: row;
    padding: 1rem;
  }

  .collapse-toggle {
    display: none;
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 40;
  }

  .main-content {
    padding: 1rem;
  }
}
</style>

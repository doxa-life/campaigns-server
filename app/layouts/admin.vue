<template>
  <div class="admin-layout">
    <!-- Mobile header with hamburger -->
    <div class="mobile-header">
      <UButton
        icon="i-lucide-menu"
        variant="ghost"
        @click="() => { sidebarOpen = true }"
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
        <template v-for="item in navItems" :key="item.to">
          <li>
            <NuxtLink
              :to="item.to"
              class="nav-link"
              :class="{ 'router-link-active': item.exact && route.path === item.to }"
              :title="!showExpanded ? item.label : undefined"
            >
              <UIcon :name="item.icon" />
              <span v-if="showExpanded" class="nav-label">{{ item.label }}</span>
            </NuxtLink>
          </li>
          <li v-for="child in item.children" :key="child.to" class="nav-child">
            <NuxtLink
              :to="child.to"
              class="nav-link"
              :title="!showExpanded ? child.label : undefined"
            >
              <UIcon :name="child.icon" />
              <span v-if="showExpanded" class="nav-label">{{ child.label }}</span>
            </NuxtLink>
          </li>
        </template>
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
      <main class="main-content" :class="{ 'main-content-flush': isFlushPage }">
        <slot />
      </main>
    </div>

    <ContextAssistantLauncher v-if="hasRole" />
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const { user, isAdmin, hasRole, canAccess, canAccessUnscoped, checkAuth } = useAuthUser()

const route = useRoute()
const sidebarOpen = ref(false)
const sidebarCollapsed = ref(true)

interface NavItem {
  label: string
  to: string
  icon: string
  show: boolean
  exact?: boolean
  children?: NavItem[]
}

// Sidebar order and grouping. A child is hidden along with its parent, since
// every role granting a child's permission also grants the parent's.
const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    {
      label: 'Dashboard',
      to: '/admin',
      icon: 'i-lucide-layout-dashboard',
      show: true,
      exact: true,
      children: [
        { label: 'Context', to: '/admin/context', icon: 'i-lucide-book-open-text', show: canAccess('context.view') },
        { label: 'Inbox', to: '/admin/inbox', icon: 'i-lucide-inbox', show: canAccess('inbox.view') },
        { label: 'Marketing', to: '/admin/marketing', icon: 'i-lucide-megaphone', show: canAccess('marketing.view') }
      ]
    },
    { label: 'Prayer Libraries', to: '/admin/libraries', icon: 'i-lucide-book-open', show: canAccessUnscoped('content.view') },
    { label: 'Translation / Glossary', to: '/admin/glossary', icon: 'i-lucide-languages', show: canAccess('glossary.view') },
    {
      label: 'People Group Data',
      to: '/admin/people-groups',
      icon: 'i-lucide-globe',
      show: canAccess('people_groups.view'),
      children: [
        { label: 'Reports', to: '/admin/people-groups/reports', icon: 'i-lucide-file-text', show: canAccess('people_groups.view') },
        { label: 'Updates Tracking', to: '/admin/onboarding', icon: 'i-lucide-clipboard-list', show: canAccess('people_groups.edit') }
      ]
    },
    { label: 'Contacts', to: '/admin/subscribers', icon: 'i-lucide-user', show: canAccess('subscribers.view') },
    { label: 'Groups (Adoption)', to: '/admin/groups', icon: 'i-lucide-users', show: canAccess('groups.view') },
    { label: 'Churches', to: '/admin/churches', icon: 'i-lucide-church', show: canAccess('churches.view') },
    { label: 'Users', to: '/admin/users', icon: 'i-lucide-user-cog', show: canAccess('users.manage') },
    { label: 'Settings', to: '/settings', icon: 'i-lucide-settings', show: isAdmin.value }
  ]

  return items
    .filter(item => item.show)
    .map(item => ({ ...item, children: item.children?.filter(child => child.show) }))
})

// Context lays out its own full-height panes with their own padding, so the
// main area gives it the bare viewport instead of the usual page padding.
const isFlushPage = computed(() => /(^|\/)admin\/context(\/|$)/.test(route.path))

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

.admin-layout:has(.main-content-flush) {
  height: 100vh;
  min-height: 0;
  overflow: hidden;
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

.nav-child .nav-link {
  padding-left: 2.25rem;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.65);
}

.nav-child .nav-link:hover,
.nav-child .nav-link.router-link-active {
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
  min-height: 0;
}

.main-content {
  flex: 1;
  padding: 2rem;
  width: 100%;
}

/* A page that fills the viewport itself: no page padding, and no page-level
   scroll, so the panes inside it scroll independently. Written with both
   classes so it outranks the narrow-screen `.main-content` padding further
   down this stylesheet. */
.main-content.main-content-flush {
  padding: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

  .sidebar.collapsed .nav-child .nav-link {
    padding-left: 2.25rem;
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

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

    <nav class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <h1 class="logo">{{ config.public.appName || 'Base' }} Admin</h1>
        <LanguageSwitcher />
      </div>

      <ul class="nav-menu" v-if="hasRole">
        <li v-if="isAdmin">
          <NuxtLink to="/admin" class="nav-link" :class="{ 'router-link-active': route.path === '/admin' }">
            Dashboard
          </NuxtLink>
        </li>
        <li v-if="isAdmin">
          <NuxtLink to="/admin/people-groups" class="nav-link">
            People Groups
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/admin/subscribers" class="nav-link">
            Contacts
          </NuxtLink>
        </li>
        <li v-if="isAdmin">
          <NuxtLink to="/admin/groups" class="nav-link">
            Groups
          </NuxtLink>
        </li>
        <li v-if="isAdmin">
          <NuxtLink to="/admin/libraries" class="nav-link">
            Libraries
          </NuxtLink>
        </li>
        <li v-if="isAdmin">
          <NuxtLink to="/admin/users" class="nav-link">
            Users
          </NuxtLink>
        </li>
        <li v-if="isSuperAdmin">
          <NuxtLink to="/superadmin" class="nav-link">
            Superadmin
          </NuxtLink>
        </li>
      </ul>
      <div v-if="!hasRole" class="nav-menu"></div>

      <div class="sidebar-footer">
        <NuxtLink to="/admin/profile" class="user-name-link" v-if="user">
          {{ user.display_name || user.email }}
        </NuxtLink>
        <ThemeToggle />
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
const { user, isAdmin, isSuperAdmin, hasRole, checkAuth } = useAuthUser()

const route = useRoute()
const sidebarOpen = ref(false)

// Close sidebar on route change
watch(() => route.path, () => {
  sidebarOpen.value = false
})

onMounted(async () => {
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
  background-color: var(--ui-bg-elevated);
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-header {
  padding: 1.5rem 1rem;
  border-bottom: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.logo {
  font-size: 1.25rem;
  margin: 0;
  color: var(--ui-text);
}

.nav-menu {
  list-style: none;
  padding: 1rem 0;
  margin: 0;
  flex: 1;
}

.nav-menu li {
  margin: 0;
}

.nav-link {
  display: block;
  padding: 0.75rem 1rem;
  color: var(--ui-text);
  text-decoration: none;
  transition: background-color 0.2s;
}

.nav-link:hover {
  background-color: var(--ui-bg);
}

.nav-link.router-link-active {
  background-color: var(--ui-bg);
  border-right: 3px solid var(--ui-text);
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid var(--ui-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.user-name-link {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--ui-text);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: opacity 0.2s;
}

.user-name-link:hover {
  opacity: 0.7;
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--ui-bg);
}

.main-content {
  flex: 1;
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* Mobile header - hidden on desktop */
.mobile-header {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: var(--ui-bg-elevated);
  border-bottom: 1px solid var(--ui-border);
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
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar.open {
    transform: translateX(0);
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

const CACHE_KEY = 'auth.user.cache'

// SessionStorage helpers (only run on client)
const saveToCache = (userData: any) => {
  if (import.meta.client && userData) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(userData))
    } catch {}
  }
}

const loadFromCache = (): any => {
  if (import.meta.client) {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      return cached ? JSON.parse(cached) : null
    } catch {}
  }
  return null
}

const clearCache = () => {
  if (import.meta.client) {
    try {
      sessionStorage.removeItem(CACHE_KEY)
    } catch {}
  }
}

export const useAuth = () => {
  const user = useState('auth.user', () => null as any)
  const authReady = useState('auth.ready', () => false)

  // Restore from cache instantly (called by plugin)
  const restoreFromCache = () => {
    const cached = loadFromCache()
    if (cached) {
      user.value = cached
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const response = await $fetch('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      }) as { success: boolean; user?: any }
      
      if (response.success) {
        user.value = response.user
        saveToCache(response.user)

        // Check for redirect parameter in URL
        const route = useRoute()
        const redirectTo = route.query.redirect as string
        
        if (redirectTo && redirectTo.startsWith('/')) {
          // Only allow internal redirects (starting with /)
          await navigateTo(redirectTo)
        } else {
          await navigateTo('/')
        }
        
        return { success: true }
      }
      
      return { success: false, message: 'Login failed' }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.data?.message || 'An error occurred during login' 
      }
    }
  }
  
  const logout = async () => {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
      user.value = null
      clearCache()
      await navigateTo('/login')
    } catch {
      // Even if the server request fails, clear local state
      user.value = null
      clearCache()
      await navigateTo('/login')
    }
  }
  
  const register = async (email: string, password: string, display_name: string) => {
    try {
      const response = await $fetch('/api/auth/register', {
        method: 'POST',
        body: { email, password, display_name }
      }) as { success: boolean; message?: string; requiresVerification?: boolean }
      
      return response
    } catch (error: any) {
      return { 
        success: false, 
        message: error.data?.message || 'Registration failed' 
      }
    }
  }
  
  const checkAuth = async () => {
    try {
      const response = await $fetch('/api/auth/me') as { user: any }
      user.value = response.user
      saveToCache(response.user)
      return response.user
    } catch {
      user.value = null
      clearCache()
      return null
    }
  }

  const isLoggedIn = computed(() => !!user.value)

  const deleteAccount = async (password: string) => {
    try {
      const response = await $fetch('/api/profile/account', {
        method: 'DELETE',
        body: { password }
      }) as { success: boolean; message?: string }

      if (response.success) {
        user.value = null
        clearCache()
        await navigateTo('/login')
        return { success: true }
      }

      return { success: false, message: 'Account deletion failed' }
    } catch (error: any) {
      return {
        success: false,
        message: error.data?.statusMessage || 'An error occurred while deleting your account'
      }
    }
  }

  return {
    user: readonly(user),
    authReady: readonly(authReady),
    login,
    logout,
    register,
    checkAuth,
    restoreFromCache,
    isLoggedIn,
    deleteAccount,
    setAuthReady: (value: boolean) => { authReady.value = value }
  }
} 
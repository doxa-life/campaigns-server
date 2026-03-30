/**
 * App-specific auth composable that extends the base layer's useAuth
 * Adds role-specific computed properties for this application
 */
import { computed } from 'vue'
import { useAuth } from '#imports'

export const useAuthUser = () => {
  // Get base auth functionality from the base layer
  const baseAuth = useAuth()

  // Add app-specific role computed properties
  const isAdmin = computed(() => baseAuth.user.value?.isAdmin || false)
  const isSuperAdmin = computed(() => baseAuth.user.value?.isSuperAdmin || false)
  const hasRole = computed(() => !!baseAuth.user.value?.role)

  return {
    ...baseAuth,
    isAdmin,
    isSuperAdmin,
    hasRole
  }
}

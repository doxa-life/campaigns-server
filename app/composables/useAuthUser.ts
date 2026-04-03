/**
 * App-specific auth composable that extends the base layer's useAuth
 * Adds role-specific computed properties for this application
 */
import { computed } from 'vue'
import { useAuth } from '#imports'
import { ROLES, type RoleName } from '../utils/role-definitions'

export const useAuthUser = () => {
  const baseAuth = useAuth()

  const isAdmin = computed(() => baseAuth.user.value?.isAdmin || false)
  const isSuperAdmin = computed(() => baseAuth.user.value?.isSuperAdmin || false)
  const hasRole = computed(() => (baseAuth.user.value?.roles?.length ?? 0) > 0)

  const userPermissions = computed(() => {
    const roles = (baseAuth.user.value?.roles || []) as RoleName[]
    const perms = new Set<string>()
    for (const roleName of roles) {
      const role = ROLES[roleName]
      if (role) {
        for (const p of role.permissions) perms.add(p)
      }
    }
    return perms
  })

  function canAccess(permission: string): boolean {
    if (isAdmin.value) return true
    return userPermissions.value.has(permission) || userPermissions.value.has(permission + '_scoped')
  }

  return {
    ...baseAuth,
    isAdmin,
    isSuperAdmin,
    hasRole,
    canAccess
  }
}

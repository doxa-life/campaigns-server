/**
 * App-specific auth composable that extends the shared useAuth
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

  // Languages the user may edit when a role scopes content by language; empty otherwise.
  const assignedLanguages = computed<string[]>(() => baseAuth.user.value?.languages || [])

  function canAccess(permission: string): boolean {
    if (isAdmin.value) return true
    const perms = userPermissions.value
    return perms.has(permission) || perms.has(permission + '_scoped') || perms.has(permission + '_language_scoped')
  }

  function canAccessUnscoped(permission: string): boolean {
    if (isAdmin.value) return true
    return userPermissions.value.has(permission)
  }

  // True when the only route to the permission is through assigned languages
  // (no bare form and no people-group-scoped form).
  function isLanguageScopedOnly(permission: string): boolean {
    if (isAdmin.value) return false
    const perms = userPermissions.value
    return perms.has(permission + '_language_scoped') && !perms.has(permission) && !perms.has(permission + '_scoped')
  }

  // Whether the permission may be applied to content in the given language. People-group scope
  // counts as allowed here; the server still checks the library's people group.
  function canAccessLanguage(permission: string, languageCode: string): boolean {
    if (!canAccess(permission)) return false
    if (!isLanguageScopedOnly(permission)) return true
    return assignedLanguages.value.includes(languageCode)
  }

  return {
    ...baseAuth,
    isAdmin,
    isSuperAdmin,
    hasRole,
    assignedLanguages,
    canAccess,
    canAccessUnscoped,
    isLanguageScopedOnly,
    canAccessLanguage
  }
}

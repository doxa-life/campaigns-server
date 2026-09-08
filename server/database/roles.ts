import { getSql } from './db'
import { ROLES, type RoleName } from '../../app/utils/role-definitions'

export { ROLES, type RoleName }

export const PEOPLE_GROUP_SCOPE_SUFFIX = '_scoped'
export const LANGUAGE_SCOPE_SUFFIX = '_language_scoped'

export interface PermissionScopes {
  unscoped: boolean
  peopleGroup: boolean
  language: boolean
}

export function getPermissionScopesForRoles(roles: RoleName[], permissionName: string): PermissionScopes {
  const scopes: PermissionScopes = { unscoped: false, peopleGroup: false, language: false }
  for (const roleName of roles) {
    const permissions = ROLES[roleName]?.permissions
    if (!permissions) continue
    if (permissions.includes(permissionName)) scopes.unscoped = true
    if (permissions.includes(permissionName + PEOPLE_GROUP_SCOPE_SUFFIX)) scopes.peopleGroup = true
    if (permissions.includes(permissionName + LANGUAGE_SCOPE_SUFFIX)) scopes.language = true
  }
  return scopes
}

/** Whether any of the roles carries a language-scoped permission, i.e. the user works with assigned languages. */
export function rolesUseLanguageScope(roles: RoleName[]): boolean {
  return roles.some(r => ROLES[r]?.permissions.some(p => p.endsWith(LANGUAGE_SCOPE_SUFFIX)))
}

export class RoleService {
  private sql = getSql()

  async getUserRoles(userId: string): Promise<RoleName[]> {
    const [result] = await this.sql`SELECT roles FROM users WHERE id = ${userId}`
    return (result?.roles || []) as RoleName[]
  }

  async setUserRoles(userId: string, roles: RoleName[]): Promise<void> {
    await this.sql`UPDATE users SET roles = ${roles} WHERE id = ${userId}`
  }

  /**
   * How the user's roles grant a permission: `unscoped` for the bare permission,
   * `peopleGroup` for the `_scoped` variant, `language` for the `_language_scoped` variant.
   * All false when no role grants it in any form.
   */
  async getPermissionScopes(userId: string, permissionName: string): Promise<PermissionScopes> {
    const roles = await this.getUserRoles(userId)
    return getPermissionScopesForRoles(roles, permissionName)
  }

  /**
   * Check if user has a permission in any form: bare, `_scoped` or `_language_scoped`.
   * e.g. checking 'people_groups.view' passes if user has 'people_groups.view' OR 'people_groups.view_scoped'
   */
  async userHasPermission(userId: string, permissionName: string): Promise<boolean> {
    const scopes = await this.getPermissionScopes(userId, permissionName)
    return scopes.unscoped || scopes.peopleGroup || scopes.language
  }

  /**
   * Check if the user's access to a permission is restricted to a scope (people group or language)
   * without also holding the full permission. Returns true if the user has 'foo_scoped' or
   * 'foo_language_scoped' but NOT 'foo'.
   */
  async isPermissionScoped(userId: string, permissionName: string): Promise<boolean> {
    const scopes = await this.getPermissionScopes(userId, permissionName)
    return !scopes.unscoped && (scopes.peopleGroup || scopes.language)
  }

  async userHasRole(userId: string, roleName: RoleName): Promise<boolean> {
    const roles = await this.getUserRoles(userId)
    return roles.includes(roleName)
  }

  async isAdmin(userId: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId)
    return roles.includes('admin')
  }

  getAllRoles() {
    return Object.values(ROLES)
  }

  getRoleByName(name: string) {
    return ROLES[name as RoleName] || null
  }

  /** Role names that grant the given permission in any form (bare or scoped). */
  getRoleNamesWithPermission(permission: string): RoleName[] {
    return Object.values(ROLES)
      .filter(r => {
        const scopes = getPermissionScopesForRoles([r.name], permission)
        return scopes.unscoped || scopes.peopleGroup || scopes.language
      })
      .map(r => r.name)
  }
}

export const roleService = new RoleService()

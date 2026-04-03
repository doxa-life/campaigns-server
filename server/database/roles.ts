import { getSql } from './db'
import { ROLES, type RoleName } from '../../app/utils/role-definitions'

export { ROLES, type RoleName }

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
   * Check if user has a permission. Also accepts the _scoped variant.
   * e.g. checking 'people_groups.view' passes if user has 'people_groups.view' OR 'people_groups.view_scoped'
   */
  async userHasPermission(userId: string, permissionName: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId)
    if (roles.length === 0) return false

    const scopedVariant = permissionName + '_scoped'
    for (const roleName of roles) {
      const roleConfig = ROLES[roleName]
      if (roleConfig && (roleConfig.permissions.includes(permissionName) || roleConfig.permissions.includes(scopedVariant))) {
        return true
      }
    }
    return false
  }

  /**
   * Check if the user's access to a permission is scoped (i.e. they only have the _scoped variant, not the full one).
   * Returns true if the user has 'foo_scoped' but NOT 'foo'.
   */
  async isPermissionScoped(userId: string, permissionName: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId)
    if (roles.length === 0) return false

    let hasUnscoped = false
    let hasScoped = false
    const scopedVariant = permissionName + '_scoped'

    for (const roleName of roles) {
      const roleConfig = ROLES[roleName]
      if (!roleConfig) continue
      if (roleConfig.permissions.includes(permissionName)) hasUnscoped = true
      if (roleConfig.permissions.includes(scopedVariant)) hasScoped = true
    }

    return hasScoped && !hasUnscoped
  }

  async userHasRole(userId: string, roleName: RoleName): Promise<boolean> {
    const roles = await this.getUserRoles(userId)
    return roles.includes(roleName)
  }

  async isAdmin(userId: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId)
    return roles.includes('admin')
  }

  private hiddenRoles: RoleName[] = ['language_editor']

  getAllRoles() {
    return Object.values(ROLES).filter(r => !this.hiddenRoles.includes(r.name))
  }

  getRoleByName(name: string) {
    return ROLES[name as RoleName] || null
  }
}

export const roleService = new RoleService()

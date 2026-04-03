import { getSql } from './db'

export type RoleName = 'admin' | 'people_group_editor'

export const ROLES = {
  admin: {
    name: 'admin' as RoleName,
    description: 'Full system administrator - can see and do everything',
    permissions: [
      'people_groups.view',
      'people_groups.create',
      'people_groups.edit',
      'people_groups.delete',
      'groups.view',
      'groups.create',
      'groups.edit',
      'groups.delete',
      'subscribers.view',
      'subscribers.create',
      'subscribers.edit',
      'subscribers.delete',
      'content.view',
      'content.create',
      'content.edit',
      'content.delete',
      'users.manage',
      'roles.manage'
    ]
  },
  people_group_editor: {
    name: 'people_group_editor' as RoleName,
    description: 'Can manage people groups they have been given access to',
    permissions: [
      'people_groups.view',
      'people_groups.create',
      'people_groups.edit',
      'people_groups.delete',
      'subscribers.view',
      'content.view',
      'content.create',
      'content.edit',
      'content.delete'
    ]
  }
}

export class RoleService {
  private sql = getSql()

  async getUserRole(userId: string): Promise<RoleName | null> {
    const [result] = await this.sql`SELECT role FROM users WHERE id = ${userId}`
    return result?.role || null
  }

  async setUserRole(userId: string, role: RoleName | null): Promise<void> {
    await this.sql`UPDATE users SET role = ${role} WHERE id = ${userId}`
  }

  async userHasPermission(userId: string, permissionName: string): Promise<boolean> {
    const role = await this.getUserRole(userId)
    if (!role) return false

    const roleConfig = ROLES[role]
    return roleConfig.permissions.includes(permissionName)
  }

  async isAdmin(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId)
    return role === 'admin'
  }

  async isPeopleGroupEditor(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId)
    return role === 'people_group_editor'
  }

  getAllRoles() {
    return Object.values(ROLES)
  }

  getRoleByName(name: string) {
    return ROLES[name as RoleName] || null
  }
}

export const roleService = new RoleService()

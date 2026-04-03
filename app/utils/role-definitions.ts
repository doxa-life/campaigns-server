export type RoleName = 'admin' | 'progress_admin' | 'content_editor' | 'language_editor' | 'people_group_editor'

export const ROLES: Record<RoleName, { name: RoleName; description: string; permissions: string[] }> = {
  admin: {
    name: 'admin',
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
      'users.manage'
    ]
  },
  progress_admin: {
    name: 'progress_admin',
    description: 'Manages people groups, groups, and subscribers',
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
      'subscribers.delete'
    ]
  },
  people_group_editor: {
    name: 'people_group_editor',
    description: 'Manages assigned people groups and their content',
    permissions: [
      'people_groups.view_scoped',
      'people_groups.edit_scoped',
      'groups.view_scoped',
      'subscribers.view_scoped',
      'content.view_scoped',
      'content.create_scoped',
      'content.edit_scoped',
      'content.delete_scoped'
    ]
  },
  content_editor: {
    name: 'content_editor',
    description: 'Manages library content across all languages',
    permissions: [
      'content.view',
      'content.create',
      'content.edit',
      'content.delete'
    ]
  },
  language_editor: {
    name: 'language_editor',
    description: 'Manages library content in assigned languages only',
    permissions: [
      'content.view',
      'content.create',
      'content.edit',
      'content.delete'
    ]
  }
}

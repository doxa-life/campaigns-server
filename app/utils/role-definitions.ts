export type RoleName = 'admin' | 'progress_admin' | 'content_editor' | 'language_editor' | 'people_group_editor' | 'inbox_agent'

export const ROLES: Record<RoleName, { name: RoleName; label: string; description: string; permissions: string[] }> = {
  admin: {
    name: 'admin',
    label: 'Admin',
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
      'inbox.view',
      'inbox.send',
      'marketing.view',
      'marketing.send'
    ]
  },
  progress_admin: {
    name: 'progress_admin',
    label: 'Progress Admin',
    description: 'Monitors prayer progress and handles outreach — views people groups and stats, runs the inbox, and emails consenting contacts',
    permissions: [
      'people_groups.view',
      'groups.view',
      'subscribers.view',
      'inbox.view',
      'inbox.send',
      'marketing.view',
      'marketing.send'
    ]
  },
  people_group_editor: {
    name: 'people_group_editor',
    label: 'People Group Editor',
    description: 'Manages assigned people groups and their content',
    permissions: [
      'people_groups.view_scoped',
      'people_groups.edit_scoped',
      'groups.view_scoped',
      'subscribers.view_scoped',
      'subscribers.edit_scoped',
      'subscribers.delete_scoped',
      'content.view_scoped',
      'content.create_scoped',
      'content.edit_scoped',
      'content.delete_scoped'
    ]
  },
  content_editor: {
    name: 'content_editor',
    label: 'Content Editor',
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
    label: 'Language Editor',
    description: 'Manages library content in assigned languages only',
    permissions: [
      'content.view',
      'content.create',
      'content.edit',
      'content.delete'
    ]
  },
  inbox_agent: {
    name: 'inbox_agent',
    label: 'Inbox Agent',
    description: 'Handles the shared email inbox — triage and reply to contacts',
    permissions: [
      'inbox.view',
      'inbox.send'
    ]
  }
}

// Permission scopes: a bare permission is unrestricted. The `_scoped` suffix limits it to the
// user's assigned people groups; the `_language_scoped` suffix limits it to the user's assigned
// languages. A user holding several roles gets the union of what each role's scope allows.
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
      'churches.view',
      'churches.create',
      'churches.edit',
      'churches.delete',
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
      'marketing.send',
      'context.view',
      'context.edit',
      'context.manage'
    ]
  },
  progress_admin: {
    name: 'progress_admin',
    label: 'Progress Admin',
    description: 'Monitors prayer progress and handles outreach — edits people groups, reviews public suggestions, runs the inbox, and emails consenting contacts',
    permissions: [
      'people_groups.view',
      'people_groups.edit',
      'groups.view',
      'subscribers.view',
      'inbox.view',
      'inbox.send',
      'marketing.view',
      'marketing.send',
      'context.view',
      'context.edit'
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
      'content.delete_scoped',
      'context.view'
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
      'content.delete',
      'context.view'
    ]
  },
  language_editor: {
    name: 'language_editor',
    label: 'Translator',
    description: 'Reviews and edits library content in assigned languages — can read every language but only change assigned ones',
    permissions: [
      'content.view',
      'content.create_language_scoped',
      'content.edit_language_scoped',
      'content.delete_language_scoped',
      'context.view'
    ]
  },
  inbox_agent: {
    name: 'inbox_agent',
    label: 'Inbox Agent',
    description: 'Handles the shared email inbox — triage and reply to contacts',
    permissions: [
      'inbox.view',
      'inbox.send',
      'context.view'
    ]
  }
}

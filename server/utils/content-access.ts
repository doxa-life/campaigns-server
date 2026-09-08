import type { H3Event } from 'h3'
import { roleService } from '#server/database/roles'
import { userLanguageService } from '#server/database/user-languages'
import { peopleGroupAccessService } from '#server/database/people-group-access'

export interface ContentScope {
  // People group the content belongs to; null for a library not tied to a people group.
  peopleGroupId?: number | null
  // Languages the action touches. Leave empty for library-level actions, which language scope never covers.
  languageCodes?: string[]
}

/**
 * Throw 403 unless the user may apply `permission` (e.g. 'content.edit') to the content described
 * by `scope`. The bare permission passes outright. Otherwise access comes from whichever scope the
 * user's roles grant: people-group scope passes when the content belongs to one of the user's assigned
 * people groups; language scope passes when every language the action touches is assigned to the user.
 * A user holding both kinds of role passes if either scope allows the action.
 */
/**
 * Require the permission in its bare or people-group-scoped form. Library-level actions that are
 * not tied to a language (creating a library, the global prayer-fuel order) are never covered by
 * language scope, so a user whose only route to the permission is assigned languages is rejected.
 */
export async function requireNonLanguageScopedPermission(event: H3Event, permission: string) {
  const user = await requirePermission(event, permission)
  const scopes = await roleService.getPermissionScopes(user.userId, permission)
  if (!scopes.unscoped && !scopes.peopleGroup) {
    throw createError({ statusCode: 403, statusMessage: `Permission required: ${permission}` })
  }
  return user
}

export async function requireContentAccess(userId: string, permission: string, scope: ContentScope = {}): Promise<void> {
  const scopes = await roleService.getPermissionScopes(userId, permission)
  if (scopes.unscoped) return

  if (scopes.peopleGroup && scope.peopleGroupId && await peopleGroupAccessService.userHasAccess(userId, scope.peopleGroupId)) {
    return
  }

  const languages = scope.languageCodes ?? []
  if (scopes.language && languages.length > 0) {
    const assigned = await userLanguageService.getUserLanguages(userId)
    if (languages.every(code => assigned.includes(code))) return
  }

  throw createError({ statusCode: 403, statusMessage: 'You do not have access to this content' })
}

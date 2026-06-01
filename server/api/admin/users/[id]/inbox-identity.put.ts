import { userService } from '#server/database/users'
import { roleService } from '#server/database/roles'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

/**
 * Set a user's inbox sending identity: email_alias (local-part only, e.g. 'george') and
 * HTML email_signature. Editing the alias or another user requires users.manage; a user
 * may edit their own signature with inbox.send.
 */
export default defineEventHandler(async (event) => {
  const requester = await requirePermission(event, 'inbox.send')

  const userId = getUuidParam(event, 'id')
  const body = await readBody<{ email_alias?: string | null; email_signature?: string | null }>(event)

  const changingAlias = body.email_alias !== undefined
  const editingOther = userId !== requester.userId

  if (changingAlias || editingOther) {
    const canManage = await roleService.userHasPermission(requester.userId, 'users.manage')
    if (!canManage) {
      throw createError({ statusCode: 403, statusMessage: 'Managing aliases requires user management permission' })
    }
  }

  const target = await userService.getUserById(userId)
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // A personal alias is only for users who can send
  if (changingAlias && body.email_alias) {
    const canSend = await roleService.userHasPermission(userId, 'inbox.send')
    if (!canSend) {
      throw createError({ statusCode: 400, statusMessage: 'Only users with inbox.send can have a sending alias' })
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(body.email_alias.trim())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid alias (use letters, digits, dots, dashes)' })
    }
  }

  try {
    const updated = await userService.updateInboxIdentity(userId, {
      email_alias: body.email_alias,
      email_signature: body.email_signature,
    })
    logUpdate('users', userId, event, { message: 'Inbox identity updated' })
    return { user: updated }
  } catch (error: any) {
    if (error?.code === '23505') {
      throw createError({ statusCode: 400, statusMessage: 'That alias is already taken' })
    }
    handleApiError(error, 'Failed to update inbox identity')
  }
})

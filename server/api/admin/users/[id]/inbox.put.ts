import { userService } from '#server/database/users'
import { roleService } from '#server/database/roles'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')
  const userId = getUuidParam(event, 'id')
  const body = await readBody<{ email_alias?: string | null; email_signature?: string | null }>(event)

  const alias = body.email_alias?.trim().toLowerCase() || null
  if (alias && !/^[a-z0-9._+-]+$/.test(alias)) {
    throw createError({ statusCode: 400, statusMessage: 'Alias must be a local-part only' })
  }
  if (alias && !(await roleService.userHasPermission(userId, 'inbox.send'))) {
    throw createError({ statusCode: 400, statusMessage: 'User must have inbox.send before assigning an alias' })
  }

  try {
    const user = await userService.updateInboxIdentity(userId, {
      email_alias: alias,
      email_signature: body.email_signature || null
    })
    logUpdate('users', userId, event, { changes: { inbox_identity: { from: null, to: alias } } })
    return { user }
  } catch (error) {
    handleApiError(error, 'Failed to update inbox identity', 400)
  }
})

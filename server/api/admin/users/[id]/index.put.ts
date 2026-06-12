import { userService } from '#server/database/users'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const userId = getUuidParam(event, 'id')
  const body = await readBody(event)

  const hasEmail = body.email !== undefined
  const hasDisplayName = body.display_name !== undefined
  const hasVerified = body.verified !== undefined

  if (!hasEmail && !hasDisplayName && !hasVerified) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one of email, display_name, or verified is required'
    })
  }

  if (hasEmail) {
    if (typeof body.email !== 'string' || !body.email.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Email is required'
      })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email.trim())) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid email format'
      })
    }
  }

  if (hasDisplayName && typeof body.display_name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'display_name must be a string'
    })
  }

  if (hasVerified && typeof body.verified !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'verified must be a boolean'
    })
  }

  try {
    const user = await userService.getUserById(userId)
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    if (hasEmail) {
      const existing = await userService.getUserByEmail(body.email.trim())
      if (existing && existing.id !== userId) {
        throw createError({
          statusCode: 400,
          statusMessage: 'A user with this email already exists'
        })
      }
    }

    const updated = await userService.updateUser(userId, {
      email: hasEmail ? body.email : undefined,
      display_name: hasDisplayName ? body.display_name : undefined,
      verified: hasVerified ? body.verified : undefined
    })

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (hasEmail && updated!.email !== user.email) {
      changes.email = { from: user.email, to: updated!.email }
    }
    if (hasDisplayName && updated!.display_name !== user.display_name) {
      changes.display_name = { from: user.display_name, to: updated!.display_name }
    }
    if (hasVerified && updated!.verified !== user.verified) {
      changes.verified = { from: user.verified, to: updated!.verified }
    }
    if (Object.keys(changes).length > 0) {
      logUpdate('users', userId, event, { changes })
    }

    return {
      success: true,
      user: {
        id: updated!.id,
        email: updated!.email,
        display_name: updated!.display_name,
        verified: updated!.verified
      }
    }
  } catch (error) {
    handleApiError(error, 'Failed to update user')
  }
})

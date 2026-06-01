import bcrypt from 'bcrypt'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = requireAuth(event)

  // Get request body
  const body = await readBody(event)
  const { current_password, new_password } = body

  // Validate input
  if (!current_password || typeof current_password !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Current password is required'
    })
  }

  if (!new_password || typeof new_password !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password is required'
    })
  }

  if (new_password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password must be at least 8 characters long'
    })
  }

  if (new_password.length > 128) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password is too long (max 128 characters)'
    })
  }

  // Don't allow same password
  if (current_password === new_password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password must be different from current password'
    })
  }

  // Get current user password hash
  const userResult = await sql`
    SELECT password FROM users WHERE id = ${user.userId}
  `

  if (userResult.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  const currentPasswordHash = userResult[0].password

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(
    current_password,
    currentPasswordHash
  )

  if (!isCurrentPasswordValid) {
    // Log failed password change attempt
    logEvent({
      eventType: 'PASSWORD_CHANGE_FAILED',
      tableName: 'users',
      recordId: user.userId,
      userId: user.userId,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: {
        reason: 'invalid_current_password'
      }
    })

    throw createError({
      statusCode: 401,
      statusMessage: 'Current password is incorrect'
    })
  }

  // Hash new password
  const saltRounds = 12
  const newPasswordHash = await bcrypt.hash(new_password, saltRounds)

  // Update password in database
  await sql`
    UPDATE users
    SET password = ${newPasswordHash}, updated = NOW()
    WHERE id = ${user.userId}
  `

  // Log successful password change
  logEvent({
    eventType: 'PASSWORD_CHANGED',
    tableName: 'users',
    recordId: user.userId,
    userId: user.userId,
    userAgent: getHeader(event, 'user-agent') || undefined,
    metadata: {}
  })

  return {
    success: true,
    message: 'Password changed successfully'
  }
})

import bcrypt from 'bcrypt'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = requireAuth(event)

  // Get request body
  const body = await readBody(event)
  const { password } = body

  // Validate input
  if (!password || typeof password !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password is required'
    })
  }

  // Get current user password hash
  const userResult = await sql`
    SELECT password, email FROM users WHERE id = ${user.userId}
  `

  if (userResult.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  const currentPasswordHash = userResult[0].password
  const userEmail = userResult[0].email

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, currentPasswordHash)

  if (!isPasswordValid) {
    // Log failed account deletion attempt
    logEvent({
      eventType: 'ACCOUNT_DELETE_FAILED',
      tableName: 'users',
      recordId: user.userId,
      userId: user.userId,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: {
        reason: 'invalid_password'
      }
    })

    throw createError({
      statusCode: 401,
      statusMessage: 'Password is incorrect'
    })
  }

  // Delete related data in correct order (foreign key constraints)
  // 1. Delete password reset requests
  await sql`
    DELETE FROM password_reset_requests WHERE user_id = ${user.userId}
  `

  // 2. Delete activity logs for this user
  await sql`
    DELETE FROM activity_logs WHERE user_id = ${user.userId}
  `

  // 3. Delete the user
  await sql`
    DELETE FROM users WHERE id = ${user.userId}
  `

  // Log account deletion (this log entry won't have user_id since we deleted it)
  logEvent({
    eventType: 'ACCOUNT_DELETED',
    tableName: 'users',
    recordId: user.userId,
    userAgent: getHeader(event, 'user-agent') || undefined,
    metadata: {
      email: userEmail
    }
  })

  // Clear auth cookie
  deleteCookie(event, 'auth-token')

  return {
    success: true,
    message: 'Account deleted successfully'
  }
})

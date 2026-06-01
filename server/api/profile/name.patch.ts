export default defineEventHandler(async (event) => {
  // Require authentication
  const user = requireAuth(event)

  // Get request body
  const body = await readBody(event)
  const { display_name } = body

  // Validate input
  if (!display_name || typeof display_name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Display name is required'
    })
  }

  const trimmedName = display_name.trim()

  if (trimmedName.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Display name cannot be empty'
    })
  }

  if (trimmedName.length > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Display name is too long (max 100 characters)'
    })
  }

  // Update display name in database
  const result = await sql`
    UPDATE users
    SET display_name = ${trimmedName}, updated = NOW()
    WHERE id = ${user.userId}
    RETURNING id, email, display_name
  `

  if (result.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  // Log activity
  logEvent({
    eventType: 'PROFILE_NAME_UPDATED',
    tableName: 'users',
    recordId: user.userId,
    userId: user.userId,
    userAgent: getHeader(event, 'user-agent') || undefined,
    metadata: {
      old_name: user.display_name,
      new_name: trimmedName
    }
  })

  return {
    success: true,
    user: result[0]
  }
})

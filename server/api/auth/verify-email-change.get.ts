export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token is required'
    })
  }

  try {
    // Find user with this email change token
    const users = await sql`
      SELECT id, email, pending_email, email_change_token
      FROM users
      WHERE email_change_token = ${token}
    `

    const user = users[0]

    if (!user) {
      // Redirect to profile with error message
      return sendRedirect(event, '/profile?email_change=invalid_token')
    }

    if (!user.pending_email) {
      // No pending email change
      return sendRedirect(event, '/profile?email_change=no_pending')
    }

    const oldEmail = user.email
    const newEmail = user.pending_email

    // Check if new email is now taken by someone else (race condition check)
    const existingUser = await sql`
      SELECT id FROM users
      WHERE email = ${newEmail} AND id != ${user.id}
    `

    if (existingUser.length > 0) {
      // Clean up pending change
      await sql`
        UPDATE users
        SET pending_email = NULL,
            email_change_token = NULL
        WHERE id = ${user.id}
      `

      return sendRedirect(event, '/profile?email_change=email_taken')
    }

    // Update email and clear pending fields
    await sql`
      UPDATE users
      SET email = ${newEmail},
          pending_email = NULL,
          email_change_token = NULL,
          updated = NOW()
      WHERE id = ${user.id}
    `

    // Log successful email change
    logEvent({
      eventType: 'EMAIL_CHANGED',
      tableName: 'users',
      recordId: user.id,
      userId: user.id,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: {
        old_email: oldEmail,
        new_email: newEmail
      }
    })

    // Redirect to profile with success message
    return sendRedirect(event, '/profile?email_change=success')
  } catch (error) {
    console.error('Email change verification error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Email change verification failed'
    })
  }
})

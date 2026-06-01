export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Verification token is required' })
  }

  try {
    // Find user with this token
    const users = await sql`
      SELECT id, verified FROM users WHERE token_key = ${token}
    `

    const user = users[0]

    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'Invalid verification token' })
    }

    if (user.verified) {
      // Already verified, redirect to login with message
      return sendRedirect(event, '/login?verified=already')
    }

    // Mark user as verified
    await sql`
      UPDATE users
      SET verified = true, updated = ${new Date().toISOString()}
      WHERE id = ${user.id}
    `

    // Redirect to login with success message
    return sendRedirect(event, '/login?verified=success')
  } catch (error) {
    console.error('Email verification error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Email verification failed' })
  }
})

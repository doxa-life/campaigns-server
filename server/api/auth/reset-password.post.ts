import bcrypt from 'bcrypt'

export default defineEventHandler(async (event) => {
  const { token, password, confirmPassword } = await readBody(event)

  // Validate inputs
  if (!token || !password || !confirmPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token, password, and confirmation are required'
    })
  }

  // Validate passwords match
  if (password !== confirmPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Passwords do not match'
    })
  }

  // Validate password length
  if (password.length < 6) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 6 characters'
    })
  }

  // Sanitize token
  const sanitizedToken = token.trim().substring(0, 255)

  try {
    // Find valid reset request
    const resetRequests = await sql`
      SELECT * FROM password_reset_requests
      WHERE token = ${sanitizedToken}
      AND used = false
      AND expires > ${new Date().toISOString()}
    `

    const resetRequest = resetRequests[0]

    if (!resetRequest) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or expired reset token'
      })
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Update user's password
    await sql`
      UPDATE users
      SET password = ${hashedPassword}
      WHERE id = ${resetRequest.user_id}
    `

    // Mark token as used
    await sql`
      UPDATE password_reset_requests
      SET used = true
      WHERE token = ${sanitizedToken}
    `

    // Clean up old/expired reset requests
    await sql`
      DELETE FROM password_reset_requests
      WHERE user_id = ${resetRequest.user_id}
      AND (used = true OR expires <= ${new Date().toISOString()})
    `

    // Log the password reset
    const userAgent = getHeader(event, 'user-agent') || undefined
    logPasswordReset(resetRequest.user_id, userAgent)

    return {
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    }
  } catch (error: any) {
    // If it's already a createError, throw it as-is
    if (error.statusCode) {
      throw error
    }

    console.error('Error in reset-password endpoint:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'An error occurred while resetting your password'
    })
  }
})

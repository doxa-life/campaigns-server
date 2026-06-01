import bcrypt from 'bcrypt'
import crypto from 'crypto'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = requireAuth(event)

  // Get request body
  const body = await readBody(event)
  const { new_email, current_password } = body

  // Validate input
  if (!new_email || typeof new_email !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'New email is required'
    })
  }

  if (!current_password || typeof current_password !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Current password is required'
    })
  }

  const trimmedEmail = new_email.trim().toLowerCase()

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmedEmail)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email format'
    })
  }

  // Get current user data including password
  const userResult = await sql`
    SELECT email, password FROM users WHERE id = ${user.userId}
  `

  if (userResult.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  const currentUser = userResult[0]

  // Check if new email is same as current
  if (trimmedEmail === currentUser.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New email must be different from current email'
    })
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(current_password, currentUser.password)

  if (!isPasswordValid) {
    // Log failed attempt
    logEvent({
      eventType: 'EMAIL_CHANGE_FAILED',
      tableName: 'users',
      recordId: user.userId,
      userId: user.userId,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: {
        reason: 'invalid_password',
        attempted_new_email: trimmedEmail
      }
    })

    throw createError({
      statusCode: 401,
      statusMessage: 'Current password is incorrect'
    })
  }

  // Check if new email is already taken by another user
  const existingUser = await sql`
    SELECT id FROM users WHERE email = ${trimmedEmail}
  `

  if (existingUser.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'This email address is already in use'
    })
  }

  // Generate verification token
  const emailChangeToken = crypto.randomUUID()

  // Store pending email and token
  await sql`
    UPDATE users
    SET pending_email = ${trimmedEmail},
        email_change_token = ${emailChangeToken},
        updated = NOW()
    WHERE id = ${user.userId}
  `

  // Get runtime config for email
  const config = useRuntimeConfig()

  // Send verification email to NEW email address
  try {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:3002'}/api/auth/verify-email-change?token=${emailChangeToken}`

    await sendTemplateEmail({
      to: trimmedEmail,
      subject: 'Verify Your New Email Address',
      template: 'emailChangeVerification',
      data: {
        userName: user.display_name,
        oldEmail: currentUser.email,
        newEmail: trimmedEmail,
        verificationUrl: verificationUrl
      }
    })

    // Log successful email change request
    logEvent({
      eventType: 'EMAIL_CHANGE_REQUESTED',
      tableName: 'users',
      recordId: user.userId,
      userId: user.userId,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: {
        old_email: currentUser.email,
        new_email: trimmedEmail
      }
    })

    return {
      success: true,
      message: 'Verification email sent to new address'
    }
  } catch (error) {
    console.error('Error sending verification email:', error)

    // Clean up pending email change on error
    await sql`
      UPDATE users
      SET pending_email = NULL,
          email_change_token = NULL
      WHERE id = ${user.userId}
    `

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send verification email'
    })
  }
})

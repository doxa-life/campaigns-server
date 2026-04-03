import { userInvitationService } from '#server/database/user-invitations'
import { userService } from '#server/database/users'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'users.manage')

  // Get request body
  const body = await readBody(event)

  // Validate required fields
  if (!body.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required'
    })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(body.email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email format'
    })
  }

  try {
    // Check if user already exists
    const existingUser = await userService.getUserByEmail(body.email)
    if (existingUser) {
      throw createError({
        statusCode: 400,
        statusMessage: 'A user with this email already exists'
      })
    }

    // Check if there's already a pending invitation
    const hasPendingInvitation = await userInvitationService.hasPendingInvitation(body.email)
    if (hasPendingInvitation) {
      throw createError({
        statusCode: 400,
        statusMessage: 'A pending invitation for this email already exists'
      })
    }

    // Create the invitation
    const invitation = await userInvitationService.createInvitation({
      email: body.email,
      invited_by: user.userId,
      roles: body.roles || [],
      expires_in_days: body.expires_in_days || 7
    })

    // Send invitation email
    try {
      await sendInvitationEmail(
        invitation.email,
        invitation.token,
        user.display_name || user.email,
        invitation.expires_at
      )
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError)
      // Don't fail the whole request if email fails
      // The invitation is still created and can be resent
    }

    return {
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        token: invitation.token,
        expires_at: invitation.expires_at,
        status: invitation.status
      },
      message: 'Invitation created successfully'
    }
  } catch (error) {
    handleApiError(error, 'Failed to create invitation')
  }
})

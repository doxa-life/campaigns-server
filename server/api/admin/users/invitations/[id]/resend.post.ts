import { userInvitationService } from '#server/database/user-invitations'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const id = getIntParam(event, 'id')

  try {
    // Get the invitation
    const invitation = await userInvitationService.getInvitationById(id)

    if (!invitation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invitation not found'
      })
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot resend ${invitation.status} invitation`
      })
    }

    // Check if invitation has expired
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)

    if (now > expiresAt) {
      // Auto-expire the invitation
      await userInvitationService.updateInvitationStatus(id, 'expired')
      throw createError({
        statusCode: 400,
        statusMessage: 'Invitation has expired. Please create a new one.'
      })
    }

    // Get the inviter's info for the email
    const { userService } = await import('#server/database/users')
    const inviter = await userService.getUserById(String(invitation.invited_by))

    if (!inviter) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Inviter not found'
      })
    }

    // Resend invitation email
    try {
      await sendInvitationEmail(
        invitation.email,
        invitation.token,
        inviter.display_name || inviter.email,
        invitation.expires_at
      )
    } catch (emailError) {
      console.error('Failed to resend invitation email:', emailError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to send email'
      })
    }

    return {
      message: 'Invitation email resent successfully'
    }
  } catch (error) {
    handleApiError(error, 'Failed to resend invitation')
  }
})

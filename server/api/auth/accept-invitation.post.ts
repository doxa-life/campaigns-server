import { userInvitationService } from '#server/database/user-invitations'
import { userService } from '#server/database/users'
import { roleService } from '#server/database/roles'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate required fields
  if (!body.token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation token is required'
    })
  }

  if (!body.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password is required'
    })
  }

  if (!body.display_name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Display name is required'
    })
  }

  // Validate password strength
  if (body.password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters long'
    })
  }

  try {
    // Validate the invitation
    const validation = await userInvitationService.validateInvitation(body.token)

    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: validation.reason || 'Invalid invitation'
      })
    }

    const invitation = validation.invitation!

    // Check if user already exists (shouldn't happen, but double-check)
    const existingUser = await userService.getUserByEmail(invitation.email)
    if (existingUser) {
      throw createError({
        statusCode: 400,
        statusMessage: 'A user with this email already exists'
      })
    }

    // Create the user
    const user = await userService.createUser({
      email: invitation.email,
      password: body.password,
      display_name: body.display_name
    })

    // Mark user as verified (since they came through an invitation)
    await userService.verifyUser(user.id)

    // Assign roles if specified in invitation
    if (invitation.roles && invitation.roles.length > 0) {
      await roleService.setUserRoles(user.id, invitation.roles)
    }

    // Mark invitation as accepted
    await userInvitationService.acceptInvitation(invitation.id)

    // Get updated user data
    const verifiedUser = await userService.getUserById(user.id)
    if (!verifiedUser) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to retrieve user after verification'
      })
    }

    // Generate secure JWT token
    const token = generateToken({
      userId: verifiedUser.id as unknown as number,
      email: verifiedUser.email,
      display_name: verifiedUser.display_name
    })

    // Set secure HTTP-only cookie
    setAuthCookie(event, token)

    // Get user with roles
    const userWithRoles = await getUserWithRoles(verifiedUser.id, verifiedUser.email, verifiedUser.display_name, verifiedUser.verified, verifiedUser.superadmin)

    return {
      user: userWithRoles,
      message: 'Account created successfully'
    }
  } catch (error) {
    handleApiError(error, 'Failed to accept invitation')
  }
})

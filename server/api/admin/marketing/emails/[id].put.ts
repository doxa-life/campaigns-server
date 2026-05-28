import { marketingEmailService } from '#server/database/marketing-emails'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.view')

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email ID'
    })
  }

  const canAccess = await marketingEmailService.canUserAccessEmail(user.userId, id)
  if (!canAccess) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  const existingEmail = await marketingEmailService.getById(id)
  if (!existingEmail) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  if (existingEmail.status !== 'draft') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only drafts can be edited'
    })
  }

  const body = await readBody(event)

  if (body.audience_type) {
    const canSend = await marketingEmailService.canUserSendToAudience(
      user.userId,
      body.audience_type,
      body.people_group_id ?? existingEmail.people_group_id
    )

    if (!canSend) {
      throw createError({
        statusCode: 403,
        statusMessage: body.audience_type === 'doxa'
          ? 'Only admins can send Doxa-wide emails'
          : 'You do not have access to this people group'
      })
    }
  }

  try {
    const email = await marketingEmailService.update(id, {
      subject: body.subject,
      content_json: body.content_json,
      audience_type: body.audience_type,
      people_group_id: body.audience_type === 'people_group' ? body.people_group_id : null,
      sender_id: body.sender_id ?? null,
      updated_by: user.userId
    })

    return {
      success: true,
      email
    }
  } catch (error) {
    handleApiError(error, 'Failed to update email', 400)
  }
})

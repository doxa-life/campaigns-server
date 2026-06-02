import { marketingEmailService } from '#server/database/marketing-emails'
import { isValidTemplateKey } from '#server/utils/marketing-templates'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.send')

  const body = await readBody(event)

  if (!body.subject) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Subject is required'
    })
  }

  if (!body.content_json) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Content is required'
    })
  }

  if (!body.audience_type || !['doxa', 'people_group', 'admins', 'doxa_active_pg', 'pick'].includes(body.audience_type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid audience_type is required'
    })
  }

  if (body.audience_type === 'people_group' && !body.people_group_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'people_group_id is required when audience_type is people_group'
    })
  }

  if (body.template && !isValidTemplateKey(body.template)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid template'
    })
  }

  const canSend = await marketingEmailService.canUserSendToAudience(
    user.userId,
    body.audience_type,
    body.people_group_id
  )

  if (!canSend) {
    throw createError({
      statusCode: 403,
      statusMessage: body.audience_type === 'doxa'
        ? 'Only admins can create Doxa-wide emails'
        : 'You do not have access to this people group'
    })
  }

  try {
    const email = await marketingEmailService.create({
      subject: body.subject,
      content_json: body.content_json,
      template: body.template ?? 'default',
      audience_type: body.audience_type,
      people_group_id: body.audience_type === 'people_group' ? body.people_group_id : null,
      recipient_contact_method_ids: body.audience_type === 'pick' && Array.isArray(body.recipient_contact_method_ids)
        ? body.recipient_contact_method_ids.filter((n: unknown) => Number.isInteger(n))
        : null,
      sender_id: body.sender_id ?? null,
      created_by: user.userId
    })

    return {
      success: true,
      email
    }
  } catch (error) {
    handleApiError(error, 'Failed to create email', 400)
  }
})

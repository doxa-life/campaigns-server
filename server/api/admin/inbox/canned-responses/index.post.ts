import { cannedResponseService } from '#server/database/canned-responses'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.send')

  const body = await readBody<{
    title: string
    translations?: { language_code: string; body_html: string }[]
  }>(event)

  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }

  try {
    const cannedResponse = await cannedResponseService.create({
      title: body.title.trim(),
      created_by: user.userId,
      translations: body.translations || [],
    })
    logCreate('canned_responses', String(cannedResponse.id), event, { message: 'Canned response created' })
    return { cannedResponse }
  } catch (error) {
    handleApiError(error, 'Failed to create canned response')
  }
})

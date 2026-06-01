import { cannedResponseService } from '#server/database/canned-responses'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const existing = await cannedResponseService.getById(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Canned response not found' })
  }

  const body = await readBody<{
    title?: string
    translations?: { language_code: string; body_html: string }[]
  }>(event)

  try {
    const cannedResponse = await cannedResponseService.update(id, {
      title: body.title?.trim(),
      translations: body.translations,
    })
    logUpdate('canned_responses', String(id), event, { message: 'Canned response updated' })
    return { cannedResponse }
  } catch (error) {
    handleApiError(error, 'Failed to update canned response')
  }
})

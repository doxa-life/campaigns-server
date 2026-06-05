import { inboxKnowledgeService, type KnowledgeEntryStatus } from '#server/database/inbox-knowledge'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Update a knowledge-base entry (requires inbox.send).
 * Body: { question?, answer?, language?, status? }
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const body = await readBody<{
    question?: string
    answer?: string
    language?: string
    status?: KnowledgeEntryStatus
  }>(event)

  try {
    const entry = await inboxKnowledgeService.update(id, {
      question: body.question?.trim(),
      answer: body.answer?.trim(),
      language: body.language,
      status: body.status,
    })
    if (!entry) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
    return { entry }
  } catch (error) {
    handleApiError(error, 'Failed to update knowledge entry')
  }
})

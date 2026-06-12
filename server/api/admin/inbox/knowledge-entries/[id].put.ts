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

  // Absent fields keep their value; provided fields must be valid. Entries always
  // carry a non-empty question and answer (as enforced on create), so clearing
  // either is rejected rather than blanking the stored text.
  if (body.question !== undefined && !body.question.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Question cannot be empty' })
  }
  if (body.answer !== undefined && !body.answer.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Answer cannot be empty' })
  }
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'archived') {
    throw createError({ statusCode: 400, statusMessage: 'Status must be active or archived' })
  }
  if (body.language !== undefined && (!body.language.trim() || body.language.trim().length > 8)) {
    throw createError({ statusCode: 400, statusMessage: 'Language must be 1-8 characters' })
  }

  try {
    const entry = await inboxKnowledgeService.update(id, {
      question: body.question?.trim(),
      answer: body.answer?.trim(),
      language: body.language?.trim(),
      status: body.status,
    })
    if (!entry) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
    return { entry }
  } catch (error) {
    handleApiError(error, 'Failed to update knowledge entry')
  }
})

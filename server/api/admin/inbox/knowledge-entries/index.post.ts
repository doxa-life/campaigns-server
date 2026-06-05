import { inboxKnowledgeService } from '#server/database/inbox-knowledge'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Create a knowledge-base entry (requires inbox.send). The human has reviewed the
 * (anonymised) question/answer before this is called.
 *
 * Body: { question, answer, language?, source_conversation_id? }
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'inbox.send')

  const body = await readBody<{
    question?: string
    answer?: string
    language?: string
    source_conversation_id?: number
  }>(event)

  const question = (body.question || '').trim()
  const answer = (body.answer || '').trim()
  if (!question || !answer) {
    throw createError({ statusCode: 400, statusMessage: 'Question and answer are required' })
  }

  try {
    const entry = await inboxKnowledgeService.create({
      question,
      answer,
      language: body.language || 'en',
      source_conversation_id: body.source_conversation_id ?? null,
      created_by: auth.userId,
    })
    logCreate('inbox_knowledge_entries', String(entry.id), event, { message: 'Knowledge entry created' })
    return { entry }
  } catch (error) {
    handleApiError(error, 'Failed to create knowledge entry')
  }
})

import { conversationService } from '#server/database/conversations'
import { isAiConfigured } from '#server/utils/ai'
import { extractKnowledgeEntry } from '#server/utils/inbox/ai-knowledge-extract'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Suggest an anonymised knowledge-base entry from a conversation. Feeding the shared knowledge
 * base is inbox management, so it needs the full inbox.send (not the assigned-only form).
 * Returns a proposal { question, answer, language, removed } for human review — does NOT save.
 */
export default defineEventHandler(async (event) => {
  await requireUnscopedPermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const conversation = await conversationService.getById(id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }
  // Under VITEST the extractor returns a deterministic stub, so no key is required.
  if (!isAiConfigured() && !process.env.VITEST) {
    throw createError({ statusCode: 503, statusMessage: 'AI is not configured' })
  }

  try {
    return await extractKnowledgeEntry(id)
  } catch (error) {
    handleApiError(error, 'Failed to suggest knowledge entry')
  }
})

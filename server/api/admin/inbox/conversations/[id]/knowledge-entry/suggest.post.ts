import { conversationService } from '#server/database/conversations'
import { isAnthropicConfigured } from '#server/utils/anthropic'
import { extractKnowledgeEntry } from '#server/utils/inbox/ai-knowledge-extract'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Suggest an anonymised knowledge-base entry from a conversation (requires inbox.send).
 * Returns a proposal { question, answer, language, removed } for human review — does NOT save.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const conversation = await conversationService.getById(id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }
  // Under VITEST the extractor returns a deterministic stub, so no key is required.
  if (!isAnthropicConfigured() && !process.env.VITEST) {
    throw createError({ statusCode: 503, statusMessage: 'AI is not configured' })
  }

  try {
    return await extractKnowledgeEntry(id)
  } catch (error) {
    handleApiError(error, 'Failed to suggest knowledge entry')
  }
})

import { messageService } from '#server/database/conversation-messages'
import { isAiConfigured } from '#server/utils/ai'
import { translateInboxMessage } from '#server/utils/inbox/translate-message'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'
import { ENABLED_LANGUAGE_CODES } from '~/utils/languages'

/**
 * Translate one message into an app language and save it on the message for every teammate.
 *
 * Body: { language_code, force? }
 *  - language_code: target language, one of the enabled app languages
 *  - force: re-translate even when a saved translation exists (replaces it)
 *
 * Returns { message } with its `translations` map.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'inbox.view')

  const conversationId = getIntParam(event, 'id')
  const messageId = getIntParam(event, 'messageId')
  const message = await messageService.getById(messageId)
  if (!message || message.conversation_id !== conversationId || message.status === 'draft') {
    throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  }

  const body = await readBody<{ language_code?: string; force?: boolean }>(event)
  const languageCode = body?.language_code
  if (!languageCode || !ENABLED_LANGUAGE_CODES.includes(languageCode)) {
    throw createError({ statusCode: 400, statusMessage: 'A supported language_code is required' })
  }

  if (message.translations?.[languageCode] && !body.force) {
    return { message }
  }

  // Under VITEST the translator returns a deterministic stub, so no key is required.
  if (!isAiConfigured() && !process.env.VITEST) {
    throw createError({ statusCode: 503, statusMessage: 'AI translation is not configured' })
  }

  try {
    const result = await translateInboxMessage(message, languageCode)
    const updated = await messageService.saveTranslation(messageId, languageCode, {
      text: result.text,
      source_language: result.source_language,
      model: result.model,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
    })

    logUpdate('conversations', String(conversationId), event, { message: `Message translated into ${languageCode}` })

    return { message: updated }
  } catch (error) {
    handleApiError(error, 'Failed to translate message')
  }
})

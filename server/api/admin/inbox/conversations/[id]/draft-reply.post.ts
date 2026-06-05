import { conversationService } from '#server/database/conversations'
import { messageService, type AiDraftMetadata } from '#server/database/conversation-messages'
import { userService } from '#server/database/users'
import { isAnthropicConfigured } from '#server/utils/anthropic'
import { generateInboxDraft } from '#server/utils/inbox/ai-draft'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Generate an AI draft reply for a conversation (requires inbox.send).
 *
 * Body: { from_identity?, draft_id? }
 *  - from_identity: 'personal' (sender alias) | 'contact' (general address), as in messages.post
 *  - draft_id: when regenerating, overwrite this existing draft instead of creating a new one
 *
 * Always produces a `draft` message marked ai_generated, with reviewer-facing metadata
 * (English gloss, sources, uncertainty) in ai_metadata. Never sends — a human reviews + sends.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const conversation = await conversationService.getById(id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  // Under VITEST the generator returns a deterministic stub, so no key is required.
  if (!isAnthropicConfigured() && !process.env.VITEST) {
    throw createError({ statusCode: 503, statusMessage: 'AI drafting is not configured' })
  }

  const body = await readBody<{ from_identity?: 'personal' | 'contact'; draft_id?: number }>(event)

  // Resolve the From address the same way messages.post.ts does.
  const config = useRuntimeConfig()
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const sender = await userService.getUserById(auth.userId)
  const useContact = body.from_identity === 'contact' || !sender?.email_alias
  const fromEmail = useContact ? contactAddress : `${sender!.email_alias}@${inboxDomain}`

  try {
    const draft = await generateInboxDraft(id)
    const meta: AiDraftMetadata = {
      gloss: draft.english_gloss,
      language: draft.draft_language,
      sources: draft.sources_used,
      uncertainty: draft.uncertainty,
      model: config.inboxAiModel || 'claude-sonnet-4-6',
    }

    // Regenerate overwrites the existing draft slot; otherwise create a fresh draft.
    if (body.draft_id) {
      const existing = await messageService.getById(body.draft_id)
      if (existing && existing.status === 'draft' && existing.conversation_id === id) {
        const updated = await messageService.updateAiDraft(body.draft_id, {
          body_html: draft.draft_html,
          body_text: draft.draft_text,
          from_email: fromEmail,
          ai_metadata: meta,
        })
        return { message: updated, draft: true }
      }
    }

    const created = await messageService.create({
      conversation_id: id,
      direction: 'outbound',
      status: 'draft',
      sender_user_id: auth.userId,
      from_email: fromEmail,
      subject: conversation.subject,
      body_html: draft.draft_html,
      body_text: draft.draft_text,
      ai_generated: true,
      ai_metadata: meta,
    })

    logCreate('conversations', String(id), event, { message: 'AI draft generated', direction: 'outbound' })

    return { message: created, draft: true }
  } catch (error) {
    handleApiError(error, 'Failed to generate draft')
  }
})

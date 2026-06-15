import { conversationService } from '#server/database/conversations'
import { messageService, type AiDraftMetadata } from '#server/database/conversation-messages'
import { userService } from '#server/database/users'
import { isAnthropicConfigured } from '#server/utils/anthropic'
import { generateInboxDraft } from '#server/utils/inbox/ai-draft'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Generate an AI draft reply for a conversation (requires inbox.send).
 *
 * Body: { from_identity?, draft_id?, direction?, base_draft?, preview? }
 *  - from_identity: 'personal' (sender alias) | 'contact' (general address), as in messages.post
 *  - draft_id: when regenerating, overwrite this existing draft instead of creating a new one
 *  - direction: optional free-text steer for the draft (e.g. "ask them to sign up …")
 *  - base_draft: optional current draft text to revise rather than start over (refine)
 *  - preview: when true, return the generated draft WITHOUT persisting a message —
 *    used by the draft modal's generate/refine loop so iterating leaves no stray drafts
 *
 * The persisting path produces a `draft` message marked ai_generated, with reviewer-facing
 * metadata (English gloss, sources, uncertainty) in ai_metadata. Never sends — a human reviews + sends.
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

  const body = await readBody<{
    from_identity?: 'personal' | 'contact'
    draft_id?: number
    direction?: string
    base_draft?: string
    preview?: boolean
  }>(event)

  // Free-text steer from the reviewer. Trimmed and capped so it can't bloat the prompt.
  const direction = typeof body.direction === 'string' ? body.direction.trim().slice(0, 2000) : ''
  // The current draft to revise (refine loop). Capped generously — drafts can be long.
  const baseDraft = typeof body.base_draft === 'string' ? body.base_draft.trim().slice(0, 20000) : ''

  // Resolve the From address the same way messages.post.ts does.
  const config = useRuntimeConfig()
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const sender = await userService.getUserById(auth.userId)
  const useContact = body.from_identity === 'contact' || !sender?.email_alias
  const fromEmail = useContact ? contactAddress : `${sender!.email_alias}@${inboxDomain}`

  try {
    const draft = await generateInboxDraft(id, {
      direction: direction || undefined,
      baseDraft: baseDraft || undefined,
    })

    // Preview: hand the generated draft straight back without writing a message, so the
    // modal can generate/refine repeatedly and only the final "Use response" persists.
    if (body.preview) {
      return {
        preview: true,
        draft_language: draft.draft_language,
        draft_html: draft.draft_html,
        draft_text: draft.draft_text,
        english_gloss: draft.english_gloss,
        sources_used: draft.sources_used,
        uncertainty: draft.uncertainty,
      }
    }

    const meta: AiDraftMetadata = {
      gloss: draft.english_gloss,
      language: draft.draft_language,
      sources: draft.sources_used,
      uncertainty: draft.uncertainty,
      model: config.inboxAiModel || 'claude-sonnet-4-6',
    }

    // Regenerate overwrites the existing draft slot — but only when that draft is itself
    // AI-generated. A human-written draft is never overwritten; a fresh draft is created
    // alongside it instead.
    if (body.draft_id) {
      const existing = await messageService.getById(body.draft_id)
      if (existing && existing.status === 'draft' && existing.conversation_id === id && existing.ai_generated) {
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

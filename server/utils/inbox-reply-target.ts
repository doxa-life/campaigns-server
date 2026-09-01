import { messageService, type ConversationMessage } from '#server/database/conversation-messages'
import { contactMethodService, type SuppressionReason } from '#server/database/contact-methods'

/**
 * Deliverability snapshot of the address a reply to a conversation would go to.
 * Wire shape (snake_case) — returned as-is by the conversation detail endpoint.
 */
export interface ReplyEmailStatus {
  // Null when a reply cannot be delivered (no subscriber, or no contact email).
  email: string | null
  verified: boolean
  suppressed_at: string | null
  suppression_reason: SuppressionReason | null
  bounce_count: number
}

/**
 * Resolve the address an outbound reply will be sent to, mirroring the outbound
 * processor (server/jobs/processors/outbound-email.ts): the address that last
 * wrote in, else the subscriber's primary email. getLastInbound is received-only,
 * so a held/wrong-From sender who knew the reply token can't become the target.
 * A subscriber-less conversation returns null — the processor refuses to send those.
 */
export async function resolveReplyTargetEmail(
  conversationId: number,
  subscriberId: number | null,
  lastInbound?: ConversationMessage | null
): Promise<string | null> {
  if (!subscriberId) return null
  const inbound = lastInbound !== undefined ? lastInbound : await messageService.getLastInbound(conversationId)
  return inbound?.from_email
    || (await contactMethodService.getPrimaryEmail(subscriberId))?.value
    || null
}

export async function getReplyEmailStatus(
  conversationId: number,
  subscriberId: number | null
): Promise<ReplyEmailStatus> {
  const email = await resolveReplyTargetEmail(conversationId, subscriberId)
  if (!email) {
    return { email: null, verified: false, suppressed_at: null, suppression_reason: null, bounce_count: 0 }
  }
  // An address with no registry row has never been verified and never bounced.
  const contact = await contactMethodService.getByValue('email', email)
  return {
    email,
    verified: contact?.verified ?? false,
    suppressed_at: contact?.suppressed_at ?? null,
    suppression_reason: contact?.suppression_reason ?? null,
    bounce_count: contact?.bounce_count ?? 0,
  }
}

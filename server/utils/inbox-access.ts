import type { H3Event } from 'h3'
import { requirePermission } from './auth'
import { roleService } from '../database/roles'
import { conversationService, type Conversation } from '../database/conversations'
import { userService, type User } from '../database/users'

export type InboxPermission = 'inbox.view' | 'inbox.send'

export interface InboxAccess {
  userId: string
  email: string
  display_name?: string
  /** The grant is limited to conversations assigned to this user (a Personal Inbox Agent). */
  assignedOnly: boolean
}

/**
 * requirePermission for the inbox, plus whether the grant is limited to the caller's own
 * conversations. Every inbox handler that reads or changes a conversation goes through this
 * so the scope is applied the same way everywhere.
 */
export async function requireInboxAccess(event: H3Event, permission: InboxPermission): Promise<InboxAccess> {
  const user = await requirePermission(event, permission)
  const assignedOnly = await roleService.isAssignedScoped(user.userId, permission)
  return { userId: user.userId, email: user.email, display_name: user.display_name, assignedOnly }
}

/** Whether the caller may see this conversation under their inbox scope. */
export function canAccessConversation(
  access: Pick<InboxAccess, 'userId' | 'assignedOnly'>,
  conversation: Pick<Conversation, 'assigned_user_id'>,
): boolean {
  return !access.assignedOnly || conversation.assigned_user_id === access.userId
}

/**
 * Load a conversation the caller may act on. One outside their scope is reported as missing,
 * the same as one that doesn't exist, so an assigned-only agent can't probe for other ids.
 */
export async function requireAccessibleConversation(access: InboxAccess, id: number): Promise<Conversation> {
  const conversation = await conversationService.getById(id)
  if (!conversation || !canAccessConversation(access, conversation)) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }
  return conversation
}

/**
 * Ownership gate for endpoints outside the inbox (notes, activity) that address a conversation
 * by id: a user whose inbox access is assigned-only may only reach their own conversations.
 */
export async function requireConversationVisible(userId: string, conversationId: number): Promise<void> {
  const assignedOnly = await roleService.isAssignedScoped(userId, 'inbox.view')
  if (!assignedOnly) return
  const conversation = await conversationService.getById(conversationId)
  if (!conversation || conversation.assigned_user_id !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }
}

export interface SendIdentity {
  sender: User | null
  /** The message goes out from the general contact address rather than the sender's alias. */
  useContact: boolean
  fromEmail: string
}

/**
 * The From address for an outbound message. A full agent chooses between their alias and the
 * general contact address (and falls back to the contact address without an alias). An
 * assigned-only agent always sends from their alias and cannot send until one is set.
 */
export async function resolveSendIdentity(access: InboxAccess, fromIdentity?: 'personal' | 'contact'): Promise<SendIdentity> {
  const config = useRuntimeConfig()
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const sender = await userService.getUserById(access.userId)
  if (access.assignedOnly && !sender?.email_alias) {
    throw createError({ statusCode: 403, statusMessage: 'Sending requires an email alias — ask an admin to set one' })
  }
  const useContact = !access.assignedOnly && (fromIdentity === 'contact' || !sender?.email_alias)
  const fromEmail = useContact ? contactAddress : `${sender!.email_alias}@${inboxDomain}`
  return { sender, useContact, fromEmail }
}

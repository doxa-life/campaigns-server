/**
 * Persistence for portfolio assistant chats: conversations (one per user and
 * scope) and their messages. Every reader takes the owner's user id, so a
 * conversation is only ever visible to the user who started it.
 */

import type { JSONValue } from 'postgres'
import { contextDb, type SqlClient } from './context-portfolios'

export type ContextProposalStatus = 'pending' | 'applied' | 'rejected'

/**
 * One section update the assistant proposed in a message. Stored as JSON on the
 * message so it can be applied or rejected later; `status` records the decision.
 */
export interface ContextAssistantProposal {
  portfolio_slug: string
  portfolio_name: string
  section_key: string
  section_title: string
  current_content: string
  proposed_content: string
  status: ContextProposalStatus
}

export interface ContextConversation {
  id: string
  user_id: string
  portfolio_id: string | null
  section_key: string | null
  title: string
  created_at: string
  updated_at: string
}

export interface ContextConversationListItem extends ContextConversation {
  portfolio_slug: string | null
  portfolio_name: string | null
  message_count: number
}

export interface ContextMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  proposals: ContextAssistantProposal[]
  context_loaded: string[]
  created_at: string
}

export interface ConversationScope {
  portfolioId: string | null
  sectionKey: string | null
}

/** Most recent conversations returned for one scope. */
export const MAX_CONVERSATIONS_LISTED = 50

/** Most recent messages replayed to the model as history. */
export const HISTORY_LIMIT = 30

export async function listConversations(
  userId: string,
  scope: ConversationScope,
  db?: SqlClient
): Promise<ContextConversationListItem[]> {
  const sql = contextDb(db)
  return await sql`
    SELECT c.id, c.user_id, c.portfolio_id, c.section_key, c.title, c.created_at, c.updated_at,
           p.slug AS portfolio_slug, p.name AS portfolio_name,
           (SELECT COUNT(*)::int FROM context_assistant_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM context_assistant_conversations c
    LEFT JOIN context_portfolios p ON p.id = c.portfolio_id
    WHERE c.user_id = ${userId}
      AND c.portfolio_id IS NOT DISTINCT FROM ${scope.portfolioId}
      AND c.section_key IS NOT DISTINCT FROM ${scope.sectionKey}
    ORDER BY c.updated_at DESC
    LIMIT ${MAX_CONVERSATIONS_LISTED}
  ` as unknown as ContextConversationListItem[]
}

export async function createConversation(
  userId: string,
  scope: ConversationScope,
  db?: SqlClient
): Promise<ContextConversation> {
  const sql = contextDb(db)
  const [row] = await sql`
    INSERT INTO context_assistant_conversations (user_id, portfolio_id, section_key)
    VALUES (${userId}, ${scope.portfolioId}, ${scope.sectionKey})
    RETURNING id, user_id, portfolio_id, section_key, title, created_at, updated_at
  `
  return row as ContextConversation
}

export async function getOwnedConversation(
  id: string,
  userId: string,
  db?: SqlClient
): Promise<ContextConversation | null> {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT id, user_id, portfolio_id, section_key, title, created_at, updated_at
    FROM context_assistant_conversations
    WHERE id = ${id} AND user_id = ${userId}
  `
  return (row as ContextConversation) || null
}

export async function getOwnedConversationOr404(
  id: string,
  userId: string,
  db?: SqlClient
): Promise<ContextConversation> {
  const conversation = await getOwnedConversation(id, userId, db)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }
  return conversation
}

export async function deleteConversation(
  id: string,
  userId: string,
  db?: SqlClient
): Promise<boolean> {
  const sql = contextDb(db)
  const result = await sql`
    DELETE FROM context_assistant_conversations WHERE id = ${id} AND user_id = ${userId}
  `
  return result.count > 0
}

export async function listMessages(conversationId: string, db?: SqlClient): Promise<ContextMessage[]> {
  const sql = contextDb(db)
  return await sql`
    SELECT id, conversation_id, role, content, proposals, context_loaded, created_at
    FROM context_assistant_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC, id ASC
  ` as unknown as ContextMessage[]
}

export async function getMessageInConversation(
  conversationId: string,
  messageId: string,
  db?: SqlClient
): Promise<ContextMessage | null> {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT id, conversation_id, role, content, proposals, context_loaded, created_at
    FROM context_assistant_messages
    WHERE conversation_id = ${conversationId} AND id = ${messageId}
  `
  return (row as ContextMessage) || null
}

export interface InsertMessageInput {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  proposals?: ContextAssistantProposal[]
  contextLoaded?: string[]
}

export async function insertMessage(input: InsertMessageInput, db?: SqlClient): Promise<ContextMessage> {
  const sql = contextDb(db)
  // clock_timestamp() rather than the column default: both turns of an exchange
  // are inserted in one transaction, where now() is identical for each, and the
  // message list orders by this column.
  const [row] = await sql`
    INSERT INTO context_assistant_messages
      (conversation_id, role, content, proposals, context_loaded, created_at)
    VALUES (
      ${input.conversationId}, ${input.role}, ${input.content},
      ${sql.json((input.proposals ?? []) as unknown as JSONValue)}, ${sql.json((input.contextLoaded ?? []) as unknown as JSONValue)},
      clock_timestamp()
    )
    RETURNING id, conversation_id, role, content, proposals, context_loaded, created_at
  `
  return row as ContextMessage
}

export function deriveConversationTitle(message: string): string {
  const line = message.replace(/\s+/g, ' ').trim()
  return line.length > 80 ? `${line.slice(0, 77)}…` : line
}

/**
 * Bump `updated_at` so the conversation sorts to the top of its scope's list,
 * and give an untitled conversation its title from the first user message.
 */
export async function touchConversation(
  id: string,
  firstUserMessage?: string,
  db?: SqlClient
): Promise<void> {
  const sql = contextDb(db)
  if (firstUserMessage !== undefined) {
    await sql`
      UPDATE context_assistant_conversations
      SET title = ${deriveConversationTitle(firstUserMessage)}
      WHERE id = ${id} AND title = ''
    `
  }
  await sql`UPDATE context_assistant_conversations SET updated_at = NOW() WHERE id = ${id}`
}

export async function setProposalStatus(
  message: ContextMessage,
  index: number,
  status: ContextProposalStatus,
  db?: SqlClient
): Promise<ContextAssistantProposal[]> {
  const sql = contextDb(db)
  const proposals = message.proposals.map((p, i) => (i === index ? { ...p, status } : p))
  await sql`
    UPDATE context_assistant_messages
    SET proposals = ${sql.json(proposals as unknown as JSONValue)}
    WHERE id = ${message.id}
  `
  return proposals
}

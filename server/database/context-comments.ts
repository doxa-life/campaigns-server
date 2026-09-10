/**
 * Inline comments on portfolio sections, with threaded replies.
 *
 * A comment anchors to a character range of the section content plus the exact
 * quoted text. On read the range is re-sliced from the current content: when it
 * no longer matches the quote the comment is reported as stale rather than
 * silently pointing at different words.
 */

import crypto from 'crypto'
import { contextDb, type SqlClient } from './context-portfolios'

export interface ContextCommentReply {
  id: string
  comment_id: string
  author_id: string | null
  author_name: string | null
  content: string
  created_at: string
}

export interface ContextComment {
  id: string
  section_id: string
  author_id: string | null
  author_name: string | null
  quoted_text: string
  anchor_start: number
  anchor_end: number
  anchor_hash: string
  content: string
  is_resolved: boolean
  resolved_by: string | null
  resolved_by_name: string | null
  resolved_at: string | null
  created_at: string
  anchor_stale: boolean
  replies: ContextCommentReply[]
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

export function isAnchorStale(
  sectionContent: string,
  anchorStart: number,
  anchorEnd: number,
  quotedText: string
): boolean {
  if (anchorStart < 0 || anchorEnd > sectionContent.length || anchorStart > anchorEnd) return true
  return sectionContent.slice(anchorStart, anchorEnd) !== quotedText
}

export async function listComments(
  sectionId: string,
  sectionContent: string,
  includeResolved: boolean,
  db?: SqlClient
): Promise<ContextComment[]> {
  const sql = contextDb(db)
  const rows = await sql`
    SELECT c.id, c.section_id, c.author_id, c.quoted_text, c.anchor_start, c.anchor_end,
           c.anchor_hash, c.content, c.is_resolved, c.resolved_by, c.resolved_at, c.created_at,
           a.display_name AS author_name,
           r.display_name AS resolved_by_name
    FROM context_section_comments c
    LEFT JOIN users a ON a.id = c.author_id
    LEFT JOIN users r ON r.id = c.resolved_by
    WHERE c.section_id = ${sectionId}
      AND (${includeResolved} OR c.is_resolved = false)
    ORDER BY c.created_at ASC
  ` as unknown as Array<Omit<ContextComment, 'anchor_stale' | 'replies'>>

  if (rows.length === 0) return []

  const ids = rows.map(r => r.id)
  const replyRows = await sql`
    SELECT r.id, r.comment_id, r.author_id, r.content, r.created_at, u.display_name AS author_name
    FROM context_section_comment_replies r
    LEFT JOIN users u ON u.id = r.author_id
    WHERE r.comment_id = ANY(${ids}::uuid[])
    ORDER BY r.created_at ASC
  ` as unknown as ContextCommentReply[]

  const repliesByComment = new Map<string, ContextCommentReply[]>()
  for (const reply of replyRows) {
    const list = repliesByComment.get(reply.comment_id) ?? []
    list.push(reply)
    repliesByComment.set(reply.comment_id, list)
  }

  return rows.map(row => ({
    ...row,
    anchor_stale: isAnchorStale(sectionContent, row.anchor_start, row.anchor_end, row.quoted_text),
    replies: repliesByComment.get(row.id) ?? []
  }))
}

export interface CreateCommentInput {
  sectionId: string
  authorId: string
  content: string
  quotedText: string
  anchorStart: number
  anchorEnd: number
}

export async function createComment(input: CreateCommentInput, db?: SqlClient) {
  const sql = contextDb(db)
  const [row] = await sql`
    INSERT INTO context_section_comments
      (section_id, author_id, quoted_text, anchor_start, anchor_end, anchor_hash, content)
    VALUES (
      ${input.sectionId}, ${input.authorId}, ${input.quotedText},
      ${input.anchorStart}, ${input.anchorEnd}, ${sha256(input.quotedText)}, ${input.content}
    )
    RETURNING id, section_id, author_id, quoted_text, anchor_start, anchor_end,
              anchor_hash, content, is_resolved, resolved_by, resolved_at, created_at
  `
  return row
}

export async function getComment(commentId: string, sectionId: string, db?: SqlClient) {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT id, author_id FROM context_section_comments
    WHERE id = ${commentId} AND section_id = ${sectionId}
  `
  return (row as { id: string, author_id: string | null }) || null
}

export async function deleteComment(commentId: string, db?: SqlClient): Promise<boolean> {
  const sql = contextDb(db)
  const result = await sql`DELETE FROM context_section_comments WHERE id = ${commentId}`
  return result.count > 0
}

export async function setCommentResolved(
  commentId: string,
  sectionId: string,
  resolved: boolean,
  userId: string,
  db?: SqlClient
) {
  const sql = contextDb(db)
  const [row] = resolved
    ? await sql`
        UPDATE context_section_comments
        SET is_resolved = true, resolved_by = ${userId}, resolved_at = NOW()
        WHERE id = ${commentId} AND section_id = ${sectionId}
        RETURNING id, is_resolved, resolved_by, resolved_at
      `
    : await sql`
        UPDATE context_section_comments
        SET is_resolved = false, resolved_by = NULL, resolved_at = NULL
        WHERE id = ${commentId} AND section_id = ${sectionId}
        RETURNING id, is_resolved, resolved_by, resolved_at
      `
  return row || null
}

export async function createReply(
  commentId: string,
  authorId: string,
  content: string,
  db?: SqlClient
) {
  const sql = contextDb(db)
  const [row] = await sql`
    INSERT INTO context_section_comment_replies (comment_id, author_id, content)
    VALUES (${commentId}, ${authorId}, ${content})
    RETURNING id, comment_id, author_id, content, created_at
  `
  return row
}

export async function getReply(
  replyId: string,
  commentId: string,
  sectionId: string,
  db?: SqlClient
) {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT r.id, r.author_id, r.comment_id
    FROM context_section_comment_replies r
    JOIN context_section_comments c ON c.id = r.comment_id
    WHERE r.id = ${replyId} AND r.comment_id = ${commentId} AND c.section_id = ${sectionId}
  `
  return (row as { id: string, author_id: string | null, comment_id: string }) || null
}

export async function deleteReply(replyId: string, db?: SqlClient): Promise<boolean> {
  const sql = contextDb(db)
  const result = await sql`DELETE FROM context_section_comment_replies WHERE id = ${replyId}`
  return result.count > 0
}

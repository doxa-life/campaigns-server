import { describe, it, expect, afterAll } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase } from '../../../helpers/db'
import { conversationService } from '../../../../server/database/conversations'

const QUIET_DAYS = 14

describe('Inbox auto-close of stale pending conversations', async () => {
  const sql = getTestDatabase()
  const createdIds: number[] = []

  afterAll(async () => {
    if (createdIds.length) {
      await sql`DELETE FROM conversations WHERE id = ANY(${createdIds})`
    }
    await closeTestDatabase()
  })

  async function makeConversation(opts: {
    status?: string
    needs_review?: boolean
    lastMessageDaysAgo?: number | null
  } = {}): Promise<number> {
    const token = uuidv4().replace(/-/g, '').slice(0, 20)
    const lastMessageAt = opts.lastMessageDaysAgo == null
      ? null
      : new Date(Date.now() - opts.lastMessageDaysAgo * 24 * 60 * 60 * 1000).toISOString()
    const [row] = await sql`
      INSERT INTO conversations (subscriber_id, status, needs_review, reply_token, subject, last_message_at, last_message_direction)
      VALUES (
        NULL,
        ${opts.status || 'pending'},
        ${opts.needs_review ?? false},
        ${token},
        'Test autoclose thread',
        ${lastMessageAt},
        ${lastMessageAt ? 'outbound' : null}
      )
      RETURNING id
    `
    createdIds.push(row!.id)
    return row!.id as number
  }

  it('closes a pending conversation quiet for longer than the threshold', async () => {
    const id = await makeConversation({ lastMessageDaysAgo: QUIET_DAYS + 1 })

    const closed = await conversationService.autoCloseStalePending(QUIET_DAYS)

    expect(closed.find(c => c.id === id)).toBeDefined()
    const [row] = await sql`SELECT status FROM conversations WHERE id = ${id}`
    expect(row!.status).toBe('closed')
  })

  it('leaves a pending conversation quiet for less than the threshold', async () => {
    const id = await makeConversation({ lastMessageDaysAgo: QUIET_DAYS - 9 })

    const closed = await conversationService.autoCloseStalePending(QUIET_DAYS)

    expect(closed.find(c => c.id === id)).toBeUndefined()
    const [row] = await sql`SELECT status FROM conversations WHERE id = ${id}`
    expect(row!.status).toBe('pending')
  })

  it('leaves open conversations regardless of how long they have been quiet', async () => {
    const id = await makeConversation({ status: 'open', lastMessageDaysAgo: QUIET_DAYS + 30 })

    const closed = await conversationService.autoCloseStalePending(QUIET_DAYS)

    expect(closed.find(c => c.id === id)).toBeUndefined()
    const [row] = await sql`SELECT status FROM conversations WHERE id = ${id}`
    expect(row!.status).toBe('open')
  })

  it('leaves pending conversations flagged for review', async () => {
    const id = await makeConversation({ needs_review: true, lastMessageDaysAgo: QUIET_DAYS + 30 })

    const closed = await conversationService.autoCloseStalePending(QUIET_DAYS)

    expect(closed.find(c => c.id === id)).toBeUndefined()
    const [row] = await sql`SELECT status, needs_review FROM conversations WHERE id = ${id}`
    expect(row!.status).toBe('pending')
    expect(row!.needs_review).toBe(true)
  })

  it('leaves pending conversations with no sent message', async () => {
    const id = await makeConversation({ lastMessageDaysAgo: null })

    const closed = await conversationService.autoCloseStalePending(QUIET_DAYS)

    expect(closed.find(c => c.id === id)).toBeUndefined()
    const [row] = await sql`SELECT status FROM conversations WHERE id = ${id}`
    expect(row!.status).toBe('pending')
  })
})

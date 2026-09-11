import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, createTranslatorUser } from '../../../helpers/auth'

interface Portfolio { id: string, slug: string }
interface Conversation { id: string, portfolio_id: string | null, section_key: string | null, title: string }
interface ProposalRow {
  section_key: string
  proposed_content: string
  status: 'pending' | 'applied' | 'rejected'
}

describe('Context assistant', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }
  let adminId: string
  let viewerAuth: { headers: { cookie: string } }
  let viewerId: string
  let portfolio: Portfolio

  /**
   * Seed an assistant reply that carries a pending proposal. The model call
   * itself needs a live provider, so the tests drive the decision endpoint from
   * a stored turn instead.
   */
  async function seedProposalMessage(conversationId: string, proposedContent: string): Promise<string> {
    const proposal = {
      portfolio_slug: portfolio.slug,
      portfolio_name: 'Test Context Assistant',
      section_key: 'team',
      section_title: 'Team',
      current_content: 'Ada leads engineering.',
      proposed_content: proposedContent,
      status: 'pending'
    }
    const [row] = await sql`
      INSERT INTO context_assistant_messages (conversation_id, role, content, proposals)
      VALUES (${conversationId}, 'assistant', 'Here is an update.', ${sql.json([proposal] as never)})
      RETURNING id
    `
    return row!.id as string
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
    adminId = admin.user.id
    const viewer = await createTranslatorUser(sql)
    viewerAuth = viewer.auth
    viewerId = viewer.user.id

    portfolio = await $fetch<Portfolio>('/api/admin/context/portfolios', {
      method: 'POST',
      body: {
        name: 'Test Context Assistant',
        slug: `test-context-assistant-${Date.now()}`,
        builtin_sections: ['team']
      },
      ...adminAuth
    })
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'Ada leads engineering.' },
      ...adminAuth
    })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('scopes a conversation to a section, a portfolio, or everything', async () => {
    const sectionChat = await $fetch<{ conversation: Conversation }>('/api/admin/context/assistant/conversations', {
      method: 'POST',
      body: { portfolio: portfolio.slug, section: 'team' },
      ...adminAuth
    })
    const portfolioChat = await $fetch<{ conversation: Conversation }>('/api/admin/context/assistant/conversations', {
      method: 'POST',
      body: { portfolio: portfolio.slug },
      ...adminAuth
    })
    const allChat = await $fetch<{ conversation: Conversation }>('/api/admin/context/assistant/conversations', {
      method: 'POST',
      body: {},
      ...adminAuth
    })

    expect(sectionChat.conversation).toMatchObject({ portfolio_id: portfolio.id, section_key: 'team' })
    expect(portfolioChat.conversation).toMatchObject({ portfolio_id: portfolio.id, section_key: null })
    expect(allChat.conversation).toMatchObject({ portfolio_id: null, section_key: null })

    const listed = await $fetch<{ conversations: Conversation[] }>(
      `/api/admin/context/assistant/conversations?portfolio=${portfolio.slug}&section=team`,
      adminAuth
    )
    expect(listed.conversations.map(c => c.id)).toEqual([sectionChat.conversation.id])
  })

  it('rejects a section scope with no portfolio, and an unknown section', async () => {
    await expect($fetch('/api/admin/context/assistant/conversations', {
      method: 'POST',
      body: { section: 'team' },
      ...adminAuth
    })).rejects.toMatchObject({ status: 400 })

    await expect($fetch('/api/admin/context/assistant/conversations', {
      method: 'POST',
      body: { portfolio: portfolio.slug, section: 'glossary' },
      ...adminAuth
    })).rejects.toMatchObject({ status: 404 })
  })

  it('keeps one user conversations invisible to another', async () => {
    const mine = await $fetch<{ conversation: Conversation }>('/api/admin/context/assistant/conversations', {
      method: 'POST',
      body: {},
      ...adminAuth
    })

    const theirs = await $fetch<{ conversations: Conversation[] }>(
      '/api/admin/context/assistant/conversations',
      viewerAuth
    )
    expect(theirs.conversations.map(c => c.id)).not.toContain(mine.conversation.id)

    await expect($fetch(`/api/admin/context/assistant/conversations/${mine.conversation.id}`, viewerAuth))
      .rejects.toMatchObject({ status: 404 })

    await expect($fetch(`/api/admin/context/assistant/conversations/${mine.conversation.id}`, {
      method: 'DELETE',
      ...viewerAuth
    })).rejects.toMatchObject({ status: 404 })
  })

  it('applies a proposal through the section writer, versioned as assistant work', async () => {
    const { conversation } = await $fetch<{ conversation: Conversation }>(
      '/api/admin/context/assistant/conversations',
      { method: 'POST', body: { portfolio: portfolio.slug }, ...adminAuth }
    )
    const messageId = await seedProposalMessage(conversation.id, 'Ada leads engineering. Grace runs translation.')

    const result = await $fetch<{ proposal: ProposalRow, version_id: string }>(
      `/api/admin/context/assistant/conversations/${conversation.id}/proposals`,
      { method: 'POST', body: { message_id: messageId, index: 0, action: 'apply' }, ...adminAuth }
    )
    expect(result.proposal.status).toBe('applied')

    const detail = await $fetch<{ content: string }>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections/team`,
      adminAuth
    )
    expect(detail.content).toBe('Ada leads engineering. Grace runs translation.')

    const { versions } = await $fetch<{ versions: Array<{ id: string, source: string | null }> }>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections/team/versions`,
      adminAuth
    )
    expect(versions[0]).toMatchObject({ id: result.version_id, source: 'assistant' })
  })

  it('refuses to decide the same proposal twice', async () => {
    const { conversation } = await $fetch<{ conversation: Conversation }>(
      '/api/admin/context/assistant/conversations',
      { method: 'POST', body: { portfolio: portfolio.slug }, ...adminAuth }
    )
    const messageId = await seedProposalMessage(conversation.id, 'Rejected text.')

    const rejected = await $fetch<{ proposal: ProposalRow }>(
      `/api/admin/context/assistant/conversations/${conversation.id}/proposals`,
      { method: 'POST', body: { message_id: messageId, index: 0, action: 'reject' }, ...adminAuth }
    )
    expect(rejected.proposal.status).toBe('rejected')

    await expect($fetch(`/api/admin/context/assistant/conversations/${conversation.id}/proposals`, {
      method: 'POST',
      body: { message_id: messageId, index: 0, action: 'apply' },
      ...adminAuth
    })).rejects.toMatchObject({ status: 409 })
  })

  it('lets a viewer reject a proposal but not apply one', async () => {
    const [conversation] = await sql`
      INSERT INTO context_assistant_conversations (user_id, portfolio_id)
      VALUES (${viewerId}, ${portfolio.id})
      RETURNING id
    `
    const conversationId = conversation!.id as string
    const messageId = await seedProposalMessage(conversationId, 'Viewer edit.')

    await expect($fetch(`/api/admin/context/assistant/conversations/${conversationId}/proposals`, {
      method: 'POST',
      body: { message_id: messageId, index: 0, action: 'apply' },
      ...viewerAuth
    })).rejects.toMatchObject({ status: 403 })

    const rejected = await $fetch<{ proposal: ProposalRow }>(
      `/api/admin/context/assistant/conversations/${conversationId}/proposals`,
      { method: 'POST', body: { message_id: messageId, index: 0, action: 'reject' }, ...viewerAuth }
    )
    expect(rejected.proposal.status).toBe('rejected')
  })

  it('reports whether the caller may apply proposals', async () => {
    const [adminChat] = await sql`
      INSERT INTO context_assistant_conversations (user_id) VALUES (${adminId}) RETURNING id
    `
    const [viewerChat] = await sql`
      INSERT INTO context_assistant_conversations (user_id) VALUES (${viewerId}) RETURNING id
    `

    const asAdmin = await $fetch<{ can_apply: boolean }>(
      `/api/admin/context/assistant/conversations/${adminChat!.id}`,
      adminAuth
    )
    const asViewer = await $fetch<{ can_apply: boolean }>(
      `/api/admin/context/assistant/conversations/${viewerChat!.id}`,
      viewerAuth
    )

    expect(asAdmin.can_apply).toBe(true)
    expect(asViewer.can_apply).toBe(false)
  })

  it('deletes a conversation and its messages', async () => {
    const { conversation } = await $fetch<{ conversation: Conversation }>(
      '/api/admin/context/assistant/conversations',
      { method: 'POST', body: {}, ...adminAuth }
    )
    await seedProposalMessage(conversation.id, 'Doomed.')

    await $fetch(`/api/admin/context/assistant/conversations/${conversation.id}`, {
      method: 'DELETE',
      ...adminAuth
    })

    const messages = await sql`SELECT id FROM context_assistant_messages WHERE conversation_id = ${conversation.id}`
    expect(messages).toHaveLength(0)
  })
})

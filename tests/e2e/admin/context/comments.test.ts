import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, createProgressAdminUser } from '../../../helpers/auth'

interface Portfolio { id: string, slug: string }
interface CommentRow {
  id: string
  content: string
  quoted_text: string
  author_name: string | null
  is_resolved: boolean
  anchor_stale: boolean
  resolved_by_name: string | null
  replies: Array<{ id: string, content: string, author_name: string | null }>
}

const CONTENT = 'Ada leads engineering. Grace runs translation.'

describe('Context section comments', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let adminName: string

  async function seedSection(): Promise<Portfolio> {
    const portfolio = await $fetch<Portfolio>('/api/admin/context/portfolios', {
      method: 'POST',
      body: {
        name: 'Test Context Comments',
        slug: `test-context-${Date.now()}${Math.floor(Math.random() * 10000)}`,
        builtin_sections: ['team']
      },
      ...adminAuth
    })
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: CONTENT },
      ...adminAuth
    })
    return portfolio
  }

  function commentsUrl(slug: string): string {
    return `/api/admin/context/portfolios/${slug}/sections/team/comments`
  }

  async function listComments(slug: string, includeResolved = false): Promise<CommentRow[]> {
    const { comments } = await $fetch<{ comments: CommentRow[] }>(
      `${commentsUrl(slug)}?include_resolved=${includeResolved}`,
      adminAuth
    )
    return comments
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
    adminName = admin.user.display_name
    editorAuth = (await createProgressAdminUser(sql)).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('anchors a comment to the quoted text and names its author', async () => {
    const portfolio = await seedSection()

    await $fetch(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Is this still current?', quoted_text: 'Ada leads engineering.', anchor_start: 0, anchor_end: 22 },
      ...adminAuth
    })

    const comments = await listComments(portfolio.slug)
    expect(comments).toHaveLength(1)
    expect(comments[0]).toMatchObject({
      content: 'Is this still current?',
      author_name: adminName,
      anchor_stale: false,
      is_resolved: false
    })
  })

  it('marks a comment stale once an edit moves its anchor', async () => {
    const portfolio = await seedSection()
    await $fetch(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Check this', quoted_text: 'Ada leads engineering.', anchor_start: 0, anchor_end: 22 },
      ...adminAuth
    })

    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: `Team notes.\n\n${CONTENT}` },
      ...adminAuth
    })

    const comments = await listComments(portfolio.slug)
    expect(comments[0]!.anchor_stale).toBe(true)
  })

  it('threads replies under a comment', async () => {
    const portfolio = await seedSection()
    const comment = await $fetch<{ id: string }>(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Check this', quoted_text: 'Ada leads engineering.', anchor_start: 0, anchor_end: 22 },
      ...adminAuth
    })

    await $fetch(`${commentsUrl(portfolio.slug)}/${comment.id}/replies`, {
      method: 'POST',
      body: { content: 'Yes, still right.' },
      ...editorAuth
    })

    const comments = await listComments(portfolio.slug)
    expect(comments[0]!.replies).toHaveLength(1)
    expect(comments[0]!.replies[0]!.content).toBe('Yes, still right.')
  })

  it('hides resolved comments unless asked for, and reopens them', async () => {
    const portfolio = await seedSection()
    const comment = await $fetch<{ id: string }>(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Check this', quoted_text: 'Ada leads engineering.', anchor_start: 0, anchor_end: 22 },
      ...adminAuth
    })

    await $fetch(`${commentsUrl(portfolio.slug)}/${comment.id}/resolve`, { method: 'POST', ...adminAuth })
    expect(await listComments(portfolio.slug)).toHaveLength(0)

    const withResolved = await listComments(portfolio.slug, true)
    expect(withResolved[0]).toMatchObject({ is_resolved: true, resolved_by_name: adminName })

    await $fetch(`${commentsUrl(portfolio.slug)}/${comment.id}/unresolve`, { method: 'POST', ...adminAuth })
    expect(await listComments(portfolio.slug)).toHaveLength(1)
  })

  it('stops an editor from resolving comments', async () => {
    const portfolio = await seedSection()
    const comment = await $fetch<{ id: string }>(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Check this', quoted_text: 'Ada leads engineering.', anchor_start: 0, anchor_end: 22 },
      ...adminAuth
    })

    await expect($fetch(`${commentsUrl(portfolio.slug)}/${comment.id}/resolve`, {
      method: 'POST',
      ...editorAuth
    })).rejects.toMatchObject({ status: 403 })
  })

  it('stops one author deleting another author comment', async () => {
    const portfolio = await seedSection()
    const comment = await $fetch<{ id: string }>(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Mine', quoted_text: 'Ada leads engineering.', anchor_start: 0, anchor_end: 22 },
      ...adminAuth
    })

    await expect($fetch(`${commentsUrl(portfolio.slug)}/${comment.id}`, {
      method: 'DELETE',
      ...editorAuth
    })).rejects.toMatchObject({ status: 403 })

    await $fetch(`${commentsUrl(portfolio.slug)}/${comment.id}`, { method: 'DELETE', ...adminAuth })
    expect(await listComments(portfolio.slug, true)).toHaveLength(0)
  })

  it('deletes a reply for its author but not for another user', async () => {
    const portfolio = await seedSection()
    const comment = await $fetch<{ id: string }>(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Check this', quoted_text: 'Ada leads engineering.', anchor_start: 0, anchor_end: 22 },
      ...adminAuth
    })
    const reply = await $fetch<{ id: string }>(`${commentsUrl(portfolio.slug)}/${comment.id}/replies`, {
      method: 'POST',
      body: { content: 'Still right.' },
      ...editorAuth
    })

    const otherAuthor = (await createProgressAdminUser(sql)).auth
    await expect($fetch(`${commentsUrl(portfolio.slug)}/${comment.id}/replies/${reply.id}`, {
      method: 'DELETE',
      ...otherAuthor
    })).rejects.toMatchObject({ status: 403 })

    await $fetch(`${commentsUrl(portfolio.slug)}/${comment.id}/replies/${reply.id}`, {
      method: 'DELETE',
      ...editorAuth
    })
    const comments = await listComments(portfolio.slug)
    expect(comments[0]!.replies).toHaveLength(0)
  })

  it('rejects an empty comment and an anchor that ends before it starts', async () => {
    const portfolio = await seedSection()

    await expect($fetch(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: '   ', quoted_text: 'Ada', anchor_start: 0, anchor_end: 3 },
      ...adminAuth
    })).rejects.toMatchObject({ status: 400 })

    await expect($fetch(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Backwards', quoted_text: 'Ada', anchor_start: 5, anchor_end: 2 },
      ...adminAuth
    })).rejects.toMatchObject({ status: 400 })
  })

  it('creates the content row so a never-saved section can still be commented on', async () => {
    const portfolio = await $fetch<Portfolio>('/api/admin/context/portfolios', {
      method: 'POST',
      body: {
        name: 'Test Context Empty Comment',
        slug: `test-context-${Date.now()}${Math.floor(Math.random() * 10000)}`,
        builtin_sections: ['team']
      },
      ...adminAuth
    })

    await $fetch(commentsUrl(portfolio.slug), {
      method: 'POST',
      body: { content: 'Start here', quoted_text: 'x', anchor_start: 0, anchor_end: 1 },
      ...adminAuth
    })

    const comments = await listComments(portfolio.slug)
    expect(comments).toHaveLength(1)
    expect(comments[0]!.anchor_stale).toBe(true)
  })
})

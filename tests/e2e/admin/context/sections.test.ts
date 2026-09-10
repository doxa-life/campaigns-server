import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, createProgressAdminUser } from '../../../helpers/auth'

interface Portfolio { id: string, slug: string }
interface SectionMeta {
  key: string
  title: string
  description: string
  order: number
  is_custom: boolean
  word_count: number
  has_content: boolean
}
interface SectionDetail {
  key: string
  title: string
  content: string
  is_custom: boolean
  last_edited_by_name: string | null
}
interface VersionRow {
  id: string
  content: string
  source: string | null
  edited_by_name: string | null
}

describe('Context sections', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let adminName: string

  async function createPortfolio(builtins: string[] = []): Promise<Portfolio> {
    return await $fetch<Portfolio>('/api/admin/context/portfolios', {
      method: 'POST',
      body: {
        name: 'Test Context Sections',
        slug: `test-context-${Date.now()}${Math.floor(Math.random() * 10000)}`,
        builtin_sections: builtins
      },
      ...adminAuth
    })
  }

  function sectionKeys(sections: SectionMeta[]): string[] {
    return sections.map(s => s.key)
  }

  async function listSections(slug: string): Promise<SectionMeta[]> {
    const { sections } = await $fetch<{ sections: SectionMeta[] }>(
      `/api/admin/context/portfolios/${slug}/sections`,
      adminAuth
    )
    return sections
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

  it('saves content, records a version, and reports the word count', async () => {
    const portfolio = await createPortfolio(['team'])

    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'Ada leads engineering.' },
      ...adminAuth
    })

    const detail = await $fetch<SectionDetail>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections/team`,
      adminAuth
    )
    expect(detail.content).toBe('Ada leads engineering.')
    expect(detail.last_edited_by_name).toBe(adminName)

    const [meta] = await listSections(portfolio.slug)
    expect(meta).toMatchObject({ has_content: true, word_count: 3 })

    const { versions } = await $fetch<{ versions: VersionRow[] }>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections/team/versions`,
      adminAuth
    )
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ source: 'user', edited_by_name: adminName })
  })

  it('rejects content over the size limit', async () => {
    const portfolio = await createPortfolio(['team'])
    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'x'.repeat(100 * 1024 + 1) },
      ...adminAuth
    })).rejects.toMatchObject({ status: 413 })
  })

  it('refuses to write a section the portfolio does not have', async () => {
    const portfolio = await createPortfolio(['team'])
    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/glossary`, {
      method: 'PUT',
      body: { content: 'nope' },
      ...adminAuth
    })).rejects.toMatchObject({ status: 404 })
  })

  it('adds a custom section keyed by its slugified title', async () => {
    const portfolio = await createPortfolio([])

    const section = await $fetch<SectionMeta>(`/api/admin/context/portfolios/${portfolio.slug}/sections`, {
      method: 'POST',
      body: { title: 'Prayer Content Standards', description: 'House style' },
      ...adminAuth
    })
    expect(section).toMatchObject({ key: 'prayer-content-standards', is_custom: true, description: 'House style' })
  })

  it('refuses a custom section whose key collides with a built-in', async () => {
    const portfolio = await createPortfolio([])
    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections`, {
      method: 'POST',
      body: { title: 'Team' },
      ...adminAuth
    })).rejects.toMatchObject({ status: 409 })
  })

  it('refuses to add a section twice', async () => {
    const portfolio = await createPortfolio(['team'])
    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections`, {
      method: 'POST',
      body: { key: 'team' },
      ...adminAuth
    })).rejects.toMatchObject({ status: 409 })
  })

  it('keeps content when a section is removed and restores it when re-added', async () => {
    const portfolio = await createPortfolio(['team'])
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'Ada leads engineering.' },
      ...adminAuth
    })

    const removed = await $fetch<{ content_retained: boolean }>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections/team`,
      { method: 'DELETE', ...adminAuth }
    )
    expect(removed.content_retained).toBe(true)
    expect(await listSections(portfolio.slug)).toHaveLength(0)

    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections`, {
      method: 'POST',
      body: { key: 'team' },
      ...adminAuth
    })
    const detail = await $fetch<SectionDetail>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections/team`,
      adminAuth
    )
    expect(detail.content).toBe('Ada leads engineering.')
  })

  it('stores an absolute order so a custom section can sit between built-ins', async () => {
    const portfolio = await createPortfolio(['identity', 'team'])
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections`, {
      method: 'POST',
      body: { title: 'Roadmap' },
      ...adminAuth
    })

    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/section-order`, {
      method: 'PUT',
      body: { keys: ['identity', 'roadmap', 'team'] },
      ...adminAuth
    })

    expect(sectionKeys(await listSections(portfolio.slug))).toEqual(['identity', 'roadmap', 'team'])
  })

  it('rejects a reorder that does not list every section exactly once', async () => {
    const portfolio = await createPortfolio(['identity', 'team'])

    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/section-order`, {
      method: 'PUT',
      body: { keys: ['identity'] },
      ...adminAuth
    })).rejects.toMatchObject({ status: 400 })

    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/section-order`, {
      method: 'PUT',
      body: { keys: ['identity', 'identity'] },
      ...adminAuth
    })).rejects.toMatchObject({ status: 400 })

    expect(sectionKeys(await listSections(portfolio.slug))).toEqual(['identity', 'team'])
  })

  it('lets a stored title override the catalog wording for a built-in', async () => {
    const portfolio = await createPortfolio(['team'])
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PATCH',
      body: { title: 'Who We Are' },
      ...adminAuth
    })

    const [meta] = await listSections(portfolio.slug)
    expect(meta).toMatchObject({ key: 'team', title: 'Who We Are', is_custom: false })
  })

  it('restores an earlier version as a new version at the head', async () => {
    const portfolio = await createPortfolio(['team'])
    const url = `/api/admin/context/portfolios/${portfolio.slug}/sections/team`

    await $fetch(url, { method: 'PUT', body: { content: 'First draft.' }, ...adminAuth })
    await $fetch(url, { method: 'PUT', body: { content: 'Second draft.' }, ...adminAuth })

    const { versions } = await $fetch<{ versions: VersionRow[] }>(`${url}/versions`, adminAuth)
    expect(versions.map(v => v.content)).toEqual(['Second draft.', 'First draft.'])

    await $fetch(`${url}/versions/${versions[1]!.id}/restore`, { method: 'POST', ...adminAuth })

    const detail = await $fetch<SectionDetail>(url, adminAuth)
    expect(detail.content).toBe('First draft.')

    const after = await $fetch<{ versions: VersionRow[] }>(`${url}/versions`, adminAuth)
    expect(after.versions).toHaveLength(3)
    expect(after.versions[0]!.content).toBe('First draft.')
  })

  it('stops an editor from managing sections', async () => {
    const portfolio = await createPortfolio(['team'])

    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections`, {
      method: 'POST',
      body: { title: 'Roadmap' },
      ...editorAuth
    })).rejects.toMatchObject({ status: 403 })

    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'DELETE',
      ...editorAuth
    })).rejects.toMatchObject({ status: 403 })
  })
})

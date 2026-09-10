import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../../../helpers/db'
import { createAdminUser, createProgressAdminUser, createTranslatorUser } from '../../../helpers/auth'
import { CONTEXT_SECTIONS } from '../../../../config/context-sections'

interface Portfolio {
  id: string
  slug: string
  name: string
  color: string | null
  icon_url: string | null
}

interface SectionMeta {
  key: string
  title: string
  description: string
  order: number
  is_custom: boolean
  word_count: number
  has_content: boolean
}

describe('Context portfolios', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let viewerAuth: { headers: { cookie: string } }

  async function createPortfolio(body: Record<string, unknown> = {}) {
    return await $fetch<Portfolio>('/api/admin/context/portfolios', {
      method: 'POST',
      body: { name: 'Test Context Portfolio', slug: `test-context-${Date.now()}${Math.floor(Math.random() * 1000)}`, ...body },
      ...adminAuth
    })
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
    editorAuth = (await createProgressAdminUser(sql)).auth
    viewerAuth = (await createTranslatorUser(sql)).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('creates a portfolio with every built-in section by default', async () => {
    const portfolio = await createPortfolio({ name: 'Test Context Defaults' })
    expect(portfolio.slug).toMatch(/^test-context-/)

    const { sections } = await $fetch<{ sections: SectionMeta[] }>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections`,
      adminAuth
    )
    expect(sections.map(s => s.key)).toEqual(CONTEXT_SECTIONS.map(s => s.key))
    expect(sections.every(s => !s.has_content)).toBe(true)
  })

  it('resolves built-in titles and descriptions from code, not the database', async () => {
    const portfolio = await createPortfolio({ builtin_sections: ['team'] })

    const stored = await sql`
      SELECT title, description, "order" FROM context_section_definitions
      WHERE portfolio_id = ${portfolio.id} AND key = 'team'
    `
    expect(stored[0]).toMatchObject({ title: null, description: null, order: null })

    const { sections } = await $fetch<{ sections: SectionMeta[] }>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections`,
      adminAuth
    )
    const team = CONTEXT_SECTIONS.find(s => s.key === 'team')!
    expect(sections[0]).toMatchObject({ key: 'team', title: team.title, description: team.description, is_custom: false })
  })

  it('starts with no sections when given an empty list', async () => {
    const portfolio = await createPortfolio({ builtin_sections: [] })
    const { sections } = await $fetch<{ sections: SectionMeta[] }>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections`,
      adminAuth
    )
    expect(sections).toHaveLength(0)
  })

  it('rejects an unknown built-in section key', async () => {
    await expect(createPortfolio({ builtin_sections: ['not-a-section'] })).rejects.toMatchObject({ status: 400 })
  })

  it('generates a unique slug when one collides', async () => {
    const first = await $fetch<Portfolio>('/api/admin/context/portfolios', {
      method: 'POST',
      body: { name: 'Test Context Collision', slug: 'test-context-collision', builtin_sections: [] },
      ...adminAuth
    })
    const second = await $fetch<Portfolio>('/api/admin/context/portfolios', {
      method: 'POST',
      body: { name: 'Test Context Collision', slug: 'test-context-collision', builtin_sections: [] },
      ...adminAuth
    })
    expect(first.slug).toBe('test-context-collision')
    expect(second.slug).toBe('test-context-collision-2')
  })

  it('lets an editor rename a portfolio but not delete it', async () => {
    const portfolio = await createPortfolio({ builtin_sections: [] })

    const renamed = await $fetch<Portfolio>(`/api/admin/context/portfolios/${portfolio.slug}`, {
      method: 'PATCH',
      body: { name: 'Test Context Renamed' },
      ...editorAuth
    })
    expect(renamed.name).toBe('Test Context Renamed')

    // A patch applies only the fields it names, and can clear one with null.
    const recolored = await $fetch<Portfolio>(`/api/admin/context/portfolios/${portfolio.slug}`, {
      method: 'PATCH',
      body: { color: '#123456' },
      ...editorAuth
    })
    expect(recolored).toMatchObject({ name: 'Test Context Renamed', color: '#123456' })

    const cleared = await $fetch<Portfolio>(`/api/admin/context/portfolios/${portfolio.slug}`, {
      method: 'PATCH',
      body: { color: null },
      ...editorAuth
    })
    expect(cleared).toMatchObject({ name: 'Test Context Renamed', color: null })

    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}`, {
      method: 'DELETE',
      ...editorAuth
    })).rejects.toMatchObject({ status: 403 })
  })

  it('lets a viewer read but not write', async () => {
    const portfolio = await createPortfolio({ builtin_sections: ['team'] })

    const read = await $fetch<Portfolio>(`/api/admin/context/portfolios/${portfolio.slug}`, viewerAuth)
    expect(read.id).toBe(portfolio.id)

    await expect($fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'nope' },
      ...viewerAuth
    })).rejects.toMatchObject({ status: 403 })
  })

  it('deletes a portfolio and everything under it', async () => {
    const portfolio = await createPortfolio({ builtin_sections: ['team'] })
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'Ada leads engineering.' },
      ...adminAuth
    })

    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}`, { method: 'DELETE', ...adminAuth })

    const sections = await sql`SELECT id FROM context_sections WHERE portfolio_id = ${portfolio.id}`
    const definitions = await sql`SELECT id FROM context_section_definitions WHERE portfolio_id = ${portfolio.id}`
    expect(sections).toHaveLength(0)
    expect(definitions).toHaveLength(0)
  })

  it('exports the portfolio as a zip', async () => {
    const portfolio = await createPortfolio({ name: 'Test Context Export', builtin_sections: ['team'] })
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'Ada leads engineering.' },
      ...adminAuth
    })

    const zip = await $fetch<Blob>(`/api/admin/context/portfolios/${portfolio.slug}/export`, {
      ...adminAuth,
      responseType: 'blob'
    })
    expect(zip.size).toBeGreaterThan(0)
  })

  it('exports a single section as markdown headed by its title', async () => {
    const portfolio = await createPortfolio({ builtin_sections: ['team'] })
    await $fetch(`/api/admin/context/portfolios/${portfolio.slug}/sections/team`, {
      method: 'PUT',
      body: { content: 'Ada leads engineering.' },
      ...adminAuth
    })

    const markdown = await $fetch<string>(
      `/api/admin/context/portfolios/${portfolio.slug}/sections/team/export`,
      adminAuth
    )
    expect(markdown).toBe('# Team\n\nAda leads engineering.')
  })
})

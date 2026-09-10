/**
 * Section definitions, content, and version history for context portfolios.
 *
 * A portfolio has a section if and only if it has a row in
 * `context_section_definitions`. For a built-in key the row stores just the
 * key and the title/description/order come from `config/context-sections.ts`;
 * a custom row carries its own. Content lives separately in `context_sections`
 * so removing a section keeps what was written under its key.
 */

import { contextDb, type SqlClient } from './context-portfolios'
import {
  CONTEXT_SECTION_KEYS,
  CONTEXT_BUILTIN_MAX_ORDER,
  getDefaultContextSection,
  slugifySectionTitle
} from '../../config/context-sections'

/** Largest section body accepted, in bytes. */
export const MAX_SECTION_BYTES = 100 * 1024

/** How a version came to be: a direct edit, an accepted assistant proposal, or an API client. */
export type ContextVersionSource = 'user' | 'assistant' | 'api'

export interface ContextSectionDefinition {
  id: string
  key: string
  title: string
  description: string
  order: number
  is_custom: boolean
}

export interface ContextSectionRow {
  id: string
  portfolio_id: string
  section_key: string
  content: string
  last_edited_by: string | null
  last_edited_at: string
}

const BUILTIN_KEY_LIST = [...CONTEXT_SECTION_KEYS].join(', ')

/**
 * A stored `order` is the section's absolute position whatever kind it is, so a
 * custom section can sit between two built-ins. With no stored position a
 * built-in sits where the catalog puts it and a custom sits past the last one.
 */
function resolveOrder(key: string, order: number | null): number {
  if (order !== null) return order
  return getDefaultContextSection(key)?.order ?? CONTEXT_BUILTIN_MAX_ORDER + 1
}

/** Every section the portfolio has, catalog defaults filled in, in display order. */
export async function getPortfolioSections(
  portfolioId: string,
  db?: SqlClient
): Promise<ContextSectionDefinition[]> {
  const sql = contextDb(db)
  const rows = await sql`
    SELECT id, key, title, description, "order"
    FROM context_section_definitions
    WHERE portfolio_id = ${portfolioId}
    ORDER BY created_at, key
  ` as unknown as Array<{ id: string, key: string, title: string | null, description: string | null, order: number | null }>

  return rows
    .map((row) => {
      const template = getDefaultContextSection(row.key)
      return {
        id: row.id,
        key: row.key,
        title: row.title ?? template?.title ?? row.key,
        description: row.description ?? template?.description ?? '',
        order: resolveOrder(row.key, row.order),
        is_custom: !template
      }
    })
    // Stable, so sections sharing a position stay in creation order.
    .sort((a, b) => a.order - b.order)
}

export async function isKnownSectionKey(
  portfolioId: string,
  key: string,
  db?: SqlClient
): Promise<boolean> {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT id FROM context_section_definitions
    WHERE portfolio_id = ${portfolioId} AND key = ${key}
  `
  return !!row
}

export async function requireKnownSection(
  portfolioId: string,
  key: string,
  db?: SqlClient
): Promise<void> {
  if (!(await isKnownSectionKey(portfolioId, key, db))) {
    throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })
  }
}

/**
 * Where a section added now should sit. A portfolio the user has ordered
 * explicitly keeps new sections at the end; one still on catalog order stores
 * no position at all and resolves from code.
 */
async function nextExplicitOrder(portfolioId: string, db?: SqlClient): Promise<number | null> {
  const sql = contextDb(db)
  const rows = await sql`
    SELECT key, "order" FROM context_section_definitions WHERE portfolio_id = ${portfolioId}
  ` as unknown as Array<{ key: string, order: number | null }>

  if (!rows.some(r => r.order !== null)) return null
  return Math.max(0, ...rows.map(r => resolveOrder(r.key, r.order))) + 1
}

/**
 * `{ key }` adds a built-in section from the catalog; `{ title }` creates a
 * custom section keyed by the slugified title. Custom keys may not collide with
 * catalog keys, so the key alone tells the two apart.
 */
export type AddSectionInput =
  | { key: string }
  | { title: string, description?: string, order?: number }

export async function addSection(
  portfolioId: string,
  input: AddSectionInput,
  userId: string,
  db?: SqlClient
): Promise<ContextSectionDefinition> {
  const sql = contextDb(db)

  let key: string
  let title: string | null = null
  let description: string | null = null

  if ('key' in input) {
    if (!CONTEXT_SECTION_KEYS.has(input.key)) {
      throw createError({
        statusCode: 400,
        statusMessage: `"${input.key}" is not a built-in section (built-in keys: ${BUILTIN_KEY_LIST}). Pass a title to create a custom section.`
      })
    }
    key = input.key
  } else {
    key = slugifySectionTitle(input.title)
    if (!key) {
      throw createError({ statusCode: 400, statusMessage: 'Title must contain at least one alphanumeric character' })
    }
    if (CONTEXT_SECTION_KEYS.has(key)) {
      throw createError({
        statusCode: 409,
        statusMessage: `Key "${key}" collides with a built-in section — add the built-in "${key}" instead`
      })
    }
    title = input.title
    description = input.description ?? null
  }

  if (await isKnownSectionKey(portfolioId, key, sql)) {
    throw createError({ statusCode: 409, statusMessage: `Section "${key}" already exists in this portfolio` })
  }

  const explicitOrder = ('order' in input ? input.order : undefined) ?? await nextExplicitOrder(portfolioId, sql)

  await sql`
    INSERT INTO context_section_definitions (portfolio_id, key, title, description, "order", created_by)
    VALUES (${portfolioId}, ${key}, ${title}, ${description}, ${explicitOrder}, ${userId})
  `

  const sections = await getPortfolioSections(portfolioId, sql)
  return sections.find(s => s.key === key)!
}

export interface DeleteSectionResult {
  id: string
  is_custom: boolean
  content_retained: boolean
}

/**
 * Remove the definition row. Content saved under the key stays in
 * `context_sections` (with its versions and comments) and resurfaces if a
 * section with the same key is added again.
 */
export async function deleteSection(
  portfolioId: string,
  key: string,
  db?: SqlClient
): Promise<DeleteSectionResult> {
  const sql = contextDb(db)
  const [existing] = await sql`
    SELECT id FROM context_section_definitions
    WHERE portfolio_id = ${portfolioId} AND key = ${key}
  `
  if (!existing) throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })

  const content = await loadSection(portfolioId, key, sql)
  await sql`DELETE FROM context_section_definitions WHERE id = ${existing.id}`

  return {
    id: existing.id as string,
    is_custom: !CONTEXT_SECTION_KEYS.has(key),
    content_retained: (content?.content ?? '').trim().length > 0
  }
}

export interface UpdateSectionDefinitionPatch {
  title?: string
  description?: string
  order?: number
}

export async function updateSectionDefinition(
  portfolioId: string,
  key: string,
  patch: UpdateSectionDefinitionPatch,
  db?: SqlClient
): Promise<ContextSectionDefinition> {
  const sql = contextDb(db)
  const [existing] = await sql`
    SELECT id FROM context_section_definitions
    WHERE portfolio_id = ${portfolioId} AND key = ${key}
  `
  if (!existing) throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })

  if (patch.title !== undefined) {
    await sql`UPDATE context_section_definitions SET title = ${patch.title} WHERE id = ${existing.id}`
  }
  if (patch.description !== undefined) {
    await sql`UPDATE context_section_definitions SET description = ${patch.description} WHERE id = ${existing.id}`
  }
  if (patch.order !== undefined) {
    await sql`UPDATE context_section_definitions SET "order" = ${patch.order} WHERE id = ${existing.id}`
  }
  await sql`UPDATE context_section_definitions SET updated_at = NOW() WHERE id = ${existing.id}`

  const sections = await getPortfolioSections(portfolioId, sql)
  return sections.find(s => s.key === key)!
}

/**
 * Store an explicit position for every section from a full ordering. `keys` must
 * list exactly the portfolio's sections once each; a partial or stale list is
 * rejected rather than applied, so no section can be dropped out of the order by
 * a client working from an old view.
 */
export async function reorderSections(
  portfolioId: string,
  keys: string[],
  db?: SqlClient
): Promise<ContextSectionDefinition[]> {
  const sql = contextDb(db)
  const current = await getPortfolioSections(portfolioId, sql)
  const currentKeys = new Set(current.map(s => s.key))
  const given = new Set(keys)

  if (given.size !== keys.length) {
    throw createError({ statusCode: 400, statusMessage: 'Order lists the same section more than once' })
  }
  const missing = current.filter(s => !given.has(s.key)).map(s => s.key)
  const unknown = keys.filter(k => !currentKeys.has(k))
  if (missing.length > 0 || unknown.length > 0) {
    const detail = [
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
      unknown.length > 0 ? `not in this portfolio: ${unknown.join(', ')}` : ''
    ].filter(Boolean).join('; ')
    throw createError({
      statusCode: 400,
      statusMessage: `Order must list every section in this portfolio exactly once (${detail})`
    })
  }

  for (const [index, key] of keys.entries()) {
    await sql`
      UPDATE context_section_definitions
      SET "order" = ${index + 1}, updated_at = NOW()
      WHERE portfolio_id = ${portfolioId} AND key = ${key}
    `
  }

  return await getPortfolioSections(portfolioId, sql)
}

export async function loadSection(
  portfolioId: string,
  key: string,
  db?: SqlClient
): Promise<ContextSectionRow | null> {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT id, portfolio_id, section_key, content, last_edited_by, last_edited_at
    FROM context_sections
    WHERE portfolio_id = ${portfolioId} AND section_key = ${key}
  `
  return (row as ContextSectionRow) || null
}

export interface SaveSectionOptions {
  /** Stamped on the version row so history can show how the change was made. */
  source: ContextVersionSource
  /** Set false to write content for a key with no definition row. */
  enforceKeyExists?: boolean
}

export interface SaveSectionResult {
  section: ContextSectionRow
  versionId: string
}

/**
 * Upsert the section row and append a version row. Callers wrap this in a
 * transaction so the two writes land together.
 */
export async function saveSectionContent(
  portfolioId: string,
  key: string,
  content: string,
  userId: string,
  options: SaveSectionOptions,
  db?: SqlClient
): Promise<SaveSectionResult> {
  const sql = contextDb(db)

  if (Buffer.byteLength(content, 'utf8') > MAX_SECTION_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Section content exceeds the 100KB limit' })
  }
  if (options.enforceKeyExists !== false) {
    await requireKnownSection(portfolioId, key, sql)
  }

  const [section] = await sql`
    INSERT INTO context_sections (portfolio_id, section_key, content, last_edited_by)
    VALUES (${portfolioId}, ${key}, ${content}, ${userId})
    ON CONFLICT (portfolio_id, section_key) DO UPDATE
      SET content = ${content}, last_edited_by = ${userId}, last_edited_at = NOW()
    RETURNING id, portfolio_id, section_key, content, last_edited_by, last_edited_at
  `

  const [version] = await sql`
    INSERT INTO context_section_versions (section_id, content, edited_by, source)
    VALUES (${section!.id}, ${content}, ${userId}, ${options.source})
    RETURNING id
  `

  return { section: section as ContextSectionRow, versionId: version!.id as string }
}

export interface ContextSectionVersion {
  id: string
  content: string
  edited_at: string
  edited_by: string | null
  edited_by_name: string | null
  source: ContextVersionSource | null
}

export async function listSectionVersions(
  sectionId: string,
  db?: SqlClient
): Promise<ContextSectionVersion[]> {
  const sql = contextDb(db)
  return await sql`
    SELECT v.id, v.content, v.edited_at, v.edited_by, v.source, u.display_name AS edited_by_name
    FROM context_section_versions v
    LEFT JOIN users u ON u.id = v.edited_by
    WHERE v.section_id = ${sectionId}
    ORDER BY v.edited_at DESC
  ` as unknown as ContextSectionVersion[]
}

export async function getSectionVersion(
  sectionId: string,
  versionId: string,
  db?: SqlClient
): Promise<{ id: string, content: string } | null> {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT id, content FROM context_section_versions
    WHERE id = ${versionId} AND section_id = ${sectionId}
  `
  return (row as { id: string, content: string }) || null
}

export interface SectionListItem extends ContextSectionDefinition {
  word_count: number
  has_content: boolean
  last_edited_at: string | null
  last_edited_by: string | null
  last_edited_by_name: string | null
}

export function countWords(content: string): number {
  const trimmed = content.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Section definitions joined with content metadata, for list views. */
export async function listSectionsWithMeta(
  portfolioId: string,
  db?: SqlClient
): Promise<SectionListItem[]> {
  const sql = contextDb(db)
  const definitions = await getPortfolioSections(portfolioId, sql)
  const rows = await sql`
    SELECT s.section_key, s.content, s.last_edited_at, s.last_edited_by,
           u.display_name AS last_edited_by_name
    FROM context_sections s
    LEFT JOIN users u ON u.id = s.last_edited_by
    WHERE s.portfolio_id = ${portfolioId}
  ` as unknown as Array<{
    section_key: string
    content: string
    last_edited_at: string
    last_edited_by: string | null
    last_edited_by_name: string | null
  }>

  const byKey = new Map(rows.map(r => [r.section_key, r]))
  return definitions.map((definition) => {
    const row = byKey.get(definition.key)
    const content = row?.content ?? ''
    return {
      ...definition,
      word_count: countWords(content),
      has_content: content.trim().length > 0,
      last_edited_at: row?.last_edited_at ?? null,
      last_edited_by: row?.last_edited_by ?? null,
      last_edited_by_name: row?.last_edited_by_name ?? null
    }
  })
}

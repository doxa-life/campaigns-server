import type { TransactionSql } from 'postgres'
import { getSql } from './db'
import { CONTEXT_SECTIONS, CONTEXT_SECTION_KEYS } from '../../config/context-sections'

/**
 * A postgres.js tagged-template client — the pool, or a transaction handle from
 * `sql.begin`. Every function here takes one so callers that must write several
 * tables atomically pass their transaction in.
 */
export type SqlClient = TransactionSql

export function contextDb(db?: SqlClient): SqlClient {
  return db ?? (getSql() as unknown as SqlClient)
}

/**
 * Run `fn` inside one transaction. Used wherever a request writes more than one
 * table — creating a portfolio with its sections, saving content alongside its
 * version row — so a failure part-way leaves nothing behind.
 */
export async function contextTransaction<T>(fn: (sql: SqlClient) => Promise<T>): Promise<T> {
  const pool = getSql() as unknown as { begin: (cb: (tx: SqlClient) => Promise<T>) => Promise<T> }
  return await pool.begin(async tx => await fn(tx))
}

export interface ContextPortfolio {
  id: string
  slug: string
  name: string
  color: string | null
  icon_url: string | null
  created_at: string
  updated_at: string
}

const COLUMNS = 'id, slug, name, color, icon_url, created_at, updated_at'

export async function getPortfolioBySlug(slug: string, db?: SqlClient): Promise<ContextPortfolio | null> {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM context_portfolios WHERE slug = ${slug}
  `
  return (row as ContextPortfolio) || null
}

export async function getPortfolioById(id: string, db?: SqlClient): Promise<ContextPortfolio | null> {
  const sql = contextDb(db)
  const [row] = await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM context_portfolios WHERE id = ${id}
  `
  return (row as ContextPortfolio) || null
}

export async function getPortfolioBySlugOr404(slug: string, db?: SqlClient): Promise<ContextPortfolio> {
  const portfolio = await getPortfolioBySlug(slug, db)
  if (!portfolio) {
    throw createError({ statusCode: 404, statusMessage: 'Portfolio not found' })
  }
  return portfolio
}

export async function listPortfolios(db?: SqlClient): Promise<ContextPortfolio[]> {
  const sql = contextDb(db)
  return await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM context_portfolios ORDER BY name ASC
  ` as unknown as ContextPortfolio[]
}

/**
 * Turn a free-text name into a slug. Falls back to `portfolio` when the name
 * yields no safe characters; the caller resolves collisions.
 */
export function slugifyPortfolioName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base.length >= 2 ? base : 'portfolio'
}

export async function ensureUniqueSlug(desired: string, db?: SqlClient): Promise<string> {
  const sql = contextDb(db)
  let slug = desired
  for (let n = 2; n <= 1000; n++) {
    const [existing] = await sql`SELECT id FROM context_portfolios WHERE slug = ${slug}`
    if (!existing) return slug
    slug = `${desired}-${n}`
  }
  throw createError({ statusCode: 500, statusMessage: 'Could not generate a unique slug' })
}

export interface CreatePortfolioInput {
  name: string
  color?: string | null
  slug?: string
  /**
   * Built-in section keys the portfolio starts with. Undefined means every
   * catalog section; an empty array means none. Sections can be added or
   * removed afterwards.
   */
  builtin_sections?: string[]
}

/**
 * Insert the portfolio plus one definition row per chosen built-in section.
 * The catalog is the template applied here; it is never consulted again for
 * an existing portfolio.
 */
export async function createPortfolio(
  input: CreatePortfolioInput,
  userId: string,
  db?: SqlClient
): Promise<ContextPortfolio> {
  const sql = contextDb(db)
  const keys = input.builtin_sections === undefined
    ? CONTEXT_SECTIONS.map(s => s.key)
    : [...new Set(input.builtin_sections)]

  const unknown = keys.filter(k => !CONTEXT_SECTION_KEYS.has(k))
  if (unknown.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unknown built-in section(s): ${unknown.join(', ')}. Valid keys: ${[...CONTEXT_SECTION_KEYS].join(', ')}`
    })
  }

  const slug = await ensureUniqueSlug(input.slug ?? slugifyPortfolioName(input.name), sql)
  const [inserted] = await sql`
    INSERT INTO context_portfolios (slug, name, color)
    VALUES (${slug}, ${input.name}, ${input.color ?? null})
    RETURNING ${sql.unsafe(COLUMNS)}
  `

  const portfolio = inserted as ContextPortfolio
  for (const key of keys) {
    await sql`
      INSERT INTO context_section_definitions (portfolio_id, key, created_by)
      VALUES (${portfolio.id}, ${key}, ${userId})
    `
  }

  return portfolio
}

export interface UpdatePortfolioPatch {
  name?: string
  color?: string | null
  icon_url?: string | null
}

/** Applies only the fields present on `patch`; an absent field is left alone. */
export async function updatePortfolio(
  id: string,
  patch: UpdatePortfolioPatch,
  db?: SqlClient
): Promise<ContextPortfolio> {
  const sql = contextDb(db)
  const fields = ['name', 'color', 'icon_url'].filter(f => f in patch)
  if (fields.length === 0) {
    const current = await getPortfolioById(id, sql)
    if (!current) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found' })
    return current
  }

  const [row] = await sql`
    UPDATE context_portfolios
    SET ${sql(patch as Record<string, unknown>, ...fields)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING ${sql.unsafe(COLUMNS)}
  `
  return row as ContextPortfolio
}

export async function deletePortfolio(id: string, db?: SqlClient): Promise<boolean> {
  const sql = contextDb(db)
  const result = await sql`DELETE FROM context_portfolios WHERE id = ${id}`
  return result.count > 0
}

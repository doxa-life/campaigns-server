import type { Fragment, Sql } from 'postgres'
import type { FieldType, FilterRow, FilterState, Operator } from '#shared/crm/filter-types'

export interface ServerFieldDef {
  type: FieldType
  buildSql: (op: Operator, value: unknown, sql: Sql) => Fragment | null
}

export type ServerManifest = Record<string, ServerFieldDef>

export function buildFilterConditions(
  manifest: ServerManifest,
  state: FilterState | null | undefined,
  sql: Sql
): Fragment[] {
  if (!state || state.rows.length === 0) return []
  const conditions: Fragment[] = []
  for (const row of state.rows) {
    const def = manifest[row.field]
    if (!def) continue
    const fragment = def.buildSql(row.op, row.value, sql)
    if (fragment) conditions.push(fragment)
  }
  return conditions
}

// Helper builders for common field shapes. `column` is interpolated as an
// identifier via sql(string) — safe because each builder is only called with
// a hard-coded column name from the server-side manifest, never user input.

export function textColumn(column: string) {
  return (op: Operator, value: unknown, sql: Sql): Fragment | null => {
    if (op === 'empty') return sql`(${sql(column)} IS NULL OR ${sql(column)} = '')`
    if (op === 'not_empty') return sql`(${sql(column)} IS NOT NULL AND ${sql(column)} <> '')`
    if (typeof value !== 'string' || value.length === 0) return null
    if (op === 'contains') return sql`${sql(column)} ILIKE ${'%' + value + '%'}`
    if (op === 'starts_with') return sql`${sql(column)} ILIKE ${value + '%'}`
    if (op === 'eq') return sql`LOWER(${sql(column)}) = LOWER(${value})`
    return null
  }
}

export function enumColumn(column: string) {
  return (op: Operator, value: unknown, sql: Sql): Fragment | null => {
    if (value === null || value === undefined || value === '') return null
    if (op === 'is') return sql`${sql(column)} = ${value as any}`
    if (op === 'is_not') return sql`(${sql(column)} IS DISTINCT FROM ${value as any})`
    return null
  }
}

export function arrayEnumColumn(column: string) {
  return (op: Operator, value: unknown, sql: Sql): Fragment | null => {
    const values = Array.isArray(value) ? value : value != null ? [value] : []
    if (values.length === 0) return null
    if (op === 'includes_any') return sql`${sql(column)} && ${sql.array(values as any[])}`
    if (op === 'includes_all') return sql`${sql(column)} @> ${sql.array(values as any[])}`
    if (op === 'excludes') return sql`NOT (${sql(column)} && ${sql.array(values as any[])})`
    return null
  }
}

export function dateColumn(column: string) {
  return (op: Operator, value: unknown, sql: Sql): Fragment | null => {
    if (op === 'before' && typeof value === 'string') return sql`${sql(column)} < ${value}`
    if (op === 'after' && typeof value === 'string') return sql`${sql(column)} >= ${value}`
    if (op === 'between' && Array.isArray(value) && value.length === 2) {
      const [from, to] = value as [string, string]
      if (typeof from === 'string' && typeof to === 'string') {
        return sql`${sql(column)} >= ${from} AND ${sql(column)} < ${to}`
      }
    }
    return null
  }
}

export function numberColumn(column: string) {
  return (op: Operator, value: unknown, sql: Sql): Fragment | null => {
    if (op === 'between' && Array.isArray(value) && value.length === 2) {
      const [lo, hi] = (value as [unknown, unknown]).map(v => Number(v)) as [number, number]
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        return sql`${sql(column)} BETWEEN ${lo} AND ${hi}`
      }
      return null
    }
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num)) return null
    if (op === 'eq') return sql`${sql(column)} = ${num}`
    if (op === 'neq') return sql`${sql(column)} <> ${num}`
    if (op === 'gt') return sql`${sql(column)} > ${num}`
    if (op === 'lt') return sql`${sql(column)} < ${num}`
    return null
  }
}

export function booleanColumn(column: string) {
  return (op: Operator, _value: unknown, sql: Sql): Fragment | null => {
    if (op === 'is_true') return sql`${sql(column)} = TRUE`
    if (op === 'is_false') return sql`(${sql(column)} IS NOT TRUE)`
    return null
  }
}

export function _rowsForTest(state: FilterState | null | undefined): FilterRow[] {
  return state?.rows ?? []
}

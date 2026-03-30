import type { Sql, Fragment } from 'postgres'

export function buildWhere(sql: Sql, conditions: Fragment[]): Fragment {
  if (conditions.length === 0) return sql``
  let combined = conditions[0]!
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} AND ${conditions[i]!}`
  }
  return sql`WHERE ${combined}`
}

export function buildSet(sql: Sql, fields: Fragment[]): Fragment {
  let combined = fields[0]!
  for (let i = 1; i < fields.length; i++) {
    combined = sql`${combined}, ${fields[i]!}`
  }
  return combined
}

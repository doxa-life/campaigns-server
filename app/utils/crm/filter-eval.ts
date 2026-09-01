import type { FieldType, FilterRow, FilterState } from '#shared/crm/filter-types'
import type { ClientManifest } from './filter-manifest'

// Client-side twin of server/utils/crm/filter-sql.ts for lists that load all
// rows up front. Rows with a missing/invalid filter value are inert (match
// everything), mirroring the SQL builders returning null.
export function matchesFilter(
  item: Record<string, any>,
  state: FilterState | null | undefined,
  manifest: ClientManifest,
  getValue: (item: Record<string, any>, key: string) => unknown = (it, key) => it[key]
): boolean {
  if (!state || state.rows.length === 0) return true
  for (const row of state.rows) {
    const def = manifest.find(f => f.key === row.field)
    if (!def) continue
    if (!matchesRow(getValue(item, row.field), def.type, row)) return false
  }
  return true
}

function toNumber(value: unknown): number {
  return value === null || value === undefined || value === '' ? NaN : Number(value)
}

function matchesRow(raw: unknown, type: FieldType, row: FilterRow): boolean {
  switch (type) {
    case 'text': {
      const itemText = raw === null || raw === undefined ? '' : String(raw)
      if (row.op === 'empty') return itemText === ''
      if (row.op === 'not_empty') return itemText !== ''
      if (typeof row.value !== 'string' || row.value.length === 0) return true
      const a = itemText.toLowerCase()
      const b = row.value.toLowerCase()
      if (row.op === 'contains') return a.includes(b)
      if (row.op === 'starts_with') return a.startsWith(b)
      if (row.op === 'eq') return a === b
      return true
    }

    case 'number': {
      if (row.op === 'between') {
        if (!Array.isArray(row.value) || row.value.length !== 2) return true
        const [lo, hi] = (row.value as unknown[]).map(toNumber) as [number, number]
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return true
        const n = toNumber(raw)
        return Number.isFinite(n) && n >= lo && n <= hi
      }
      const v = toNumber(row.value)
      if (!Number.isFinite(v)) return true
      const n = toNumber(raw)
      if (!Number.isFinite(n)) return false
      if (row.op === 'eq') return n === v
      if (row.op === 'neq') return n !== v
      if (row.op === 'gt') return n > v
      if (row.op === 'lt') return n < v
      return true
    }

    case 'date': {
      const t = raw ? new Date(raw as any).getTime() : NaN
      if (row.op === 'between') {
        if (!Array.isArray(row.value) || row.value.length !== 2) return true
        const [from, to] = row.value as [unknown, unknown]
        if (typeof from !== 'string' || !from || typeof to !== 'string' || !to) return true
        return Number.isFinite(t) && t >= Date.parse(from) && t < Date.parse(to)
      }
      if (typeof row.value !== 'string' || row.value.length === 0) return true
      const v = Date.parse(row.value)
      if (!Number.isFinite(v)) return true
      if (!Number.isFinite(t)) return false
      if (row.op === 'before') return t < v
      if (row.op === 'after') return t >= v
      return true
    }

    case 'boolean': {
      if (row.op === 'is_true') return raw === true
      if (row.op === 'is_false') return raw !== true
      return true
    }

    case 'enum':
    case 'foreign-key': {
      if (row.value === null || row.value === undefined || row.value === '') return true
      if (row.op === 'is') return raw === row.value
      if (row.op === 'is_not') return raw !== row.value
      return true
    }

    case 'enum-multi': {
      const selected = Array.isArray(row.value) ? row.value : row.value != null ? [row.value] : []
      if (selected.length === 0) return true
      const itemValues = Array.isArray(raw) ? raw : []
      if (row.op === 'includes_any') return selected.some(v => itemValues.includes(v))
      if (row.op === 'includes_all') return selected.every(v => itemValues.includes(v))
      if (row.op === 'excludes') return !selected.some(v => itemValues.includes(v))
      return true
    }
  }
  return true
}

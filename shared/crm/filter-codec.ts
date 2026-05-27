import type { FilterState, FilterRow } from './filter-types'
import { EMPTY_FILTER } from './filter-types'

function toBase64Url(s: string): string {
  const base64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf-8').toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return typeof atob !== 'undefined'
    ? decodeURIComponent(escape(atob(padded + pad)))
    : Buffer.from(padded + pad, 'base64').toString('utf-8')
}

export function encodeFilter(state: FilterState | null | undefined): string {
  if (!state || state.rows.length === 0) return ''
  return toBase64Url(JSON.stringify({ v: state.v, rows: state.rows }))
}

export function decodeFilter(encoded: string | null | undefined): FilterState {
  if (!encoded) return { ...EMPTY_FILTER }
  try {
    const raw = fromBase64Url(encoded)
    const parsed = JSON.parse(raw)
    if (parsed?.v !== 1 || !Array.isArray(parsed.rows)) return { ...EMPTY_FILTER }
    const rows: FilterRow[] = []
    for (const r of parsed.rows) {
      if (typeof r?.field === 'string' && typeof r?.op === 'string') {
        rows.push({ field: r.field, op: r.op, value: r.value })
      }
    }
    return { v: 1, rows }
  } catch {
    return { ...EMPTY_FILTER }
  }
}

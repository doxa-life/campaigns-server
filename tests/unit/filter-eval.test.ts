import { describe, it, expect } from 'vitest'
import { matchesFilter } from '~/utils/crm/filter-eval'
import type { ClientManifest } from '~/utils/crm/filter-manifest'
import type { FilterState, FilterRow } from '#shared/crm/filter-types'

const manifest: ClientManifest = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'status', label: 'Status', type: 'enum', values: [] },
  { key: 'population', label: 'Population', type: 'number' },
  { key: 'created_at', label: 'Created', type: 'date' },
  { key: 'adopted', label: 'Adopted', type: 'boolean' },
  { key: 'tags', label: 'Tags', type: 'enum-multi', values: [] },
]

function state(...rows: FilterRow[]): FilterState {
  return { v: 1, rows }
}

const group = {
  name: 'Fumbira',
  status: 'archived',
  population: 12000,
  created_at: '2026-03-10T08:00:00.000Z',
  adoption_count: 2,
  tags: ['print-deck', 'priority'],
}

const getValue = (item: Record<string, any>, key: string) =>
  key === 'adopted' ? item.adoption_count > 0 : item[key]

describe('matchesFilter', () => {
  it('matches everything with an empty filter', () => {
    expect(matchesFilter(group, state(), manifest, getValue)).toBe(true)
    expect(matchesFilter(group, null, manifest, getValue)).toBe(true)
  })

  it('text ops are case-insensitive', () => {
    expect(matchesFilter(group, state({ field: 'name', op: 'contains', value: 'fum' }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'name', op: 'starts_with', value: 'FUM' }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'name', op: 'eq', value: 'fumbira' }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'name', op: 'contains', value: 'zzz' }), manifest)).toBe(false)
  })

  it('text empty/not_empty treat null and "" the same', () => {
    expect(matchesFilter({ name: null }, state({ field: 'name', op: 'empty', value: undefined }), manifest)).toBe(true)
    expect(matchesFilter({ name: '' }, state({ field: 'name', op: 'empty', value: undefined }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'name', op: 'not_empty', value: undefined }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'name', op: 'empty', value: undefined }), manifest)).toBe(false)
  })

  it('enum is / is_not', () => {
    expect(matchesFilter(group, state({ field: 'status', op: 'is', value: 'archived' }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'status', op: 'is', value: 'active' }), manifest)).toBe(false)
    expect(matchesFilter(group, state({ field: 'status', op: 'is_not', value: 'active' }), manifest)).toBe(true)
    expect(matchesFilter({ status: null }, state({ field: 'status', op: 'is_not', value: 'active' }), manifest)).toBe(true)
  })

  it('number ops coerce string values from the wire', () => {
    expect(matchesFilter({ population: '12000' }, state({ field: 'population', op: 'eq', value: 12000 }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'population', op: 'gt', value: 10000 }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'population', op: 'lt', value: 10000 }), manifest)).toBe(false)
    expect(matchesFilter(group, state({ field: 'population', op: 'between', value: [10000, 15000] }), manifest)).toBe(true)
    expect(matchesFilter({ population: null }, state({ field: 'population', op: 'neq', value: 5 }), manifest)).toBe(false)
  })

  it('date before / after / between', () => {
    expect(matchesFilter(group, state({ field: 'created_at', op: 'after', value: '2026-03-10' }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'created_at', op: 'before', value: '2026-03-10' }), manifest)).toBe(false)
    expect(matchesFilter(group, state({ field: 'created_at', op: 'between', value: ['2026-03-01', '2026-03-11'] }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'created_at', op: 'between', value: ['2026-03-11', '2026-03-20'] }), manifest)).toBe(false)
  })

  it('boolean uses the derived getter', () => {
    expect(matchesFilter(group, state({ field: 'adopted', op: 'is_true', value: undefined }), manifest, getValue)).toBe(true)
    expect(matchesFilter({ adoption_count: 0 }, state({ field: 'adopted', op: 'is_true', value: undefined }), manifest, getValue)).toBe(false)
    expect(matchesFilter({ adoption_count: 0 }, state({ field: 'adopted', op: 'is_false', value: undefined }), manifest, getValue)).toBe(true)
  })

  it('enum-multi includes_any / includes_all / excludes', () => {
    expect(matchesFilter(group, state({ field: 'tags', op: 'includes_any', value: ['priority', 'other'] }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'tags', op: 'includes_all', value: ['priority', 'print-deck'] }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'tags', op: 'includes_all', value: ['priority', 'other'] }), manifest)).toBe(false)
    expect(matchesFilter(group, state({ field: 'tags', op: 'excludes', value: ['other'] }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'tags', op: 'excludes', value: ['priority'] }), manifest)).toBe(false)
  })

  it('rows with missing filter values are inert, unknown fields are skipped', () => {
    expect(matchesFilter(group, state({ field: 'name', op: 'contains', value: '' }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'status', op: 'is', value: undefined }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'population', op: 'between', value: [null, null] }), manifest)).toBe(true)
    expect(matchesFilter(group, state({ field: 'nope', op: 'is', value: 'x' }), manifest)).toBe(true)
  })

  it('ANDs multiple rows together', () => {
    const both = state(
      { field: 'status', op: 'is', value: 'archived' },
      { field: 'population', op: 'gt', value: 10000 }
    )
    expect(matchesFilter(group, both, manifest)).toBe(true)
    const conflicting = state(
      { field: 'status', op: 'is', value: 'archived' },
      { field: 'population', op: 'lt', value: 10000 }
    )
    expect(matchesFilter(group, conflicting, manifest)).toBe(false)
  })
})

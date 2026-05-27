export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'enum'
  | 'enum-multi'
  | 'foreign-key'

export type TextOp = 'contains' | 'eq' | 'starts_with' | 'empty' | 'not_empty'
export type NumberOp = 'eq' | 'neq' | 'gt' | 'lt' | 'between'
export type DateOp = 'before' | 'after' | 'between'
export type BooleanOp = 'is_true' | 'is_false'
export type EnumOp = 'is' | 'is_not'
export type EnumMultiOp = 'includes_any' | 'includes_all' | 'excludes'
export type ForeignKeyOp = 'is' | 'is_not'

export type Operator =
  | TextOp
  | NumberOp
  | DateOp
  | BooleanOp
  | EnumOp
  | EnumMultiOp
  | ForeignKeyOp

export interface FilterRow {
  field: string
  op: Operator
  value: unknown
}

export interface FilterState {
  v: 1
  rows: FilterRow[]
}

export const EMPTY_FILTER: FilterState = { v: 1, rows: [] }

export function isEmptyFilter(state: FilterState | null | undefined): boolean {
  return !state || state.rows.length === 0
}
